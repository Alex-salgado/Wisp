import os
import gc
import time
import threading
import numpy as np

# Registrar caminhos de DLLs CUDA
for path in [
    r"C:\Projetos_IA\Wisp\.venv\Lib\site-packages",
    r"C:\Projetos_IA\Wisp_web\.venv\Lib\site-packages",
    r"C:\Users\Alex\AppData\Local\Programs\Python",
    r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA"
]:
    if os.path.exists(path):
        for root, dirs, files in os.walk(path):
            if any(f.startswith("cublas64_") or f.startswith("cudnn64_") for f in files):
                if hasattr(os, "add_dll_directory"):
                    try:
                        os.add_dll_directory(root)
                    except Exception:
                        pass
                os.environ["PATH"] = root + os.pathsep + os.environ.get("PATH", "")

from faster_whisper import WhisperModel
from config import cfg

class WhisperEngine:
    def __init__(self):
        self.model = None
        self.current_model_name = ""
        self.device = cfg.get("ai_model", {}).get("device", "cuda")
        self.compute_type = cfg.get("ai_model", {}).get("compute_type", "float16")
        self.lock = threading.Lock()
        self.is_loading = False

    def resolve_model_name(self, name: str) -> str:
        lower = (name or "").lower()
        if "medium" in lower:
            return "medium"
        elif "large" in lower and "turbo" in lower:
            return "large-v3-turbo"
        elif "large" in lower:
            return "large-v3"
        elif "tiny" in lower:
            return "tiny"
        elif "base" in lower:
            return "base"
        return cfg.get("ai_model", {}).get("default_model", "small")

    def load_model(self, model_name: str = None) -> dict:
        if not model_name:
            model_name = cfg.get("ai_model", {}).get("default_model", "small")

        with self.lock:
            resolved = self.resolve_model_name(model_name)
            if self.model is not None and self.current_model_name == resolved:
                return {
                    "status": "ready",
                    "model": resolved,
                    "device": self.device,
                    "compute_type": self.compute_type
                }

            self.is_loading = True
            t0 = time.time()
            models_dir = cfg.get_models_dir()
            print(f"[WhisperEngine] Carregando modelo '{resolved}' na GPU NVIDIA RTX 5060 (diretório: {models_dir})...")

            # Libera VRAM / RAM do modelo anterior
            if self.model is not None:
                del self.model
                self.model = None
                gc.collect()

            # Tentativa 1: NVIDIA CUDA (RTX 5060) em float16
            try:
                # Primeiro tenta carregar do models_dir local; se ausente, tenta cache ou baixa para models_dir
                self.model = WhisperModel(
                    resolved,
                    device="cuda",
                    compute_type="float16",
                    download_root=models_dir
                )
                self.device = "cuda"
                self.compute_type = "float16"
                print(f"[WhisperEngine] Modelo '{resolved}' pronto na GPU NVIDIA CUDA em {time.time() - t0:.2f}s!")
            except Exception as e:
                print(f"[WhisperEngine] Falha ao carregar na pasta local ({e}), tentando cache global HuggingFace...")
                try:
                    self.model = WhisperModel(
                        resolved,
                        device="cuda",
                        compute_type="float16"
                    )
                    self.device = "cuda"
                    self.compute_type = "float16"
                    print(f"[WhisperEngine] Modelo '{resolved}' pronto na GPU via cache global em {time.time() - t0:.2f}s!")
                except Exception as e2:
                    print(f"[WhisperEngine] CUDA não disponível ({e2}). Recorrendo à CPU int8...")
                    try:
                        self.model = WhisperModel(
                            resolved,
                            device="cpu",
                            compute_type="int8",
                            cpu_threads=4,
                            download_root=models_dir
                        )
                        self.device = "cpu"
                        self.compute_type = "int8"
                        print(f"[WhisperEngine] Modelo '{resolved}' carregado na CPU em {time.time() - t0:.2f}s!")
                    except Exception as e3:
                        self.is_loading = False
                        raise RuntimeError(f"Falha ao carregar modelo: GPU ({e2}) | CPU ({e3})")

            self.current_model_name = resolved
            self.is_loading = False

            return {
                "status": "ready",
                "model": resolved,
                "device": self.device,
                "compute_type": self.compute_type,
                "load_time_s": round(time.time() - t0, 2)
            }

    def transcribe(self, audio_data, language: str = None, beam_size: int = 1) -> dict:
        t0 = time.time()
        if self.model is None:
            self.load_model()

        # Converte entrada para array numpy float32 16kHz
        if isinstance(audio_data, (bytes, bytearray)):
            audio_np = np.frombuffer(audio_data, dtype=np.float32)
        elif isinstance(audio_data, list):
            audio_np = np.array(audio_data, dtype=np.float32)
        elif isinstance(audio_data, np.ndarray):
            audio_np = audio_data.astype(np.float32)
        else:
            raise ValueError("Formato de áudio inválido")

        if len(audio_np) == 0:
            return {"text": "", "segments": [], "latency_ms": 0}

        # Trunca buffer excessivo por segurança (limite de 30 segundos por chunk contínuo)
        if len(audio_np) > 480000:
            audio_np = audio_np[:480000]

        if not language:
            language = cfg.get("dictation", {}).get("language", "pt")

        lang_code = language.lower() if language else "pt"
        if lang_code in ["portuguese", "pt-br"]:
            lang_code = "pt"
        elif lang_code in ["english"]:
            lang_code = "en"
        elif lang_code in ["spanish"]:
            lang_code = "es"

        text_result = ""
        segments_list = []

        with self.lock:
            segments, _ = self.model.transcribe(
                audio_np,
                language=lang_code if lang_code in ["pt", "en", "es"] else "pt",
                beam_size=beam_size,
                temperature=0.0,
                condition_on_previous_text=False,
                vad_filter=False
            )

            seg_texts = []
            for s in segments:
                t = s.text.strip()
                if t:
                    seg_texts.append(t)
                    segments_list.append({
                        "start": round(s.start, 2),
                        "end": round(s.end, 2),
                        "text": t
                    })
            text_result = " ".join(seg_texts).strip()

        latency_ms = round((time.time() - t0) * 1000)

        return {
            "text": text_result,
            "segments": segments_list,
            "latency_ms": latency_ms,
            "device": self.device,
            "model": self.current_model_name
        }

# Instância singleton global
whisper_engine = WhisperEngine()
