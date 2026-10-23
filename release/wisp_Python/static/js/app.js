/**
 * Wisp Desktop - Controlador Principal da Interface (Python + Flask)
 */
import { AudioRecorder } from "./audio.js";

class WispDesktopApp {
    constructor() {
        this.recorder = null;
        this.isRecording = false;
        this.history = [];
        this.currentSegments = [];
        this.currentRms = 0;
        this.animFrameId = null;

        this.elements = {
            btnToggleMic: document.getElementById("btn-toggle-mic"),
            micIcon: document.getElementById("mic-icon"),
            dictationStatus: document.getElementById("dictation-status"),
            dictationSubstatus: document.getElementById("dictation-substatus"),
            waveformCanvas: document.getElementById("waveform-canvas"),
            selectModel: document.getElementById("select-model"),
            selectLanguage: document.getElementById("select-language"),
            toggleInjectMouse: document.getElementById("toggle-inject-mouse"),
            toggleClickFocus: document.getElementById("toggle-click-focus"),
            editorTextarea: document.getElementById("editor-textarea"),
            badgeLatency: document.getElementById("badge-latency"),
            statWords: document.getElementById("stat-words"),
            statChars: document.getElementById("stat-chars"),
            btnCopyText: document.getElementById("btn-copy-text"),
            btnInjectNow: document.getElementById("btn-inject-now"),
            btnDownloadTxt: document.getElementById("btn-download-txt"),
            btnClearText: document.getElementById("btn-clear-text"),
            historyList: document.getElementById("history-list"),
            tabButtons: document.querySelectorAll(".tab-btn"),
            tabContents: document.querySelectorAll(".tab-content"),
            toastContainer: document.getElementById("toast-container"),
            btnChooseFile: document.getElementById("btn-choose-file"),
            inputAudioFile: document.getElementById("input-audio-file"),
            fileInfoBox: document.getElementById("file-info-box"),
            fileName: document.getElementById("file-name"),
            fileStatus: document.getElementById("file-status"),
            btnStartFileTranscribe: document.getElementById("btn-start-file-transcribe"),
            btnDownloadSrt: document.getElementById("btn-download-srt")
        };

        this.init();
    }

    init() {
        this.initCanvas();
        this.initEventListeners();
        this.initHotkeySSE();
        this.loadSettings();
    }

    initCanvas() {
        const canvas = this.elements.waveformCanvas;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        const drawWave = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const w = canvas.width;
            const h = canvas.height;
            const centerY = h / 2;

            if (this.isRecording) {
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = "#00f2fe";
                ctx.shadowBlur = 10;
                ctx.shadowColor = "#00f2fe";
                ctx.beginPath();

                const time = Date.now() / 150;
                const amp = Math.max(0.12, Math.min(1.0, this.currentRms * 18)) * (h / 2.4);

                for (let x = 0; x < w; x += 4) {
                    const wave1 = Math.sin(x * 0.03 + time) * amp;
                    const wave2 = Math.cos(x * 0.05 - time * 0.8) * (amp * 0.5);
                    const y = centerY + wave1 + wave2;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            } else {
                ctx.lineWidth = 1;
                ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.moveTo(0, centerY);
                ctx.lineTo(w, centerY);
                ctx.stroke();
            }

            this.animFrameId = requestAnimationFrame(drawWave);
        };

        drawWave();
    }

