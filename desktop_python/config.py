import os
import sys
import yaml

if getattr(sys, 'frozen', False):
    APP_DIR = os.path.dirname(sys.executable)
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))

CONFIG_PATH = os.path.join(APP_DIR, "config.yaml")

DEFAULT_CONFIG_YAML = """# ==========================================================
# WISP DESKTOP - CONFIGURAÇÕES GERAIS (100% LOCAL & PRIVADO)
# ==========================================================
# Edite este arquivo para personalizar o comportamento do Wisp.

server:
  host: "127.0.0.1"
  port: 28940             # Porta base recomendada (fora do padrão 5000)
  auto_port: true         # Se a porta estiver em uso, busca a próxima automaticamente

ai_model:
  default_model: "small"       # Opções: tiny, base, small, medium, large-v3-turbo
  device: "cuda"               # cuda (NVIDIA RTX 5060) ou cpu
  compute_type: "float16"      # float16 (GPU) ou int8 (CPU)
  models_dir: "./models"       # Pasta onde os modelos baixados ficam salvos

dictation:
  language: "pt"               # pt (Português), en (Inglês), es (Espanhol)
  global_hotkey: "Ctrl+F8"     # Atalho global do Windows para alternar microfone
  inject_at_cursor: true       # Digitar onde o ponteiro do mouse estiver apontando
  click_before_type: false     # Clicar para focar antes de digitar (deixe false para digitação contínua)
  silence_threshold: 0.015     # Sensibilidade de ruído da sala (ajustável na interface)
  pause_duration: 0.75         # Segundos de silêncio para concluir frase
  voice_enter: true            # Executar Enter ao falar "entra"
  voice_punctuation: true      # Pontuação falada ("ponto final", "vírgula", etc.)
  sound_feedback: true         # Beeps sonoros de microfone ligado/desligado

ui:
  window_width: 1080
  window_height: 780
  theme: "dark_glass"
"""

class ConfigManager:
    def __init__(self):
        self.config = {}
        self.load()

    def load(self):
        if not os.path.exists(CONFIG_PATH):
            try:
                with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                    f.write(DEFAULT_CONFIG_YAML)
            except Exception as e:
                print(f"[Config] Aviso ao criar config.yaml padrão: {e}")

        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                self.config = yaml.safe_load(f) or {}
        except Exception as e:
            print(f"[Config] Erro ao ler {CONFIG_PATH}: {e}. Usando padrões.")
            self.config = yaml.safe_load(DEFAULT_CONFIG_YAML)

        # Garantir pastas configuradas
        models_dir = self.get_models_dir()
        os.makedirs(models_dir, exist_ok=True)
        data_dir = self.get_data_dir()
        os.makedirs(data_dir, exist_ok=True)

    def save(self):
        try:
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                yaml.dump(self.config, f, default_flow_style=False, allow_unicode=True)
        except Exception as e:
            print(f"[Config] Erro ao salvar config.yaml: {e}")

    def get(self, key, default=None):
        return self.config.get(key, default)

    def get_models_dir(self):
        raw = self.config.get("ai_model", {}).get("models_dir", "./models")
        if os.path.isabs(raw):
            return raw
        return os.path.abspath(os.path.join(APP_DIR, raw))

    def get_data_dir(self):
        return os.path.abspath(os.path.join(APP_DIR, "data"))

    def get_user_profile_path(self):
        return os.path.join(self.get_data_dir(), "user_profile.json")

cfg = ConfigManager()
