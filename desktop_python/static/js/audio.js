/**
 * Wisp Desktop - Captura e Processamento de Áudio 16kHz Float32
 */
export class AudioRecorder {
    constructor(onAudioChunk, onVolumeChange) {
        this.onAudioChunk = onAudioChunk;
        this.onVolumeChange = onVolumeChange;
        this.audioContext = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.processorNode = null;
        this.analyserNode = null;
        this.isRecording = false;
        this.buffer = [];
        this.sampleRate = 16000;
        this.chunkDurationSec = 2.5; // Chunks contínuos de 2.5s
        this.lastChunkTime = 0;
        this.silenceTimer = null;
        this.silenceThreshold = 0.015;
    }

    async start(deviceId = null) {
        if (this.isRecording) return;

        const constraints = {
            audio: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                channelCount: 1,
                sampleRate: 16000,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };

        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000
        });

        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 256;

        // ScriptProcessor para captura em tempo real dos samples float32 a 16kHz
        this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

        this.buffer = [];
        this.lastChunkTime = Date.now();
        this.isRecording = true;

        const pcmData = new Float32Array(this.analyserNode.frequencyBinCount);

        this.processorNode.onaudioprocess = (e) => {
            if (!this.isRecording) return;
            const inputData = e.inputBuffer.getChannelData(0);
            
            // Medição de volume para o visualizador de onda
            this.analyserNode.getFloatTimeDomainData(pcmData);
            let sumSquares = 0;
            for (let i = 0; i < pcmData.length; i++) {
                sumSquares += pcmData[i] * pcmData[i];
            }
            const rms = Math.sqrt(sumSquares / pcmData.length);
            if (this.onVolumeChange) {
                this.onVolumeChange(rms);
            }

            // Acumula samples no buffer
            for (let i = 0; i < inputData.length; i++) {
                this.buffer.push(inputData[i]);
            }

            const now = Date.now();
            const elapsed = (now - this.lastChunkTime) / 1000;

            // Se atingiu a duração do chunk contínuo (2.5s)
            if (elapsed >= this.chunkDurationSec && this.buffer.length >= 16000 * 1.5) {
                const chunk = new Float32Array(this.buffer);
                this.buffer = [];
                this.lastChunkTime = now;
                if (this.onAudioChunk) {
                    this.onAudioChunk(chunk, false);
                }
            }
        };

        this.sourceNode.connect(this.analyserNode);
        this.analyserNode.connect(this.processorNode);
        this.processorNode.connect(this.audioContext.destination);
    }

    stop() {
        if (!this.isRecording) return;
        this.isRecording = false;

        // Envia o restante do buffer final
        if (this.buffer.length >= 16000 * 0.4) {
            const finalChunk = new Float32Array(this.buffer);
            this.buffer = [];
            if (this.onAudioChunk) {
                this.onAudioChunk(finalChunk, true);
            }
        }
        this.buffer = [];

        try {
            if (this.processorNode) {
                this.processorNode.disconnect();
                this.processorNode = null;
            }
            if (this.analyserNode) {
                this.analyserNode.disconnect();
                this.analyserNode = null;
            }
            if (this.sourceNode) {
                this.sourceNode.disconnect();
                this.sourceNode = null;
            }
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
                this.mediaStream = null;
            }
            if (this.audioContext && this.audioContext.state !== "closed") {
                this.audioContext.close();
                this.audioContext = null;
            }
        } catch (e) {
            console.warn("[AudioRecorder] Erro ao fechar componentes de áudio:", e);
        }
    }
}
