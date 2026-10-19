// Web Worker para Inferência de Reconhecimento de Voz 100% In-Browser (Client-Side)
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm";

// Configurações do ambiente
env.allowLocalModels = false;
env.useBrowserCache = true;

// Configurar fallback para WASM estável de thread única (compatível com todos os navegadores)
try {
    if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
        env.backends.onnx.wasm.numThreads = 1;
        env.backends.onnx.wasm.proxy = false;
    }
} catch (_) {}

let transcriber = null;
let currentModel = "";
let isInitializing = false;

// Sanitiza e normaliza o buffer Float32 para prevenir NaNs, picos e erros no OrtRun()
function sanitizeAudio(audio) {
    if (!audio) return new Float32Array(0);
    const src = (audio instanceof Float32Array) ? audio : new Float32Array(audio);
    // Whisper native max context is 30 seconds = 480000 samples at 16kHz
    const maxSamples = 30 * 16000;
    const len = Math.min(src.length, maxSamples);
    if (len === 0) return new Float32Array(0);

    const clean = new Float32Array(len);
    for (let i = 0; i < len; i++) {
        let v = src[i];
        if (Number.isNaN(v) || !Number.isFinite(v)) {
            v = 0;
        } else if (v > 1.0) {
            v = 1.0;
        } else if (v < -1.0) {
            v = -1.0;
        }
        clean[i] = v;
    }
    return clean;
}

// Fila estrita de execução para impedir colisões concorrentes no OrtRun()
const messageQueue = [];
let isProcessingQueue = false;

self.onmessage = (e) => {
    messageQueue.push(e.data);
    processQueue();
};

async function processQueue() {
    if (isProcessingQueue || messageQueue.length === 0) return;
    isProcessingQueue = true;

    const data = messageQueue.shift();
    try {
        await handleMessage(data);
    } catch (err) {
        console.error("[Worker] Erro crítico na fila:", err);
    } finally {
        isProcessingQueue = false;
        if (messageQueue.length > 0) {
            processQueue();
        }
    }
}

async function handleMessage(data) {
    const { type, payload } = data;

    if (type === "LOAD_MODEL") {
        const modelName = payload.modelName || "Xenova/whisper-base";
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
    else if (type === "TRANSCRIBE_CHUNK") {
        if (!transcriber) {
            self.postMessage({ 
                type: "CHUNK_ERROR", 
                payload: { chunkIndex: payload.chunkIndex, message: "Modelo ainda não carregado!" } 
            });
            return;
        }

        const { chunkIndex, totalChunks, audioFloat32, language, startSec, endSec } = payload;
        const t0 = performance.now();

        try {
            const cleanAudio = sanitizeAudio(audioFloat32);
            let rawText = "";

            if (cleanAudio.length >= 1600) { // pelo menos 0.1s de áudio
                // Para blocos pré-fatiados <= 30s, chamamos sem chunk_length_s / stride_length_s
                // para garantir inferência direta, rápida (1 única passagem) e sem falhas de alinhamento
                const isMedium = currentModel.includes("medium") || currentModel.includes("large");
                const output = await transcriber(cleanAudio, {
                    language: language || "portuguese",
                    task: "transcribe",
                    return_timestamps: false,
                    max_new_tokens: isMedium ? 64 : 128,
                    num_beams: 1
                });

                rawText = output && output.text ? output.text.trim() : "";
            }

            const latency = Math.round(performance.now() - t0);

            self.postMessage({
                type: "CHUNK_SUCCESS",
                payload: {
                    chunkIndex,
                    totalChunks,
                    rawText,
                    latency,
                    startSec,
                    endSec
                }
            });
        } catch (err) {
            const errMsg = (err && err.message) ? err.message : String(err);
            console.error(`Erro ao transcrever bloco ${chunkIndex}:`, err);
            self.postMessage({ 
                type: "CHUNK_ERROR", 
                payload: { chunkIndex, message: errMsg } 
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

        const { audioFloat32, duration, language } = payload;
        const t0 = performance.now();

        try {
            self.postMessage({ 
                type: "STATUS_UPDATE", 
                payload: { status: "Transcrevendo fala...", isBusy: true } 
            });

            const cleanAudio = sanitizeAudio(audioFloat32);
            let rawText = "";

            if (cleanAudio.length >= 1600) {
                const isMedium = currentModel.includes("medium") || currentModel.includes("large");
                const output = await transcriber(cleanAudio, {
                    language: language || "portuguese",
                    task: "transcribe",
                    return_timestamps: false,
                    max_new_tokens: isMedium ? 64 : 128,
                    num_beams: 1
                });

                rawText = output && output.text ? output.text.trim() : "";
            }

            const latency = Math.round(performance.now() - t0);

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
}
