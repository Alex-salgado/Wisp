/**
 * Gerenciador de Captura de Áudio e Voice Activity Detection (VAD)
 * Converte qualquer microfone em qualquer taxa de hardware (44.1kHz, 48kHz, etc.)
 * para exatamente 16kHz mono Float32Array via resamostragem universal integrada.
 */

export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.processorNode = null;
        
        this.targetSampleRate = 16000;
        this.actualSampleRate = 16000;
        this.silenceThreshold = 0.015;
        this.pauseDuration = 0.75;
        this.minSpeechDuration = 0.35;
        this.maxSpeechDuration = 25.0;

        this.isActive = false;
        this.isSpeaking = false;
        this.speechChunks = [];
        this.prerollBuffer = [];
        this.prerollMaxChunks = 10; // ~320ms de áudio pré-fala

        this.lastSpeechTime = 0;
        this.speechStartTime = 0;

        this.onAudioChunkReady = null; // callback(float32Array, durationSec)
        this.onLevelUpdate = null;      // callback(level_0_to_100)
    }

    async start(onAudioChunkReady, onLevelUpdate, deviceId = null) {
        if (this.isActive) return;

        this.onAudioChunkReady = onAudioChunkReady;
        this.onLevelUpdate = onLevelUpdate;
        this.speechChunks = [];
        this.prerollBuffer = [];
        this.isSpeaking = false;

        const audioConstraints = {
            channelCount: 1,
            sampleRate: { ideal: this.targetSampleRate },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        };

        if (deviceId) {
            audioConstraints.deviceId = { exact: deviceId };
        }

        // Inicia captura do microfone (com fallback se o deviceId exato não estiver disponível)
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        } catch (err) {
            if (deviceId) {
                // Tenta sem restrição estrita de deviceId
                this.mediaStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        channelCount: 1,
                        sampleRate: { ideal: this.targetSampleRate },
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });
            } else {
                throw err;
            }
        }

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        try {
            this.audioContext = new AudioContextClass({ sampleRate: this.targetSampleRate });
        } catch (_) {
            this.audioContext = new AudioContextClass();
        }

        // Taxa de amostragem real informada pelo navegador/hardware (ex: 16000, 44100 ou 48000)
        this.actualSampleRate = this.audioContext.sampleRate || this.targetSampleRate;

        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
        
        // Usar ScriptProcessor para compatibilidade universal em Float32
        const bufferSize = 4096;
        this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

        this.processorNode.onaudioprocess = (e) => this._processAudio(e);

        this.sourceNode.connect(this.processorNode);
        this.processorNode.connect(this.audioContext.destination);

        this.isActive = true;
    }

    stop() {
        this.isActive = false;
        this.isSpeaking = false;

        if (this.sourceNode) {
            try { this.sourceNode.disconnect(); } catch (_) {}
            this.sourceNode = null;
        }

        if (this.processorNode) {
            try { this.processorNode.disconnect(); } catch (_) {}
            this.processorNode = null;
        }

        if (this.audioContext && this.audioContext.state !== "closed") {
            try { this.audioContext.close(); } catch (_) {}
            this.audioContext = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.onLevelUpdate) {
            this.onLevelUpdate(0);
        }
    }

    _processAudio(event) {
        if (!this.isActive) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const chunk = new Float32Array(inputData);

        // Calcular RMS (Energia do bloco)
        let sumSquares = 0;
        for (let i = 0; i < chunk.length; i++) {
            sumSquares += chunk[i] * chunk[i];
        }
        const rms = Math.sqrt(sumSquares / chunk.length);

        // Atualizar nível visual para UI (0 a 100)
        if (this.onLevelUpdate) {
            const level = Math.min(100, (rms / 0.12) * 100);
            this.onLevelUpdate(level);
        }

        const now = performance.now() / 1000;

        if (rms >= this.silenceThreshold) {
            this.lastSpeechTime = now;

            if (!this.isSpeaking) {
                this.isSpeaking = true;
                this.speechStartTime = now;
                // Adiciona o buffer pré-fala para não cortar o início da fala
                this.speechChunks = [...this.prerollBuffer];
            }

            this.speechChunks.push(chunk);

            // Trava de segurança: duração máxima de fala contínua
            if (now - this.speechStartTime >= this.maxSpeechDuration) {
                this._dispatchSpeech();
            }
        } else {
            if (this.isSpeaking) {
                this.speechChunks.push(chunk);

                // Se o tempo de pausa exceder a duração configurada, finaliza o bloco
                if (now - this.lastSpeechTime >= this.pauseDuration) {
                    this._dispatchSpeech();
                }
            } else {
                // Mantém buffer de pré-fala circulando
                this.prerollBuffer.push(chunk);
                if (this.prerollBuffer.length > this.prerollMaxChunks) {
                    this.prerollBuffer.shift();
                }
            }
        }
    }

    _dispatchSpeech() {
        if (this.speechChunks.length === 0) {
            this.isSpeaking = false;
            return;
        }

        // Calcula duração total em segundos usando a taxa real do contexto
        let totalSamples = 0;
        for (const c of this.speechChunks) totalSamples += c.length;
        const durationSec = totalSamples / this.actualSampleRate;

        if (durationSec >= this.minSpeechDuration) {
            // Concatena todos os blocos em um único Float32Array contínuo
            const merged = new Float32Array(totalSamples);
            let offset = 0;
            for (const c of this.speechChunks) {
                merged.set(c, offset);
                offset += c.length;
            }

            // Resamostragem universal para exatamente 16kHz se o hardware estiver em 44.1k, 48k, etc.
            const resampled16k = this._resampleTo16k(merged, this.actualSampleRate);

            if (this.onAudioChunkReady) {
                this.onAudioChunkReady(resampled16k, durationSec);
            }
        }

        this.isSpeaking = false;
        this.speechChunks = [];
        this.prerollBuffer = [];
    }

    /**
     * Resamostragem universal por interpolação linear para 16kHz
     * Compatível com iOS Safari, Android, macOS e Windows em qualquer taxa de hardware
     */
    _resampleTo16k(inputBuffer, sourceSampleRate) {
        if (!inputBuffer || inputBuffer.length === 0 || sourceSampleRate === 16000) {
            return inputBuffer;
        }

        const targetSampleRate = 16000;
        const ratio = sourceSampleRate / targetSampleRate;
        const newLength = Math.round(inputBuffer.length / ratio);
        const output = new Float32Array(newLength);

        for (let i = 0; i < newLength; i++) {
            const srcIndex = i * ratio;
            const indexFloor = Math.floor(srcIndex);
            const indexCeil = Math.min(inputBuffer.length - 1, Math.ceil(srcIndex));
            const fraction = srcIndex - indexFloor;
            output[i] = inputBuffer[indexFloor] * (1 - fraction) + inputBuffer[indexCeil] * fraction;
        }

        return output;
    }

    async calibrateNoise(durationSeconds = 2.0, deviceId = null) {
        let stream = this.mediaStream;
        let createdStream = false;

        if (!stream) {
            const constraints = { audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } };
            if (deviceId) constraints.audio.deviceId = { exact: deviceId };
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (_) {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            createdStream = true;
        }
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        let ctx;
        try {
            ctx = new AudioContextClass({ sampleRate: this.targetSampleRate });
        } catch (_) {
            ctx = new AudioContextClass();
        }

        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);

        let energySamples = [];

        return new Promise((resolve) => {
            processor.onaudioprocess = (e) => {
                const data = e.inputBuffer.getChannelData(0);
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
                energySamples.push(Math.sqrt(sum / data.length));
            };

            source.connect(processor);
            processor.connect(ctx.destination);

            setTimeout(() => {
                source.disconnect();
                processor.disconnect();
                if (ctx.state !== "closed") {
                    try { ctx.close(); } catch (_) {}
                }
                if (createdStream && stream) {
                    stream.getTracks().forEach(t => t.stop());
                }

                if (energySamples.length > 0) {
                    const avg = energySamples.reduce((a, b) => a + b, 0) / energySamples.length;
                    const newThreshold = Math.max(0.008, Math.min(0.05, avg * 2.2));
                    this.silenceThreshold = newThreshold;
                    resolve(newThreshold);
                } else {
                    resolve(this.silenceThreshold);
                }
            }, durationSeconds * 1000);
        });
    }
}
