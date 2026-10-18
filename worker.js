// Web Worker para Inferência de Reconhecimento de Voz 100% In-Browser (Client-Side)
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm";

// Configurações do ambiente
env.allowLocalModels = false;
env.useBrowserCache = true;

// Configurar fallback para WASM sem exigir SharedArrayBuffer
try {
    if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
        env.backends.onnx.wasm.numThreads = 1;
    }
} catch (_) {}

let transcriber = null;
let currentModel = "";
let isInitializing = false;

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    if (type === "LOAD_MODEL") {
        const modelName = payload.modelName || "Xenova/whisper-tiny";
        if (transcriber && currentModel === modelName) {
            self.postMessage({ type: "MODEL_READY", payload: { modelName } });
            return;
        }

        try {
            isInitializing = true;
            self.postMessage({ 
                type: "STATUS_UPDATE", 
                payload: { status: "Carregando modelo de IA no navegador...", isBusy: true } 
            });

            currentModel = modelName;
            transcriber = await pipeline("automatic-speech-recognition", modelName, {
                quantized: true,
                progress_callback: (progressData) => {
                    self.postMessage({ 
                        type: "MODEL_PROGRESS", 
                        payload: progressData 
                    });
                }
            });

            isInitializing = false;
            self.postMessage({ 
                type: "MODEL_READY", 
                payload: { modelName } 
            });
            self.postMessage({ 
                type: "STATUS_UPDATE", 
                payload: { status: "Modelo pronto na memória local", isBusy: false } 
            });
        } catch (err) {
            isInitializing = false;
            const errMsg = (err && err.message) ? err.message : String(err);
            console.error("Erro no Worker ao carregar modelo:", err);
            self.postMessage({ 
                type: "ERROR", 
                payload: { message: "Erro ao carregar modelo: " + errMsg } 
            });
        }
    } 
    else if (type === "TRANSCRIBE") {
        if (!transcriber) {
            self.postMessage({ 
                type: "ERROR", 
                payload: { message: "Modelo ainda não carregado!" } 
            });
            return;
        }

        const { audioFloat32, duration, initialPrompt, language } = payload;
        const t0 = performance.now();

        try {
            self.postMessage({ 
                type: "STATUS_UPDATE", 
                payload: { status: "Transcrevendo fala...", isBusy: true } 
            });

            const output = await transcriber(audioFloat32, {
                language: language || "portuguese",
                task: "transcribe",
                initial_prompt: initialPrompt || "",
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: false
            });

            const latency = Math.round(performance.now() - t0);
            const rawText = output && output.text ? output.text.trim() : "";

            self.postMessage({
                type: "TRANSCRIBE_SUCCESS",
                payload: {
                    rawText,
                    duration,
                    latency
                }
            });

            self.postMessage({ 
                type: "STATUS_UPDATE", 
                payload: { status: "Pronto para ouvir", isBusy: false } 
            });
        } catch (err) {
            const errMsg = (err && err.message) ? err.message : String(err);
            console.error("Erro na transcrição:", err);
            self.postMessage({ 
                type: "ERROR", 
                payload: { message: "Erro ao transcrever: " + errMsg } 
            });
            self.postMessage({ 
                type: "STATUS_UPDATE", 
                payload: { status: "Pronto", isBusy: false } 
            });
        }
    }
};
