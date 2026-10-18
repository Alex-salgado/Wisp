/**
 * Gerenciador de Captura de Áudio e Voice Activity Detection (VAD)
 * Converte o microfone do usuário para 16kHz mono Float32Array
 * compatível diretamente com o Whisper no navegador.
 */

export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.processorNode = null;
        
        this.sampleRate = 16000;
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

    async start(onAudioChunkReady, onLevelUpdate) {
        if (this.isActive) return;

        this.onAudioChunkReady = onAudioChunkReady;
        this.onLevelUpdate = onLevelUpdate;
        this.speechChunks = [];
        this.prerollBuffer = [];
        this.isSpeaking = false;

        // Inicia captura do microfone
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                sampleRate: { ideal: this.sampleRate },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContextClass({ sampleRate: this.sampleRate });

        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
        
        // Usar ScriptProcessor para compatibilidade universal simples em float32
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
        // Cria uma cópia do bloco de áudio
        const chunk = new Float32Array(inputData);

        // Calcular RMS (Energia do bloco)
        let sumSquares = 0;
        for (let i = 0; i < chunk.length; i++) {
            sumSquares += chunk[i] * chunk[i];
        }
        const rms = Math.sqrt(sumSquares / chunk.length);

        // Atualizar nível para UI (0 a 100)
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
                // Adiciona o buffer pré-fala para não cortar o início da frase
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

                // Se o tempo de pausa exceder a duração configurada, finaliza a fala
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

        // Calcula duração total
        let totalSamples = 0;
        for (const c of this.speechChunks) totalSamples += c.length;
        const durationSec = totalSamples / this.sampleRate;

        if (durationSec >= this.minSpeechDuration) {
            // Concatena todos os blocos em um único Float32Array contínuo
            const merged = new Float32Array(totalSamples);
            let offset = 0;
            for (const c of this.speechChunks) {
                merged.set(c, offset);
                offset += c.length;
            }

            if (this.onAudioChunkReady) {
                this.onAudioChunkReady(merged, durationSec);
            }
        }

        this.isSpeaking = false;
        this.speechChunks = [];
        this.prerollBuffer = [];
    }

    async calibrateNoise(durationSeconds = 2.0) {
        if (!this.mediaStream) {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContextClass({ sampleRate: this.sampleRate });
        const source = ctx.createMediaStreamSource(this.mediaStream);
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
                ctx.close();

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