    initEventListeners() {
        // Alternar gravação
        this.elements.btnToggleMic.addEventListener("click", () => this.toggleMicrophone());

        // Mudança de modelo
        this.elements.selectModel.addEventListener("change", async (e) => {
            const model = e.target.value;
            this.showToast(`Carregando modelo '${model}' na GPU RTX 5060...`, "info");
            try {
                const res = await fetch("/api/model/load", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ modelName: model })
                });
                const data = await res.json();
                if (data.status === "ready") {
                    this.showToast(`Modelo '${data.model}' pronto na GPU (${data.compute_type})!`, "success");
                    this.saveSettings();
                } else {
                    this.showToast(`Erro ao carregar modelo: ${data.error}`, "error");
                }
            } catch (err) {
                this.showToast(`Falha de comunicação: ${err}`, "error");
            }
        });

        // Atualizar estatísticas do texto
        this.elements.editorTextarea.addEventListener("input", () => this.updateTextStats());

        // Ações do Editor
        this.elements.btnCopyText.addEventListener("click", () => {
            const text = this.elements.editorTextarea.value;
            if (text.trim()) {
                navigator.clipboard.writeText(text);
                this.showToast("Texto copiado para a área de transferência!", "success");
            }
        });

        this.elements.btnClearText.addEventListener("click", () => {
            this.elements.editorTextarea.value = "";
            this.updateTextStats();
        });

        this.elements.btnInjectNow.addEventListener("click", async () => {
            const text = this.elements.editorTextarea.value;
            if (text.trim()) {
                const clickFocus = this.elements.toggleClickFocus.checked;
                await fetch("/api/inject", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: text.trim() + " ", click_to_focus: clickFocus })
                });
                this.showToast("Texto injetado na janela ativa!", "success");
            }
        });

        this.elements.btnDownloadTxt.addEventListener("click", () => this.downloadTxt());
        this.elements.btnDownloadSrt.addEventListener("click", () => this.downloadSrt());

        // Salvar preferências nos toggles
        this.elements.toggleInjectMouse.addEventListener("change", () => this.saveSettings());
        this.elements.toggleClickFocus.addEventListener("change", () => this.saveSettings());
        this.elements.selectLanguage.addEventListener("change", () => this.saveSettings());

        // Abas
        this.elements.tabButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                const tabId = btn.getAttribute("data-tab");
                this.elements.tabButtons.forEach(b => b.classList.remove("active"));
                this.elements.tabContents.forEach(c => c.classList.remove("active"));
                btn.classList.add("active");
                const target = document.getElementById(tabId);
                if (target) target.classList.add("active");
            });
        });

        // Transcrição de Arquivo de Áudio
        this.elements.btnChooseFile.addEventListener("click", () => this.elements.inputAudioFile.click());
        this.elements.inputAudioFile.addEventListener("change", (e) => this.handleFileSelected(e));
        this.elements.btnStartFileTranscribe.addEventListener("click", () => this.startFileTranscription());
    }

    // Monitoramento de Atalho Global (Ctrl + F8) via Server-Sent Events
    initHotkeySSE() {
        try {
            const evtSource = new EventSource("/api/hotkey/events");
            evtSource.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    if (data.action === "toggle_mic") {
                        console.log("[Wisp Hotkey] Atalho global recebido via SSE!");
                        this.toggleMicrophone();
                    }
                } catch (_) {}
            };
            evtSource.onerror = () => {
                // Tenta reconectar suavemente
                setTimeout(() => this.initHotkeySSE(), 3000);
            };
        } catch (e) {
            console.warn("[Wisp Hotkey] SSE não suportado:", e);
        }
    }

    async toggleMicrophone() {
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        if (this.isRecording) return;
        this.playBeep(660, 0.08);

        this.elements.dictationStatus.textContent = "Ouvindo... (Fale normalmente)";
        this.elements.dictationStatus.style.color = "#00f2fe";
        this.elements.dictationSubstatus.textContent = "Áudio sendo processado em tempo real na GPU NVIDIA RTX 5060";
        this.elements.btnToggleMic.classList.add("recording");
        this.elements.micIcon.textContent = "⏹️";
        this.isRecording = true;

        if (!this.recorder) {
            this.recorder = new AudioRecorder(
                (chunk, isFinal) => this.processAudioChunk(chunk, isFinal),
                (rms) => { this.currentRms = rms; }
            );
        }

        try {
            await this.recorder.start();
        } catch (err) {
            this.showToast(`Erro ao acessar microfone: ${err}`, "error");
            this.stopRecording();
        }
    }

    stopRecording() {
        if (!this.isRecording) return;
        this.playBeep(440, 0.1);

        this.isRecording = false;
        this.currentRms = 0;
        this.elements.btnToggleMic.classList.remove("recording");
        this.elements.micIcon.textContent = "🎙️";
        this.elements.dictationStatus.textContent = "Pronto para ditar";
        this.elements.dictationStatus.style.color = "var(--text-primary)";
        this.elements.dictationSubstatus.textContent = "Pressione Ctrl+F8 ou clique no botão acima para iniciar";

        if (this.recorder) {
            this.recorder.stop();
        }
    }

    async processAudioChunk(float32Chunk, isFinal) {
        if (!float32Chunk || float32Chunk.length === 0) return;

        const lang = this.elements.selectLanguage.value;
        const autoInject = this.elements.toggleInjectMouse.checked;
        const clickFocus = this.elements.toggleClickFocus.checked;

        try {
            const res = await fetch("/api/transcribe", {
                method: "POST",
                headers: {
                    "Content-Type": "application/octet-stream",
                    "X-Language": lang
                },
                body: float32Chunk.buffer
            });

            const data = await res.json();
            if (data.text && data.text.trim()) {
                const text = data.text.trim() + " ";
                this.insertTextIntoEditor(text);

                // Latência da inferência
                if (data.latency_ms) {
                    this.elements.badgeLatency.style.display = "inline-flex";
                    this.elements.badgeLatency.textContent = `⚡ ${data.latency_ms}ms (${data.device.toUpperCase()})`;
                }

                // Injeção direta no mouse caso ativada
                if (autoInject) {
                    fetch("/api/inject", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: text, click_to_focus: clickFocus })
                    });
                }

                // Registra histórico
                this.addHistoryItem(data.text.trim(), data.latency_ms);
            }
        } catch (err) {
            console.error("[Wisp App] Erro ao transcrever:", err);
        }
    }

    insertTextIntoEditor(text) {
        const textarea = this.elements.editorTextarea;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const cur = textarea.value;

        textarea.value = cur.substring(0, start) + text + cur.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + text.length;
        this.updateTextStats();
    }

    updateTextStats() {
        const val = this.elements.editorTextarea.value.trim();
        const words = val ? val.split(/\s+/).length : 0;
        const chars = this.elements.editorTextarea.value.length;

        this.elements.statWords.textContent = `${words} palavras`;
        this.elements.statChars.textContent = `${chars} caracteres`;
    }

    addHistoryItem(text, latencyMs) {
        const item = {
            id: Date.now(),
            time: new Date().toLocaleTimeString(),
            text: text,
            latency: latencyMs
        };
        this.history.unshift(item);
        if (this.history.length > 50) this.history.pop();
        this.renderHistory();
    }

    renderHistory() {
        const container = this.elements.historyList;
        if (!container) return;

        if (this.history.length === 0) {
            container.innerHTML = `
                <div class="dictation-substatus" style="text-align: center; margin-top: 40px;">
                    Nenhuma transcrição realizada ainda.<br>Pressione <strong>Ctrl + F8</strong> para começar a ditar.
                </div>
            `;
            return;
        }

        container.innerHTML = this.history.map(item => `
            <div class="history-item">
                <div class="history-header">
                    <span>🕒 ${item.time}</span>
                    <span style="color: var(--accent-cyan); font-family: monospace;">⚡ ${item.latency || 0}ms</span>
                </div>
                <div class="history-text">${item.text}</div>
                <div class="history-actions">
                    <button class="mini-btn btn-copy-item" data-text="${encodeURIComponent(item.text)}">📋 Copiar</button>
                    <button class="mini-btn btn-inject-item" data-text="${encodeURIComponent(item.text)}">🎯 Injetar</button>
                </div>
            </div>
        `).join("");

        container.querySelectorAll(".btn-copy-item").forEach(btn => {
            btn.addEventListener("click", () => {
                const text = decodeURIComponent(btn.getAttribute("data-text"));
                navigator.clipboard.writeText(text);
                this.showToast("Copiado!", "success");
            });
        });

        container.querySelectorAll(".btn-inject-item").forEach(btn => {
            btn.addEventListener("click", () => {
                const text = decodeURIComponent(btn.getAttribute("data-text")) + " ";
                const clickFocus = this.elements.toggleClickFocus.checked;
                fetch("/api/inject", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: text, click_to_focus: clickFocus })
                });
                this.showToast("Texto injetado no cursor!", "success");
            });
        });
    }

    // Transcrição de arquivos gravados
    async handleFileSelected(e) {
        const file = e.target.files[0];
        if (!file) return;

        this.elements.fileInfoBox.style.display = "block";
        this.elements.fileName.textContent = file.name;
        this.elements.fileStatus.textContent = `Tamanho: ${(file.size / 1024 / 1024).toFixed(2)} MB • Pronto para transcrever`;
        this.elements.btnStartFileTranscribe.style.display = "inline-flex";
        this.elements.btnDownloadSrt.style.display = "none";
        this.selectedFile = file;
    }

    async startFileTranscription() {
        if (!this.selectedFile) return;

        this.elements.fileStatus.textContent = "Decodificando áudio na memória...";
        this.elements.btnStartFileTranscribe.disabled = true;

        try {
            const arrayBuffer = await this.selectedFile.arrayBuffer();
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            const floatData = audioBuffer.getChannelData(0);

            this.elements.fileStatus.textContent = "Processando transcrição na GPU RTX 5060...";
            const lang = this.elements.selectLanguage.value;

            const res = await fetch("/api/transcribe", {
                method: "POST",
                headers: {
                    "Content-Type": "application/octet-stream",
                    "X-Language": lang
                },
                body: floatData.buffer
            });

            const data = await res.json();
            if (data.text) {
                this.elements.fileStatus.textContent = `Transcrito em ${data.latency_ms}ms na GPU!`;
                this.elements.editorTextarea.value += "\n\n" + data.text.trim();
                this.updateTextStats();
                this.currentSegments = data.segments || [];
                if (this.currentSegments.length > 0) {
                    this.elements.btnDownloadSrt.style.display = "inline-flex";
                }
                this.showToast("Arquivo de áudio transcrito com sucesso!", "success");
            }
        } catch (err) {
            this.elements.fileStatus.textContent = `Erro na transcrição: ${err}`;
            this.showToast(`Falha ao transcrever arquivo: ${err}`, "error");
        } finally {
            this.elements.btnStartFileTranscribe.disabled = false;
        }
    }

    downloadTxt() {
        const text = this.elements.editorTextarea.value;
        if (!text.trim()) return;
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `wisp-transcricao-${Date.now()}.txt`;
        a.click();
    }

    downloadSrt() {
        if (!this.currentSegments || this.currentSegments.length === 0) {
            this.showToast("Nenhum segmento temporal disponível para SRT.", "info");
            return;
        }

        const formatTime = (seconds) => {
            const pad = (n, z = 2) => ("00" + n).slice(-z);
            const s = Math.floor(seconds);
            const ms = Math.floor((seconds - s) * 1000);
            const hrs = Math.floor(s / 3600);
            const mins = Math.floor((s % 3600) / 60);
            const secs = s % 60;
            return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
        };

        let srt = "";
        this.currentSegments.forEach((seg, i) => {
            srt += `${i + 1}\n`;
            srt += `${formatTime(seg.start)} --> ${formatTime(seg.end)}\n`;
            srt += `${seg.text}\n\n`;
        });

        const blob = new Blob([srt], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `wisp-legenda-${Date.now()}.srt`;
        a.click();
    }

    playBeep(freq = 600, duration = 0.08) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = freq;
            osc.type = "sine";
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch (_) {}
    }

    showToast(message, type = "info") {
        const container = this.elements.toastContainer;
        if (!container) return;

        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        const icons = { info: "ℹ️", success: "✅", error: "❌" };
        toast.innerHTML = `<span>${icons[type] || "ℹ️"}</span><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(20px)";
            toast.style.transition = "all 0.3s ease";
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    loadSettings() {
        const saved = localStorage.getItem("wisp_desktop_settings");
        if (saved) {
            try {
                const s = JSON.parse(saved);
                if (s.model) this.elements.selectModel.value = s.model;
                if (s.language) this.elements.selectLanguage.value = s.language;
                if (s.injectMouse !== undefined) this.elements.toggleInjectMouse.checked = s.injectMouse;
                if (s.clickFocus !== undefined) this.elements.toggleClickFocus.checked = s.clickFocus;
            } catch (_) {}
        }
    }

    saveSettings() {
        const s = {
            model: this.elements.selectModel.value,
            language: this.elements.selectLanguage.value,
            injectMouse: this.elements.toggleInjectMouse.checked,
            clickFocus: this.elements.toggleClickFocus.checked
        };
        localStorage.setItem("wisp_desktop_settings", JSON.stringify(s));
    }
}

// Iniciar aplicação quando DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => {
    window.app = new WispDesktopApp();
});
