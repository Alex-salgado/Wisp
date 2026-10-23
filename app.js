// Registro do Service Worker (PWA Offline)
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js")
            .then(reg => console.log("[WispWeb] Service Worker ativo:", reg.scope))
            .catch(err => console.warn("[WispWeb] Aviso no Service Worker:", err));
    });
}

/**
 * WISP WEB - CONTROLADOR PRINCIPAL (V3)
 * Ditador Pessoal Privado 100% In-Browser
 * Gerencia a interface, perfil do usuário, áudio, microfones e worker de IA
 */

import { AudioManager } from "./audio.js";

// Configurações e Dados Padrão (Sem referências ao Whisper)
const DEFAULT_PROFILE = {
    custom_vocabulary: [
        "Wisp",
        "Inteligência Artificial",
        "WhatsApp"
    ],
    correction_rules: {
        "ia": "IA",
        "vc": "você",
        "obg": "obrigado"
    },
    phrase_history: [],
    settings: {
        modelName: "Xenova/whisper-base",
        language: "portuguese",
        soundFeedback: true,
        voicePunctuation: true,
        voiceEnter: true,
        injectAtCursor: true,
        clickBeforeType: true,
        pauseDuration: 0.75,
        silenceThreshold: 0.015,
        selectedMicId: ""
    }
};

const PROFILE_STORAGE_KEY = "wisp_user_profile_v4";

class WispWebApp {
    constructor() {
        console.log("[WispWeb] Inicializando Ditador Pessoal Privado...");
        this.profile = this.loadProfile();
        this.audioManager = new AudioManager();
        this.worker = null;
        this.isModelReady = false;
        this.isTranscribing = false;
        this.isWorkerTranscribing = false;
        this.isNativeEngineActive = false;
        this.isDesktop = false;
        this.pendingSpeechQueue = [];
        this.batchChunkTimeout = null;
        this.isBatchProcessing = false;
        this.isBatchCancelled = false;

        this.initDOM();
        this.initTabs();
        this.initAudioControls();
        this.initProfileManager();
        this.initLongAudioController();
        this.renderAll();

        // 1. Detectar se está no ambiente desktop nativo (Tauri Rust)
        this.checkDesktopEnvironment().then(() => {
            // Se NÃO for modo desktop nativo (modo web puro no navegador), inicia o Web Worker
            if (!this.isDesktop) {
                console.log("[WispApp] Modo web navegador, iniciando Web Worker...");
                this.initWorker();
            }
        });
        console.log("[WispWeb] Aplicativo pronto para uso!");
    }

    // Carregar Perfil do localStorage
    loadProfile() {
        try {
            const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    custom_vocabulary: parsed.custom_vocabulary || DEFAULT_PROFILE.custom_vocabulary,
                    correction_rules: parsed.correction_rules || DEFAULT_PROFILE.correction_rules,
                    phrase_history: parsed.phrase_history || [],
                    settings: { ...DEFAULT_PROFILE.settings, ...(parsed.settings || {}) }
                };
            }
        } catch (e) {
            console.warn("Erro ao carregar perfil do localStorage:", e);
        }
        return JSON.parse(JSON.stringify(DEFAULT_PROFILE));
    }

    saveProfile() {
        try {
            localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(this.profile));
        } catch (e) {
            console.error("Erro ao salvar perfil no localStorage:", e);
        }
    }

    // Inicialização do DOM
    initDOM() {
        this.elements = {
            // Header
            statusBadge: document.getElementById("system-status-badge"),
            statusDot: document.getElementById("system-status-dot"),
            statusText: document.getElementById("system-status-text"),
            progressCard: document.getElementById("model-progress-card"),
            progressFileName: document.getElementById("progress-file-name"),
            progressPercentage: document.getElementById("progress-percentage"),
            progressBarFill: document.getElementById("progress-bar-fill"),

            // Mic & VU
            btnToggleMic: document.getElementById("btn-toggle-mic"),
            micStatusLabel: document.getElementById("mic-status-label"),
            micStatusSub: document.getElementById("mic-status-sub"),
            vuBarFill: document.getElementById("vu-bar-fill"),
            selectMic: document.getElementById("select-mic"),
            selectModel: document.getElementById("select-model"),
            selectLanguage: document.getElementById("select-language"),
            btnCalibrateNoise: document.getElementById("btn-calibrate-noise"),

            // Editor
            editor: document.getElementById("dictation-editor"),
            btnCopyText: document.getElementById("btn-copy-text"),
            btnDownloadTxt: document.getElementById("btn-download-txt"),
            btnClearText: document.getElementById("btn-clear-text"),
            statWordCount: document.getElementById("stat-word-count"),
            statCharCount: document.getElementById("stat-char-count"),
            statLatency: document.getElementById("stat-latency"),

            // Vocabulário & Regras
            formAddVocab: document.getElementById("form-add-vocab"),
            inputNewVocab: document.getElementById("input-new-vocab"),
            tbodyVocab: document.getElementById("tbody-vocab"),
            formAddRule: document.getElementById("form-add-rule"),
            inputRuleFrom: document.getElementById("input-rule-from"),
            inputRuleTo: document.getElementById("input-rule-to"),
            tbodyRules: document.getElementById("tbody-rules"),

            // Histórico
            tbodyHistory: document.getElementById("tbody-history"),
            btnCopyHistory: document.getElementById("btn-copy-history"),
            btnClearHistory: document.getElementById("btn-clear-history"),

            // Configurações
            settingSoundFeedback: document.getElementById("setting-sound-feedback"),
            settingVoicePunctuation: document.getElementById("setting-voice-punctuation"),
            settingVoiceEnter: document.getElementById("setting-voice-enter"),
            settingInjectMouse: document.getElementById("setting-inject-mouse"),
            settingClickBefore: document.getElementById("setting-click-before"),
            settingClickBeforeRow: document.getElementById("setting-click-before-row"),
            settingInjectMouseDesc: document.getElementById("setting-inject-mouse-desc"),
            desktopHardwareCard: document.getElementById("desktop-hardware-card"),
            desktopHardwareSpecs: document.getElementById("desktop-hardware-specs"),
            desktopHotkeyRow: document.getElementById("desktop-hotkey-row"),
            inputGlobalHotkey: document.getElementById("input-global-hotkey"),
            btnSaveHotkey: document.getElementById("btn-save-hotkey"),
            selectLongModel: document.getElementById("select-long-model"),
            desktopModeBadge: document.getElementById("desktop-mode-badge"),
            settingPauseDuration: document.getElementById("setting-pause-duration"),
            labelPauseVal: document.getElementById("label-pause-val"),
            settingSilenceThreshold: document.getElementById("setting-silence-threshold"),
            labelThresholdVal: document.getElementById("label-threshold-val"),
            btnExportProfile: document.getElementById("btn-export-profile"),
            inputImportProfile: document.getElementById("input-import-profile"),
            btnResetProfile: document.getElementById("btn-reset-profile"),
            toastContainer: document.getElementById("toast-container"),
            btnClearModelCache: document.getElementById("btn-clear-model-cache"),
            labelCacheStatus: document.getElementById("label-cache-status"),

            // Elementos da Aba: Gravar & Arquivo
            btnModeRecord: document.getElementById("btn-mode-record"),
            btnModeUpload: document.getElementById("btn-mode-upload"),
            panelLongRecord: document.getElementById("panel-long-record"),
            panelLongUpload: document.getElementById("panel-long-upload"),
            panelAudioReady: document.getElementById("panel-audio-ready"),
            panelBatchProgress: document.getElementById("panel-batch-progress"),
            panelBatchResults: document.getElementById("panel-batch-results"),

            // Gravação Contínua
            longRecordDot: document.getElementById("long-record-dot"),
            longRecordStatusText: document.getElementById("long-record-status-text"),
            longRecordTimer: document.getElementById("long-record-timer"),
            longVuBarFill: document.getElementById("long-vu-bar-fill"),
            btnLongStart: document.getElementById("btn-long-start"),
            btnLongPause: document.getElementById("btn-long-pause"),
            btnLongFinish: document.getElementById("btn-long-finish"),
            btnLongDiscard: document.getElementById("btn-long-discard"),

            // Upload de Arquivo
            audioDropzone: document.getElementById("audio-dropzone"),
            inputAudioFile: document.getElementById("input-audio-file"),

            // Pré-visualização e Disparo
            labelAudioInfo: document.getElementById("label-audio-info"),
            btnDownloadRawAudio: document.getElementById("btn-download-raw-audio"),
            audioPreviewPlayer: document.getElementById("audio-preview-player"),
            selectLongModel: document.getElementById("select-long-model"),
            selectLongLang: document.getElementById("select-long-lang"),
            btnStartBatchTranscribe: document.getElementById("btn-start-batch-transcribe"),

            // Progresso em Lote
            labelBatchStatus: document.getElementById("label-batch-status"),
            labelBatchPercentage: document.getElementById("label-batch-percentage"),
            batchProgressBarFill: document.getElementById("batch-progress-bar-fill"),
            metricBatchChunk: document.getElementById("metric-batch-chunk"),
            metricBatchElapsed: document.getElementById("metric-batch-elapsed"),
            metricBatchEta: document.getElementById("metric-batch-eta"),
            labelBatchEta: document.getElementById("metric-batch-eta"),
            btnCancelBatch: document.getElementById("btn-cancel-batch"),

            // Resultados e Exportação
            longStatWords: document.getElementById("long-stat-words"),
            longStatChars: document.getElementById("long-stat-chars"),
            checkShowTimestamps: document.getElementById("check-show-timestamps"),
            btnCopyLongResult: document.getElementById("btn-copy-long-result"),
            btnDownloadLongTxt: document.getElementById("btn-download-long-txt"),
            btnDownloadLongSrt: document.getElementById("btn-download-long-srt"),
            btnClearLongResult: document.getElementById("btn-clear-long-result"),
            longTranscriptionEditor: document.getElementById("long-transcription-editor")
        };
    }

    // Inicialização do Web Worker de IA
    initWorker() {
        try {
            console.log("[WispWeb] Inicializando Worker de IA...");
            this.worker = new Worker("worker.js", { type: "module" });

            this.worker.onerror = (err) => {
                console.error("[WispWeb] Erro no Worker de IA:", err);
                this.updateSystemStatus("Erro no Worker IA", false, true);
                this.showToast("Falha ao carregar motor de IA no navegador. Verifique a conexão.", "error");
            };

            this.worker.onmessage = (e) => {
                const { type, payload } = e.data;

                switch (type) {
                    case "STATUS_UPDATE":
                        this.updateSystemStatus(payload.status, payload.isBusy);
                        break;

                    case "MODEL_PROGRESS":
                        this.handleModelDownloadProgress(payload);
                        break;

                    case "MODEL_READY":
                        this.isModelReady = true;
                        this.isWorkerTranscribing = false;
                        this.elements.progressCard.style.display = "none";
                        this.updateSystemStatus("Modelo pronto", false);
                        this.showToast("Modelo de IA pronto para uso local!");
                        this.processNextPendingDictation();
                        break;

                    case "TRANSCRIBE_SUCCESS":
                        this.isWorkerTranscribing = false;
                        this.handleTranscriptionSuccess(payload);
                        this.processNextPendingDictation();
                        break;

                    case "CHUNK_SUCCESS":
                        this.handleBatchChunkSuccess(payload);
                        break;

                    case "CHUNK_ERROR":
                        this.handleBatchChunkError(payload);
                        break;

                    case "ERROR":
                        this.isWorkerTranscribing = false;
                        this.updateSystemStatus("Erro", false, true);
                        this.showToast(payload.message, "error");
                        this.processNextPendingDictation();
                        break;
                }
            };

            // Solicita carregamento do modelo padrão salvo
            this.loadSelectedModel();
        } catch (err) {
            console.error("[WispWeb] Falha ao instanciar Worker:", err);
            this.updateSystemStatus("Erro de Inicialização", false, true);
            this.showToast("Navegador bloqueou execução do Worker de IA.", "error");
        }
    }

    async loadSelectedModel() {
        this.isModelReady = false;
        this.elements.progressCard.style.display = "block";
        this.elements.progressBarFill.style.width = "0%";
        this.elements.progressPercentage.textContent = "0%";
        this.elements.progressFileName.textContent = "Preparando modelo de IA...";

        // Se estiver no ambiente desktop nativo Rust (whisper.cpp)
        if (this.isDesktop) {
            try {
                this.updateSystemStatus("Carregando modelo de IA nativo (whisper.cpp)...", true);
                this.elements.progressFileName.textContent = `Carregando '${this.profile.settings.modelName}' na memória nativa Rust...`;
                this.elements.progressBarFill.style.width = "50%";
                this.elements.progressPercentage.textContent = "50%";

                const data = await this.invokeNative("load_native_model", {
                    modelName: this.profile.settings.modelName
                });

                if (data && data.status === "ready") {
                    this.isModelReady = true;
                    this.isNativeEngineActive = true;
                    this.elements.progressBarFill.style.width = "100%";
                    this.elements.progressPercentage.textContent = "100%";
                    this.elements.progressCard.style.display = "none";
                    this.updateSystemStatus(`Pronto (Motor Nativo Rust: ${data.model})`, false);
                    this.showToast(`Modelo '${data.model}' pronto na memória nativa Rust!`, "success");
                    return;
                }
            } catch (err) {
                console.warn("[WispApp] Falha ao carregar modelo nativo Rust:", err);
                this.showToast(`Erro ao carregar modelo nativo: ${err}`, "error");
            }
        }

        // Se o Web Worker não foi inicializado ainda
        if (!this.worker) {
            this.initWorker();
            return;
        }

        // Se for Web Worker e já havia modelo carregado anteriormente, recria o worker para purgar 100% da memória WASM
        if (this._workerHasLoadedModel) {
            console.log("[WispApp] Recriando Web Worker para liberar memória WebAssembly (prevenção OrtRun code 6)...");
            try { this.worker.terminate(); } catch (_) {}
            this.worker = null;
            this.initWorker();
            return;
        }

        this._workerHasLoadedModel = true;
        this.worker.postMessage({
            type: "LOAD_MODEL",
            payload: { modelName: this.profile.settings.modelName }
        });
    }

    handleModelDownloadProgress(data) {
        if (data.status === "progress" && data.progress !== undefined) {
            const pct = Math.round(data.progress);
            this.elements.progressBarFill.style.width = `${pct}%`;
            this.elements.progressPercentage.textContent = `${pct}%`;
            if (data.file) {
                this.elements.progressFileName.textContent = `Baixando modelo: ${pct}% concluído`;
            }
        } else if (data.status === "done") {
            this.elements.progressBarFill.style.width = "100%";
            this.elements.progressPercentage.textContent = "100%";
        }
    }

    updateSystemStatus(text, isBusy = false, isError = false) {
        if (!this.elements.statusText) return;
        this.elements.statusText.textContent = text;
        this.elements.statusDot.className = "status-dot";
        if (isError) {
            this.elements.statusDot.classList.add("error");
        } else if (isBusy) {
            this.elements.statusDot.classList.add("busy");
        }
    }

    // Navegação por Abas
    initTabs() {
        const tabBtns = document.querySelectorAll(".tab-btn");
        const tabContents = document.querySelectorAll(".tab-content");

        tabBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                const targetId = btn.getAttribute("data-tab");
                tabBtns.forEach(b => b.classList.remove("active"));
                tabContents.forEach(c => c.classList.remove("active"));

                btn.classList.add("active");
                const targetContent = document.getElementById(targetId);
                if (targetContent) targetContent.classList.add("active");
            });
        });
    }

    // Lista os dispositivos de entrada de microfone disponíveis
    async populateMicrophoneList() {
        const select = this.elements.selectMic;
        if (!select || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(d => d.kind === "audioinput");

            const previousSelection = this.profile.settings.selectedMicId || "";
            select.innerHTML = '<option value="">Microfone Padrão do Sistema</option>';

            let foundPrevious = false;
            audioInputs.forEach((device, index) => {
                const opt = document.createElement("option");
                opt.value = device.deviceId;
                opt.textContent = device.label || `Microfone ${index + 1}`;
                if (device.deviceId && device.deviceId === previousSelection) {
                    opt.selected = true;
                    foundPrevious = true;
                }
                select.appendChild(opt);
            });

            if (!foundPrevious && previousSelection) {
                this.profile.settings.selectedMicId = "";
                this.saveProfile();
            }
        } catch (err) {
            console.warn("Não foi possível listar os microfones:", err);
        }
    }

    // Controles de Áudio e Microfone
    initAudioControls() {
        this.elements.btnToggleMic.addEventListener("click", () => this.toggleMicrophone());

        // Carregar lista inicial de microfones
        this.populateMicrophoneList();
        if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
            navigator.mediaDevices.addEventListener("devicechange", () => this.populateMicrophoneList());
        }

        // Troca de microfone pelo dropdown
        if (this.elements.selectMic) {
            this.elements.selectMic.addEventListener("change", async (e) => {
                this.profile.settings.selectedMicId = e.target.value;
                this.saveProfile();
                this.showToast("Dispositivo de microfone atualizado!");

                if (this.audioManager.isActive) {
                    this.audioManager.stop();
                    try {
                        await this.audioManager.start(
                            (audioFloat32, durationSec) => this.onSpeechChunkCaptured(audioFloat32, durationSec),
                            (level) => { this.elements.vuBarFill.style.width = `${level}%`; },
                            this.profile.settings.selectedMicId
                        );
                        this.showToast("Microfone reconectado no novo dispositivo.");
                    } catch (err) {
                        this.showToast("Erro ao trocar microfone: " + err.message, "error");
                        this.updateMicUiState(false);
                    }
                }
            });
        }

        // Mudança de modelo de IA
        this.elements.selectModel.value = this.profile.settings.modelName;
        this.elements.selectModel.addEventListener("change", (e) => {
            this.profile.settings.modelName = e.target.value;
            this.saveProfile();
            this.loadSelectedModel();
        });

        // Idioma
        this.elements.selectLanguage.value = this.profile.settings.language;
        this.elements.selectLanguage.addEventListener("change", (e) => {
            this.profile.settings.language = e.target.value;
            this.saveProfile();
        });

        // Calibração de Ruído
        this.elements.btnCalibrateNoise.addEventListener("click", async () => {
            this.elements.btnCalibrateNoise.disabled = true;
            this.elements.btnCalibrateNoise.textContent = "Medindo silêncio da sala (2s)...";
            this.showToast("Fique em silêncio por 2 segundos...", "info");

            const newThreshold = await this.audioManager.calibrateNoise(2.0, this.profile.settings.selectedMicId);
            this.profile.settings.silenceThreshold = Number(newThreshold.toFixed(4));
            this.audioManager.silenceThreshold = this.profile.settings.silenceThreshold;
            this.elements.settingSilenceThreshold.value = this.profile.settings.silenceThreshold;
            this.elements.labelThresholdVal.textContent = this.profile.settings.silenceThreshold;
            this.saveProfile();

            this.elements.btnCalibrateNoise.disabled = false;
            this.elements.btnCalibrateNoise.textContent = "🎯 Calibrar Ruído da Sala";
            this.showToast(`Sensibilidade calibrada para ${this.profile.settings.silenceThreshold}!`);
        });

        // Ações do Editor
        this.elements.editor.addEventListener("input", () => this.updateEditorStats());

        this.elements.btnCopyText.addEventListener("click", () => {
            const text = this.elements.editor.value;
            if (!text.trim()) {
                this.showToast("O editor está vazio!", "info");
                return;
            }
            navigator.clipboard.writeText(text);
            this.showToast("Texto copiado para a Área de Transferência!");
        });

        this.elements.btnDownloadTxt.addEventListener("click", () => {
            const text = this.elements.editor.value;
            if (!text.trim()) {
                this.showToast("Nada para baixar!", "info");
                return;
            }
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            const filename = `ditado_wisp_${dateStr}_transcricao.txt`;

            const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            this.showToast(`Arquivo baixado: ${filename}`);
        });

        this.elements.btnClearText.addEventListener("click", () => {
            if (!this.elements.editor.value.trim()) {
                this.showToast("O editor já está vazio.", "info");
                return;
            }
            if (confirm("Deseja realmente limpar todo o texto do editor? Esta ação não pode ser desfeita.")) {
                this.elements.editor.value = "";
                this.updateEditorStats();
                this.showToast("Editor limpo com sucesso.");
            }
        });
    }

    updateMicUiState(isActive) {
        if (isActive) {
            this.elements.btnToggleMic.classList.add("active");
            this.elements.micStatusLabel.textContent = "Ouvindo sua voz...";
            this.elements.micStatusSub.textContent = "Fale normalmente";
            this.playChime(true);
            this.updateSystemStatus("Ouvindo...", true);
        } else {
            this.elements.btnToggleMic.classList.remove("active");
            this.elements.micStatusLabel.textContent = "Microfone Desligado";
            this.elements.micStatusSub.textContent = "Clique para ligar a escuta";
            this.elements.vuBarFill.style.width = "0%";
            this.playChime(false);
            this.updateSystemStatus("Pronto", false);
        }
    }

    async toggleMicrophone() {
        const now = Date.now();
        if (this._lastToggleTime && (now - this._lastToggleTime) < 400) {
            console.log("[WispApp] toggleMicrophone ignorado por debounce (<400ms)");
            return;
        }
        this._lastToggleTime = now;

        if (this.audioManager.isActive) {
            this.audioManager.stop();
            this.updateMicUiState(false);
            this.showToast("Microfone desligado (Ctrl+F8)", "info");
        } else {
            if (!this.isModelReady) {
                this.showToast("Aguarde o modelo de IA terminar de carregar...", "info");
                return;
            }

            try {
                this.audioManager.silenceThreshold = this.profile.settings.silenceThreshold;
                this.audioManager.pauseDuration = this.profile.settings.pauseDuration;

                await this.audioManager.start(
                    (audioFloat32, durationSec) => this.onSpeechChunkCaptured(audioFloat32, durationSec),
                    (level) => {
                        this.elements.vuBarFill.style.width = `${level}%`;
                    },
                    this.profile.settings.selectedMicId
                );

                this.updateMicUiState(true);
                this.showToast("Microfone ligado - Ouvindo voz (Ctrl+F8)", "success");

                // Permissão concedida: atualiza nomes reais dos dispositivos no dropdown
                this.populateMicrophoneList();
            } catch (err) {
                console.error("Erro ao acessar microfone:", err);
                this.showToast("Permissão de microfone negada ou indisponível!", "error");
            }
        }
    }

    // Quando um trecho de áudio completo é capturado pelo VAD
    onSpeechChunkCaptured(audioFloat32, durationSec) {
        if (!this.isModelReady) return;

        if (this.isWorkerTranscribing) {
            // Fila de buffer sequencial para impedir concorrência no OrtRun()
            if (!this.pendingSpeechQueue) this.pendingSpeechQueue = [];
            if (this.pendingSpeechQueue.length >= 2) {
                this.pendingSpeechQueue.shift();
            }
            this.pendingSpeechQueue.push({ audioFloat32, durationSec });
            return;
        }

        this.dispatchDictationChunk(audioFloat32, durationSec);
    }

    async dispatchDictationChunk(audioFloat32, durationSec) {
        if (!this.isModelReady) return;
        this.isWorkerTranscribing = true;

        // Se o motor nativo Rust (whisper.cpp) estiver ativo no Desktop
        if (this.isDesktop && this.isNativeEngineActive) {
            try {
                const t0 = performance.now();
                const res = await this.invokeNative("transcribe_native_audio", {
                    audio: Array.from(audioFloat32),
                    language: this.profile.settings.language || "portuguese"
                });

                const latency = Math.round(performance.now() - t0);
                this.isWorkerTranscribing = false;
                this.handleTranscriptionSuccess({
                    rawText: res.text,
                    latency: res.latency_ms || latency
                });
                this.processNextPendingDictation();
                return;
            } catch (err) {
                console.warn("[WispApp] Falha na transcrição nativa Rust:", err);
            }
        }

        if (!this.worker) {
            this.isWorkerTranscribing = false;
            return;
        }

        this.worker.postMessage({
            type: "TRANSCRIBE",
            payload: {
                audioFloat32,
                duration: durationSec,
                language: this.profile.settings.language
            }
        });
    }

    processNextPendingDictation() {
        if (this.pendingSpeechQueue && this.pendingSpeechQueue.length > 0 && this.isModelReady && !this.isWorkerTranscribing) {
            const nextItem = this.pendingSpeechQueue.shift();
            this.dispatchDictationChunk(nextItem.audioFloat32, nextItem.durationSec);
        }
    }

    // Tratamento do resultado da transcrição
    handleTranscriptionSuccess(payload) {
        const { rawText, latency } = payload;
        if (!rawText || !rawText.trim()) return;

        this.elements.statLatency.textContent = `${latency} ms`;

        // 1. Aplicar regras de auto-correção
        let processed = rawText.trim();
        for (const [from, to] of Object.entries(this.profile.correction_rules)) {
            const regex = new RegExp(`\\b${from}\\b`, "gi");
            processed = processed.replace(regex, to);
        }

        // 2. Processar comando de voz "Entra"
        let pressEnterAfter = false;
        let pressEnterBefore = false;

        if (this.profile.settings.voiceEnter) {
            const lower = processed.toLowerCase();
            // Caso 1: Disse apenas "entra"
            if (lower === "entra" || lower === "entra." || lower === "entra!") {
                this.injectTextIntoEditor("\n");
                this.pressEnterNative();
                this.recordHistory("[Comando Entra]");
                return;
            }

            // Caso 2: Falou "entra" no final ou início da frase
            if (/\bentra[.!·?]?$/i.test(lower)) {
                processed = processed.replace(/\bentra[.!·?]?$/i, "").trim();
                pressEnterAfter = true;
            } else if (/^entra\b[:, \t]*/i.test(lower)) {
                processed = processed.replace(/^entra\b[:, \t]*/i, "").trim();
                pressEnterBefore = true;
            }
        }

        // 3. Processar comandos explícitos de pontuação por voz
        if (this.profile.settings.voicePunctuation) {
            const rules = [
                [/\b(ponto de exclamação|exclamação)\b/gi, "!"],
                [/\b(ponto de interrogação|interrogação)\b/gi, "?"],
                [/\bponto e vírgula\b/gi, ";"],
                [/\bdois pontos\b/gi, ":"],
                [/\bponto final\b/gi, "."],
                [/\bvírgula\b/gi, ","],
                [/\b(nova linha|parágrafo)\b/gi, "\n"]
            ];

            for (const [pattern, symbol] of rules) {
                processed = processed.replace(pattern, symbol);
            }

            // Ajustar espaçamento de pontuação
            processed = processed.replace(/\s+([,.:;!?])/g, "$1");
            processed = processed.replace(/([,.:;!?])([A-Za-zÀ-ÿ0-9])/g, "$1 $2");
        }

        if (pressEnterBefore) {
            this.injectTextIntoEditor("\n");
            this.pressEnterNative();
        }

        if (processed.trim()) {
            const formatted = processed.trim() + " ";
            this.injectTextIntoEditor(formatted);
            this.injectTextNative(formatted);
            this.recordHistory(processed.trim());
        }

        if (pressEnterAfter) {
            this.injectTextIntoEditor("\n");
            this.pressEnterNative();
        }
    }



    // Helper para invocação nativa robusta no Tauri v2 (suporta __TAURI_INTERNALS__, __TAURI__.core e __TAURI__)
    async invokeNative(cmd, args = {}) {
        try {
            if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function") {
                return await window.__TAURI_INTERNALS__.invoke(cmd, args);
            }
            if (window.__TAURI__?.core && typeof window.__TAURI__.core.invoke === "function") {
                return await window.__TAURI__.core.invoke(cmd, args);
            }
            if (window.__TAURI__ && typeof window.__TAURI__.invoke === "function") {
                return await window.__TAURI__.invoke(cmd, args);
            }
        } catch (e) {
            console.warn(`[Tauri] Erro ao invocar comando '${cmd}':`, e);
            throw e;
        }
        throw new Error("Tauri API indisponível");
    }

    // Verificação de ambiente nativo Tauri Desktop
    async checkDesktopEnvironment() {
        const isTauriHost = (typeof window !== "undefined") && (
            (window.location && window.location.origin && window.location.origin.includes("tauri.localhost")) ||
            window.isTauri === true
        );

        let isNative = false;
        // Tenta detectar Tauri IPC com retry rápido
        for (let attempt = 0; attempt < 12; attempt++) {
            const hasTauriApi = (typeof window !== "undefined") && (
                (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function") ||
                (window.__TAURI__ && (window.__TAURI__.core || window.__TAURI__.invoke))
            );

            if (hasTauriApi || isTauriHost) {
                try {
                    isNative = await this.invokeNative("is_desktop_native").catch(() => false);
                    if (isNative) break;
                } catch (e) {}
            }

            if (isTauriHost && attempt >= 2) {
                isNative = true;
                break;
            }

            await new Promise(r => setTimeout(r, 50));
        }

        if (isNative || isTauriHost) {
            this.isDesktop = true;
            document.body.classList.add("is-desktop");
            console.log("[Wisp Desktop] Modo Desktop Nativo ativado via Tauri!");

            if (this.elements.desktopModeBadge) {
                this.elements.desktopModeBadge.style.display = "inline-flex";
            }
            if (this.elements.desktopHotkeyRow) {
                this.elements.desktopHotkeyRow.style.display = "flex";
            }
            if (this.elements.settingInjectMouse) {
                this.elements.settingInjectMouse.disabled = false;
            }
            if (this.elements.settingInjectMouseDesc) {
                this.elements.settingInjectMouseDesc.textContent = "Digita automaticamente na janela onde o mouse estiver apontado (Word, Bloco de Notas, Navegador, etc.).";
            }

            // Desbloqueia modelos profissionais (Medium e Large Turbo)
            this.unlockDesktopModels();

            // Obter hardware e acelerar modelos
            try {
                const hwInfo = await this.invokeNative("get_system_hardware_info").catch(() => null);
                if (hwInfo) {
                    this.desktopHwInfo = hwInfo;
                    this.renderHardwareBadge(hwInfo);
                    this.unlockDesktopModels(hwInfo);
                }
            } catch (e) {
                console.warn("[Tauri Desktop] Não foi possível ler hardware:", e);
            }

            // Inicializar listener de atalho global
            this.setupDesktopHotkeyListener();

            // Atualiza badge de modo desktop nativo Rust
            if (this.elements.desktopModeBadge) {
                this.elements.desktopModeBadge.innerHTML = `⚡ Motor Nativo Rust / C++ (100% Embutido)`;
                this.elements.desktopModeBadge.style.display = "inline-flex";
            }

            // Carrega modelo diretamente na memória nativa Rust (whisper.cpp)
            await this.loadSelectedModel();
            return;
        }

        // Modo Web puro (GitHub Pages)
        this.isDesktop = false;
        document.body.classList.remove("is-desktop");
        if (this.elements.desktopModeBadge) {
            this.elements.desktopModeBadge.style.display = "none";
        }
        if (this.elements.desktopHotkeyRow) {
            this.elements.desktopHotkeyRow.style.display = "none";
        }
        if (this.elements.settingInjectMouse) {
            this.elements.settingInjectMouse.disabled = true;
        }
        if (this.elements.settingInjectMouseDesc) {
            this.elements.settingInjectMouseDesc.textContent = "Disponível na versão Desktop instalada (no navegador web, o texto vai para o editor abaixo).";
        }
    }


    // Desbloquear modelos de alta capacidade (Medium ~750MB e Large Turbo ~800MB)
    unlockDesktopModels(hwInfo = null) {
        document.body.classList.add("is-desktop");

        const desktopModels = [
            {
                value: "Xenova/whisper-medium",
                label: "👑 Modelo Profissional (~750 MB - Alta Precisão Desktop)"
            },
            {
                value: "onnx-community/whisper-large-v3-turbo",
                label: "⚡ Modelo Ultra Turbo (~800 MB - Máxima Inteligência Desktop)"
            }
        ];

        const selects = [this.elements.selectModel, this.elements.selectLongModel].filter(Boolean);

        for (const select of selects) {
            for (const dm of desktopModels) {
                let opt = select.querySelector(`option[value="${dm.value}"]`);
                if (!opt) {
                    opt = document.createElement("option");
                    opt.value = dm.value;
                    opt.className = "desktop-only-model";
                    select.appendChild(opt);
                }
                opt.textContent = dm.label;
                opt.style.display = "";
            }
        }

        // Se o perfil do usuário salvou um desses modelos, seleciona no dropdown
        if (this.profile && this.profile.settings && this.profile.settings.modelName) {
            if (this.elements.selectModel) {
                this.elements.selectModel.value = this.profile.settings.modelName;
            }
            if (this.elements.selectLongModel) {
                this.elements.selectLongModel.value = this.profile.settings.modelName;
            }
        }

        console.log("[Wisp Desktop] Modelos de alta precisão (Medium e Large Turbo) disponíveis!");
    }

    // Exibe detalhes de hardware no badge de modo desktop
    renderHardwareBadge(hwInfo) {
        if (!this.elements.desktopModeBadge || !hwInfo) return;
        const cores = hwInfo.cpu_cores || 4;
        const ram = hwInfo.total_ram_gb ? Math.round(hwInfo.total_ram_gb) : 8;
        this.elements.desktopModeBadge.innerHTML = `🖥️ Desktop Nativo (${cores} Núcleos / ${ram}GB RAM)`;
        this.elements.desktopModeBadge.title = `Processador: ${cores} núcleos lógicos | Memória RAM: ${hwInfo.total_ram_gb} GB (${hwInfo.avail_ram_gb} GB disponíveis)`;
    }

    // Configura escuta e gerenciamento de atalho global
    async setupDesktopHotkeyListener() {
        if (!this.isDesktop) return;

        // 1. Carregar atalho atual do backend Rust
        try {
            const currentHotkey = await this.invokeNative("get_current_global_hotkey");
            if (currentHotkey && this.elements.inputGlobalHotkey) {
                this.elements.inputGlobalHotkey.value = currentHotkey;
            }
        } catch (e) {
            console.warn("[Tauri Desktop] Erro ao obter atalho configurado:", e);
        }

        // 2. Botão Salvar Atalho
        if (this.elements.btnSaveHotkey && !this.elements.btnSaveHotkey._bound) {
            this.elements.btnSaveHotkey._bound = true;
            this.elements.btnSaveHotkey.addEventListener("click", async () => {
                const newHotkey = this.elements.inputGlobalHotkey ? this.elements.inputGlobalHotkey.value.trim() : "Ctrl+F8";
                try {
                    const res = await this.invokeNative("update_global_hotkey", { hotkey: newHotkey });
                    this.showToast(res || `Atalho atualizado para ${newHotkey}!`, "success");
                } catch (err) {
                    this.showToast(`Erro ao alterar atalho: ${err}`, "error");
                }
            });
        }

        // 3. Ouvir evento de acionamento do atalho global (backup além do window.eval)
        try {
            if (window.__TAURI__ && window.__TAURI__.event && typeof window.__TAURI__.event.listen === "function") {
                await window.__TAURI__.event.listen("global-hotkey-toggle", () => {
                    console.log("[Tauri Desktop] Evento de atalho global capturado via event listener!");
                    this.toggleMicrophone();
                });
            } else if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.listen === "function") {
                await window.__TAURI_INTERNALS__.listen("global-hotkey-toggle", () => {
                    console.log("[Tauri Desktop] Evento de atalho global capturado via internals listener!");
                    this.toggleMicrophone();
                });
            }
        } catch (e) {
            console.warn("[Tauri Desktop] Falha ao registrar event listener de atalho:", e);
        }
    }

    // Injeção de texto direto onde o mouse estiver apontado via Tauri Win32
    async injectTextNative(text) {
        if (!this.isDesktop || this.profile.settings.injectAtCursor === false) return;
        const clickToFocus = this.profile.settings.clickBeforeType === true;
        try {
            await this.invokeNative("inject_text_at_cursor", {
                text: text.trim() + " ",
                clickToFocus: clickToFocus
            });
        } catch (err) {
            console.warn("[Tauri Desktop] Falha ao injetar texto no cursor:", err);
        }
    }

    // Envio do comando Enter na janela focada via Tauri Win32
    async pressEnterNative() {
        if (!this.isDesktop || this.profile.settings.injectAtCursor === false) return;
        try {
            await this.invokeNative("press_enter_at_cursor", {
                clickToFocus: true
            });
        } catch (err) {
            console.warn("[Tauri Desktop] Falha ao enviar Enter no cursor:", err);
        }
    }

    // Inserção inteligente de texto no cursor do editor
    injectTextIntoEditor(text) {
        const editor = this.elements.editor;
        if (!editor) return;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const currentVal = editor.value;

        editor.value = currentVal.substring(0, start) + text + currentVal.substring(end);
        editor.selectionStart = editor.selectionEnd = start + text.length;

        // Só dá foco no editor HTML se NÃO estiver no modo desktop com injeção externa ativa
        if (!this.isDesktop || this.profile.settings.injectAtCursor === false) {
            editor.focus();
        }
        editor.scrollTop = editor.scrollHeight; // Auto-scroll dinâmico
        this.updateEditorStats();
    }

    updateEditorStats() {
        const fullText = this.elements.editor.value;
        const trimmed = fullText.trim();
        
        // Divide por espaços em branco para contar palavras reais
        const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
        
        // Contagem de caracteres: total (com espaços) e contagem sem espaços
        const charsTotal = fullText.length;
        const charsNoSpaces = fullText.replace(/\s/g, "").length;

        this.elements.statWordCount.textContent = words;
        this.elements.statCharCount.textContent = `${charsTotal} (${charsNoSpaces} sem espaços)`;
    }

    recordHistory(phrase) {
        const timeStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        this.profile.phrase_history.unshift({ time: timeStr, text: phrase });

        if (this.profile.phrase_history.length > 100) {
            this.profile.phrase_history.pop();
        }

        this.saveProfile();
        this.renderHistoryTable();
    }

    // Sintetizador de Beep Sonoro via Web Audio API
    playChime(isAscending) {
        if (!this.profile.settings.soundFeedback) return;

        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "sine";
            const now = ctx.currentTime;

            if (isAscending) {
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
            } else {
                osc.frequency.setValueAtTime(880, now);
                osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);
            }

            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now);
            osc.stop(now + 0.16);
        } catch (e) {
            // Silencioso se navegador bloquear autoplay
        }
    }

    // Gerenciamento de Perfil e Configurações
    initProfileManager() {
        // Form Vocabulário
        this.elements.formAddVocab.addEventListener("submit", (e) => {
            e.preventDefault();
            const val = this.elements.inputNewVocab.value.trim();
            if (val && !this.profile.custom_vocabulary.includes(val)) {
                this.profile.custom_vocabulary.push(val);
                this.saveProfile();
                this.renderVocabTable();
                this.elements.inputNewVocab.value = "";
                this.showToast(`Termo '${val}' adicionado ao vocabulário!`);
            }
        });

        // Form Regras
        this.elements.formAddRule.addEventListener("submit", (e) => {
            e.preventDefault();
            const from = this.elements.inputRuleFrom.value.trim();
            const to = this.elements.inputRuleTo.value.trim();
            if (from && to) {
                this.profile.correction_rules[from] = to;
                this.saveProfile();
                this.renderRulesTable();
                this.elements.inputRuleFrom.value = "";
                this.elements.inputRuleTo.value = "";
                this.showToast(`Regra '${from}' ➔ '${to}' salva!`);
            }
        });

        // Configurações Toggles & Sliders
        this.elements.settingSoundFeedback.checked = this.profile.settings.soundFeedback;
        this.elements.settingSoundFeedback.addEventListener("change", (e) => {
            this.profile.settings.soundFeedback = e.target.checked;
            this.saveProfile();
        });

        this.elements.settingVoicePunctuation.checked = this.profile.settings.voicePunctuation;
        this.elements.settingVoicePunctuation.addEventListener("change", (e) => {
            this.profile.settings.voicePunctuation = e.target.checked;
            this.saveProfile();
        });

        this.elements.settingVoiceEnter.checked = this.profile.settings.voiceEnter;
        this.elements.settingVoiceEnter.addEventListener("change", (e) => {
            this.profile.settings.voiceEnter = e.target.checked;
            this.saveProfile();
        });

        if (this.elements.settingInjectMouse) {
            this.elements.settingInjectMouse.checked = this.profile.settings.injectAtCursor !== false;
        if (this.elements.settingClickBefore) {
            this.elements.settingClickBefore.checked = this.profile.settings.clickBeforeType === true;
            this.elements.settingClickBefore.addEventListener("change", (e) => {
                this.profile.settings.clickBeforeType = e.target.checked;
                this.saveProfile();
            });
        }
            this.elements.settingInjectMouse.addEventListener("change", (e) => {
                this.profile.settings.injectAtCursor = e.target.checked;
                this.saveProfile();
            });
        }

        this.elements.settingPauseDuration.value = this.profile.settings.pauseDuration;
        this.elements.labelPauseVal.textContent = `${this.profile.settings.pauseDuration} s`;
        this.elements.settingPauseDuration.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            this.elements.labelPauseVal.textContent = `${val} s`;
            this.profile.settings.pauseDuration = val;
            this.saveProfile();
        });

        this.elements.settingSilenceThreshold.value = this.profile.settings.silenceThreshold;
        this.elements.labelThresholdVal.textContent = this.profile.settings.silenceThreshold;
        this.elements.settingSilenceThreshold.addEventListener("input", (e) => {
            const val = parseFloat(e.target.value);
            this.elements.labelThresholdVal.textContent = val;
            this.profile.settings.silenceThreshold = val;
            this.saveProfile();
        });

        // Ações de Histórico
        this.elements.btnCopyHistory.addEventListener("click", () => {
            const lines = this.profile.phrase_history.map(item => `[${item.time}] ${item.text}`).join("\n");
            if (!lines) {
                this.showToast("Histórico vazio!", "info");
                return;
            }
            navigator.clipboard.writeText(lines);
            this.showToast("Todo o histórico copiado!");
        });

        this.elements.btnClearHistory.addEventListener("click", () => {
            if (this.profile.phrase_history.length && confirm("Limpar todo o histórico de falas?")) {
                this.profile.phrase_history = [];
                this.saveProfile();
                this.renderHistoryTable();
                this.showToast("Histórico limpo.");
            }
        });

        // Backup & Portabilidade
        this.elements.btnExportProfile.addEventListener("click", () => {
            const jsonStr = JSON.stringify(this.profile, null, 4);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `wisp_perfil_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this.showToast("Perfil exportado com sucesso!");
        });

        this.elements.inputImportProfile.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target.result);
                    if (imported.custom_vocabulary || imported.correction_rules) {
                        this.profile = { ...this.profile, ...imported };
                        this.saveProfile();
                        this.renderAll();
                        this.showToast("Perfil importado com sucesso!");
                    } else {
                        throw new Error("Formato inválido");
                    }
                } catch (err) {
                    this.showToast("Arquivo JSON de perfil inválido!", "error");
                }
            };
            reader.readAsText(file);
            e.target.value = "";
        });

        if (this.elements.btnClearModelCache) {
            this.elements.btnClearModelCache.addEventListener("click", () => this.clearModelCache());
        }

        this.elements.btnResetProfile.addEventListener("click", () => {
            if (confirm("Deseja restaurar as configurações e vocabulário para os padrões de fábrica?")) {
                this.profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
                this.saveProfile();
                this.renderAll();
                this.showToast("Perfil restaurado aos padrões (3 itens de teste)!");
            }
        });
    }

    renderAll() {
        this.renderVocabTable();
        this.renderRulesTable();
        this.renderHistoryTable();
    }

    renderVocabTable() {
        const tbody = this.elements.tbodyVocab;
        if (!tbody) return;
        tbody.innerHTML = "";

        if (this.profile.custom_vocabulary.length === 0) {
            tbody.innerHTML = `<tr><td colspan="2" style="text-align: center; color: var(--text-muted);">Nenhum termo cadastrado.</td></tr>`;
            return;
        }

        this.profile.custom_vocabulary.forEach((word, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${word}</strong></td>
                <td style="text-align: center;">
                    <button class="action-btn danger btn-del-vocab" data-idx="${idx}" style="padding: 4px 8px; font-size: 0.8rem;">
                        🗑️ Excluir
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll(".btn-del-vocab").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                this.profile.custom_vocabulary.splice(idx, 1);
                this.saveProfile();
                this.renderVocabTable();
            });
        });
    }

    renderRulesTable() {
        const tbody = this.elements.tbodyRules;
        if (!tbody) return;
        tbody.innerHTML = "";

        const rules = Object.entries(this.profile.correction_rules);
        if (rules.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Nenhuma regra cadastrada.</td></tr>`;
            return;
        }

        rules.forEach(([from, to]) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><code>${from}</code></td>
                <td><strong style="color: var(--accent-green);">${to}</strong></td>
                <td style="text-align: center;">
                    <button class="action-btn danger btn-del-rule" data-from="${from}" style="padding: 4px 8px; font-size: 0.8rem;">
                        🗑️ Excluir
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll(".btn-del-rule").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const key = e.target.getAttribute("data-from");
                delete this.profile.correction_rules[key];
                this.saveProfile();
                this.renderRulesTable();
            });
        });
    }

    renderHistoryTable() {
        const tbody = this.elements.tbodyHistory;
        if (!tbody) return;
        tbody.innerHTML = "";

        if (this.profile.phrase_history.length === 0) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Nenhuma transcrição recente registrada.</td></tr>`;
            return;
        }

        this.profile.phrase_history.forEach((item, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="color: var(--text-muted); font-size: 0.85rem;">${item.time}</td>
                <td>${item.text}</td>
                <td style="text-align: center; display: flex; gap: 6px; justify-content: center;">
                    <button class="action-btn btn-copy-phrase" data-text="${item.text.replace(/"/g, '&quot;')}" style="padding: 4px 8px; font-size: 0.8rem;">
                        📋
                    </button>
                    <button class="action-btn danger btn-del-phrase" data-idx="${idx}" style="padding: 4px 8px; font-size: 0.8rem;">
                        🗑️
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll(".btn-copy-phrase").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const text = e.target.getAttribute("data-text");
                navigator.clipboard.writeText(text);
                this.showToast("Frase copiada!");
            });
        });

        tbody.querySelectorAll(".btn-del-phrase").forEach(btn => {
            btn.addEventListener("click", (e) => {
                const idx = parseInt(e.target.getAttribute("data-idx"));
                this.profile.phrase_history.splice(idx, 1);
                this.saveProfile();
                this.renderHistoryTable();
            });
        });
    }

    async clearModelCache() {
        if (!confirm("Deseja realmente apagar os modelos de IA salvos no cache do navegador?\n\nIsso liberará espaço em disco. O próximo uso do gravador fará o download do modelo novamente.")) {
            return;
        }

        try {
            let deletedCount = 0;
            // 1. Limpa Cache API do navegador
            if ("caches" in window) {
                const keys = await window.caches.keys();
                for (const key of keys) {
                    if (key.includes("transformers") || key.includes("onnx") || key.includes("wisp")) {
                        await window.caches.delete(key);
                        deletedCount++;
                    }
                }
            }

            // 2. Limpa bancos IndexedDB gerados pelo Transformers.js / ONNX Runtime
            if (window.indexedDB && window.indexedDB.databases) {
                try {
                    const dbs = await window.indexedDB.databases();
                    for (const db of dbs) {
                        if (db.name && (db.name.includes("transformers") || db.name.includes("onnx"))) {
                            window.indexedDB.deleteDatabase(db.name);
                            deletedCount++;
                        }
                    }
                } catch (_) {}
            }

            this.showToast("Cache de modelos IA liberado com sucesso!", "success");
            if (this.elements.labelCacheStatus) {
                this.elements.labelCacheStatus.textContent = "Cache liberado. O próximo uso baixará o modelo novamente.";
                this.elements.labelCacheStatus.style.color = "var(--accent-green)";
            }
        } catch (err) {
            console.error("Erro ao limpar cache:", err);
            this.showToast("Erro ao limpar cache: " + err.message, "error");
        }
    }

    showToast(message, type = "success") {
        const container = this.elements.toastContainer;
        if (!container) return;
        const toast = document.createElement("div");
        toast.className = "toast";

        const icon = type === "error" ? "❌" : (type === "info" ? "ℹ️" : "✅");
        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(10px)";
            toast.style.transition = "all 0.3s ease";
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }


    // =========================================================================
    // CONTROLADOR DA ABA: ÁUDIO LONGO & ARQUIVOS
    // =========================================================================
    initLongAudioController() {
        // Estado do Áudio Longo
        this.longAudioData = null; // { audioFloat32, durationSec, wavBlob, name }
        this.longRecordStartTime = 0;
        this.longRecordElapsedSec = 0;
        this.longRecordTimerInterval = null;
        this.isLongRecording = false;
        this.isLongPaused = false;

        // Estado do Processamento em Lote
        this.isBatchProcessing = false;
        this.isBatchCancelled = false;
        this.batchChunks = [];
        this.batchCurrentIndex = 0;
        this.batchStartTime = 0;
        this.batchChunkLatencies = [];
        this.batchResults = []; // [{ chunkIndex, startSec, endSec, rawText, processedText }]

        // Alternância de Modos (Gravação vs Upload)
        if (this.elements.btnModeRecord && this.elements.btnModeUpload) {
            this.elements.btnModeRecord.addEventListener("click", () => this.switchLongAudioMode("record"));
            this.elements.btnModeUpload.addEventListener("click", () => this.switchLongAudioMode("upload"));
        }

        // Controles de Gravação Contínua
        if (this.elements.btnLongStart) {
            this.elements.btnLongStart.addEventListener("click", () => this.startLongRecording());
            this.elements.btnLongPause.addEventListener("click", () => this.togglePauseLongRecording());
            this.elements.btnLongFinish.addEventListener("click", () => this.finishLongRecording());
            this.elements.btnLongDiscard.addEventListener("click", () => this.discardLongRecording());
        }

        // Upload de Arquivo (Drag & Drop e Input File)
        if (this.elements.audioDropzone && this.elements.inputAudioFile) {
            this.elements.audioDropzone.addEventListener("click", () => this.elements.inputAudioFile.click());
            
            this.elements.audioDropzone.addEventListener("dragover", (e) => {
                e.preventDefault();
                this.elements.audioDropzone.classList.add("dragover");
            });

            this.elements.audioDropzone.addEventListener("dragleave", () => {
                this.elements.audioDropzone.classList.remove("dragover");
            });

            this.elements.audioDropzone.addEventListener("drop", (e) => {
                e.preventDefault();
                this.elements.audioDropzone.classList.remove("dragover");
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    this.handleAudioFileSelected(e.dataTransfer.files[0]);
                }
            });

            this.elements.inputAudioFile.addEventListener("change", (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    this.handleAudioFileSelected(e.target.files[0]);
                }
            });
        }

        // Ações do Áudio Preparado
        if (this.elements.btnDownloadRawAudio) {
            this.elements.btnDownloadRawAudio.addEventListener("click", () => this.downloadPreparedRawAudio());
        }

        if (this.elements.btnStartBatchTranscribe) {
            this.elements.btnStartBatchTranscribe.addEventListener("click", () => this.startBatchTranscription());
        }

        if (this.elements.btnCancelBatch) {
            this.elements.btnCancelBatch.addEventListener("click", () => this.cancelBatchTranscription());
        }

        // Ações do Editor de Resultados
        if (this.elements.checkShowTimestamps) {
            this.elements.checkShowTimestamps.addEventListener("change", () => this.renderBatchResults());
        }

        if (this.elements.btnCopyLongResult) {
            this.elements.btnCopyLongResult.addEventListener("click", () => {
                const text = this.elements.longTranscriptionEditor.value;
                if (!text.trim()) {
                    this.showToast("Nenhum texto para copiar!", "info");
                    return;
                }
                navigator.clipboard.writeText(text);
                const originalHtml = this.elements.btnCopyLongResult.innerHTML;
                this.elements.btnCopyLongResult.innerHTML = "✅ Copiado!";
                setTimeout(() => {
                    this.elements.btnCopyLongResult.innerHTML = originalHtml;
                }, 1800);
                this.showToast("Transcrição copiada com sucesso!");
            });
        }

        if (this.elements.btnDownloadLongTxt) {
            this.elements.btnDownloadLongTxt.addEventListener("click", () => this.downloadLongAsTxt());
        }

        if (this.elements.btnDownloadLongSrt) {
            this.elements.btnDownloadLongSrt.addEventListener("click", () => this.downloadLongAsSrt());
        }

        if (this.elements.btnClearLongResult) {
            this.elements.btnClearLongResult.addEventListener("click", () => {
                if (!this.elements.longTranscriptionEditor.value.trim()) {
                    this.showToast("O editor de transcrição já está vazio.", "info");
                    return;
                }
                if (confirm("Deseja realmente limpar todo o texto da transcrição? Esta ação não pode ser desfeita.")) {
                    this.batchResults = [];
                    this.elements.longTranscriptionEditor.value = "";
                    this.updateLongEditorStats();
                    this.showToast("Texto da transcrição limpo com sucesso.");
                }
            });
        }
    }

    switchLongAudioMode(mode) {
        if (mode === "record") {
            this.elements.btnModeRecord.classList.add("active");
            this.elements.btnModeUpload.classList.remove("active");
            this.elements.panelLongRecord.style.display = "block";
            this.elements.panelLongUpload.style.display = "none";
        } else {
            this.elements.btnModeUpload.classList.add("active");
            this.elements.btnModeRecord.classList.remove("active");
            this.elements.panelLongUpload.style.display = "block";
            this.elements.panelLongRecord.style.display = "none";
        }
    }

    // Iniciar Gravação Contínua
    async startLongRecording() {
        if (this.isLongRecording) return;

        try {
            this.isLongRecording = true;
            this.isLongPaused = false;
            this.longRecordElapsedSec = 0;
            this.elements.longRecordTimer.textContent = "00:00:00";

            await this.audioManager.startContinuousRecording(
                (level) => {
                    if (this.elements.longVuBarFill) {
                        this.elements.longVuBarFill.style.width = `${level}%`;
                    }
                },
                this.profile.settings.selectedMicId
            );

            this.longRecordStartTime = Date.now();
            this.longRecordTimerInterval = setInterval(() => {
                if (!this.isLongPaused) {
                    this.longRecordElapsedSec++;
                    this.elements.longRecordTimer.textContent = this.formatTimerSeconds(this.longRecordElapsedSec);
                }
            }, 1000);

            // Atualiza UI
            this.elements.longRecordDot.className = "record-pulse-dot recording";
            this.elements.longRecordStatusText.textContent = "Gravando áudio contínuo...";
            this.elements.btnLongStart.style.display = "none";
            this.elements.btnLongPause.style.display = "inline-flex";
            this.elements.btnLongFinish.style.display = "inline-flex";
            this.elements.btnLongDiscard.style.display = "inline-flex";

            this.playChime(true);
            this.showToast("Gravação contínua iniciada!");
        } catch (err) {
            this.isLongRecording = false;
            console.error("Erro ao iniciar gravação contínua:", err);
            this.showToast("Erro ao acessar microfone: " + err.message, "error");
        }
    }

    togglePauseLongRecording() {
        if (!this.isLongRecording) return;

        if (!this.isLongPaused) {
            this.audioManager.pauseContinuousRecording();
            this.isLongPaused = true;
            this.elements.longRecordDot.className = "record-pulse-dot paused";
            this.elements.longRecordStatusText.textContent = "Gravação Pausada";
            this.elements.btnLongPause.textContent = "▶️ Retomar";
            this.showToast("Gravação pausada.");
        } else {
            this.audioManager.resumeContinuousRecording();
            this.isLongPaused = false;
            this.elements.longRecordDot.className = "record-pulse-dot recording";
            this.elements.longRecordStatusText.textContent = "Gravando áudio contínuo...";
            this.elements.btnLongPause.textContent = "⏸️ Pausar";
            this.showToast("Gravação retomada.");
        }
    }

    finishLongRecording() {
        if (!this.isLongRecording) return;

        clearInterval(this.longRecordTimerInterval);
        this.longRecordTimerInterval = null;

        const result = this.audioManager.stopContinuousRecording();
        this.isLongRecording = false;
        this.isLongPaused = false;

        // Reset UI de Gravação
        this.elements.longRecordDot.className = "record-pulse-dot";
        this.elements.longRecordStatusText.textContent = "Gravação concluída!";
        this.elements.btnLongStart.style.display = "inline-flex";
        this.elements.btnLongPause.style.display = "none";
        this.elements.btnLongFinish.style.display = "none";
        this.elements.btnLongDiscard.style.display = "none";
        if (this.elements.longVuBarFill) this.elements.longVuBarFill.style.width = "0%";

        if (!result || result.durationSec < 0.5) {
            this.showToast("Áudio gravado muito curto para transcrição.", "info");
            return;
        }

        const dateStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        this.setPreparedAudio(result.audioFloat32, result.durationSec, result.wavBlob, `gravacao_wisp_${dateStr}.wav`);
        this.showToast(`Áudio gravado com sucesso (${this.formatTimerSeconds(result.durationSec)})!`);
    }

    discardLongRecording() {
        if (!confirm("Deseja realmente descartar esta gravação?")) return;

        clearInterval(this.longRecordTimerInterval);
        this.longRecordTimerInterval = null;
        this.audioManager.stopContinuousRecording();

        this.isLongRecording = false;
        this.isLongPaused = false;
        this.longRecordElapsedSec = 0;

        this.elements.longRecordTimer.textContent = "00:00:00";
        this.elements.longRecordDot.className = "record-pulse-dot";
        this.elements.longRecordStatusText.textContent = "Pronto para iniciar gravação";
        this.elements.btnLongStart.style.display = "inline-flex";
        this.elements.btnLongPause.style.display = "none";
        this.elements.btnLongFinish.style.display = "none";
        this.elements.btnLongDiscard.style.display = "none";
        if (this.elements.longVuBarFill) this.elements.longVuBarFill.style.width = "0%";

        this.showToast("Gravação descartada.", "info");
    }

    // Tratamento de Arquivo de Áudio Carregado (Upload)
    async handleAudioFileSelected(file) {
        if (!file) return;

        try {
            this.showToast("Decodificando arquivo de áudio no navegador...", "info");
            const result = await this.audioManager.decodeAudioFile(file);

            if (!result || result.durationSec < 0.5) {
                this.showToast("Arquivo de áudio inválido ou sem dados sonoros.", "error");
                return;
            }

            this.setPreparedAudio(result.audioFloat32, result.durationSec, result.wavBlob, file.name);
            this.showToast(`Arquivo '${file.name}' decodificado e pronto para transcrição!`);
        } catch (err) {
            console.error("Erro ao decodificar arquivo:", err);
            this.showToast("Falha ao abrir arquivo de áudio: " + err.message, "error");
        }
    }

    // Configura o áudio pronto para pré-visualização e transcrição
    setPreparedAudio(audioFloat32, durationSec, wavBlob, name) {
        this.longAudioData = {
            audioFloat32,
            durationSec,
            wavBlob,
            name
        };

        // Carrega áudio no player
        const audioUrl = URL.createObjectURL(wavBlob);
        this.elements.audioPreviewPlayer.src = audioUrl;

        // Atualiza textos informativos
        const mb = (wavBlob.size / (1024 * 1024)).toFixed(1);
        this.elements.labelAudioInfo.textContent = `Arquivo: ${name} | Duração: ${this.formatTimerSeconds(durationSec)} | Tamanho: ${mb} MB`;

        // Exibe painel de áudio pronto e rola suavemente
        this.elements.panelAudioReady.style.display = "block";
        this.elements.panelAudioReady.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // Gera nome base limpo e padronizado para exportações de arquivo
    getExportBaseName() {
        let base = "gravacao_wisp";
        if (this.longAudioData && this.longAudioData.name) {
            base = this.longAudioData.name.replace(/\.(wav|mp3|m4a|ogg|webm|flac|aac|wma)$/i, "");
        } else {
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            base = `gravacao_wisp_${dateStr}`;
        }
        base = base.replace(/(_transcricao|_audio)+$/gi, "");
        return base;
    }

    downloadPreparedRawAudio() {
        if (!this.longAudioData || !this.longAudioData.wavBlob) return;

        const url = URL.createObjectURL(this.longAudioData.wavBlob);
        const a = document.createElement("a");
        a.href = url;
        const filename = `${this.getExportBaseName()}_audio.wav`;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast(`Áudio bruto baixado: ${filename}`);
    }

    // Iniciar Transcrição Completa em Lote (Smart Chunking de 25 segundos)
    async startBatchTranscription() {
        if (!this.longAudioData || !this.longAudioData.audioFloat32) {
            this.showToast("Nenhum áudio carregado para transcrição!", "info");
            return;
        }

        // Previne disparos paralelos
        if (this.isBatchProcessing) {
            this.showToast("A transcrição já está em processamento.", "info");
            return;
        }

        const selectedModel = this.elements.selectLongModel.value;

        // Desabilita botão de início e ativa botão de cancelamento
        this.elements.btnStartBatchTranscribe.disabled = true;
        this.elements.btnCancelBatch.disabled = false;
        this.elements.btnCancelBatch.textContent = "🛑 Cancelar Transcrição";

        // Se o modelo escolhido for diferente do modelo atualmente carregado na memória do Worker
        if (this.profile.settings.modelName !== selectedModel) {
            this.showToast(`Carregando modelo '${selectedModel}' para transcrição longa...`, "info");
            this.profile.settings.modelName = selectedModel;
            this.elements.selectModel.value = selectedModel;
            this.saveProfile();
            this.loadSelectedModel();

            // Aguarda o modelo estar pronto com timeout de segurança
            const loaded = await new Promise((resolve) => {
                const startTime = Date.now();
                const checkInterval = setInterval(() => {
                    if (this.isModelReady) {
                        clearInterval(checkInterval);
                        resolve(true);
                    } else if (Date.now() - startTime > 45000) {
                        clearInterval(checkInterval);
                        resolve(false);
                    }
                }, 200);
            });

            if (!loaded && !this.isModelReady) {
                this.showToast("Tempo esgotado ao preparar modelo. Tente novamente.", "error");
                this.elements.btnStartBatchTranscribe.disabled = false;
                return;
            }
        }

        // Se o modelo padrão ainda não terminou de baixar na primeira carga da página
        if (!this.isModelReady) {
            this.showToast("Aguardando inicialização do modelo de IA...", "info");
            const ready = await new Promise((resolve) => {
                const startTime = Date.now();
                const checkInterval = setInterval(() => {
                    if (this.isModelReady) {
                        clearInterval(checkInterval);
                        resolve(true);
                    } else if (Date.now() - startTime > 30000) {
                        clearInterval(checkInterval);
                        resolve(false);
                    }
                }, 200);
            });
            if (!ready && !this.isModelReady) {
                this.showToast("O modelo de IA ainda está sendo baixado. Aguarde a conclusão da barra azul.", "warning");
                this.elements.btnStartBatchTranscribe.disabled = false;
                return;
            }
        }

        // Fatiamento do áudio em blocos sequenciais de 25 segundos
        // 25s é seguro, rápido e fica confortavelmente dentro da janela nativa de 30s do Whisper
        const CHUNK_DURATION_SEC = 25;
        const sampleRate = 16000;
        const totalSamples = this.longAudioData.audioFloat32.length;
        const samplesPerChunk = CHUNK_DURATION_SEC * sampleRate;
        const totalChunks = Math.ceil(totalSamples / samplesPerChunk);

        this.batchChunks = [];
        for (let i = 0; i < totalChunks; i++) {
            const startSample = i * samplesPerChunk;
            const endSample = Math.min(totalSamples, (i + 1) * samplesPerChunk);
            // slice() cria uma cópia isolada de buffer pequeno e limpo (evita manter referências ao buffer gigante)
            const slice = new Float32Array(this.longAudioData.audioFloat32.slice(startSample, endSample));

            this.batchChunks.push({
                chunkIndex: i,
                totalChunks,
                startSec: Math.round(startSample / sampleRate),
                endSec: Math.round(endSample / sampleRate),
                audioFloat32: slice
            });
        }

        // Inicializa estado do lote
        this.isBatchProcessing = true;
        this.isBatchCancelled = false;
        this.batchCurrentIndex = 0;
        this.batchResults = [];
        this.batchStartTime = performance.now();
        this.batchChunkLatencies = [];

        // Exibe painéis de progresso e resultado
        this.elements.panelBatchProgress.style.display = "block";
        this.elements.panelBatchResults.style.display = "block";
        this.elements.labelBatchStatus.style.color = "var(--text-primary)";
        this.elements.longTranscriptionEditor.value = "";
        this.updateBatchProgressUI(0, totalChunks);

        this.elements.panelBatchProgress.scrollIntoView({ behavior: "smooth", block: "nearest" });
        this.showToast(`Iniciando transcrição de ${totalChunks} blocos de áudio...`);

        // Dispara o primeiro bloco
        this.dispatchNextBatchChunk();
    }

    dispatchNextBatchChunk() {
        if (this.batchChunkTimeout) {
            clearTimeout(this.batchChunkTimeout);
            this.batchChunkTimeout = null;
        }

        if (!this.isBatchProcessing || this.isBatchCancelled) {
            this.elements.btnStartBatchTranscribe.disabled = false;
            return;
        }

        if (this.batchCurrentIndex >= this.batchChunks.length) {
            // Todos os blocos foram processados!
            this.finishBatchTranscription();
            return;
        }

        const chunk = this.batchChunks[this.batchCurrentIndex];
        const language = this.elements.selectLongLang.value || "portuguese";
        const modelName = this.elements.selectLongModel.value || this.profile.settings.modelName || "";

        this.updateBatchProgressUI(this.batchCurrentIndex, this.batchChunks.length);

        // Se o motor nativo Rust (whisper.cpp) estiver ativo, transcreve direto na memória!
        if (this.isDesktop && this.isNativeEngineActive) {
            const t0 = performance.now();
            this.invokeNative("transcribe_native_audio", {
                audio: Array.from(chunk.audioFloat32),
                language: language
            })
            .then(res => {
                const latency = Math.round(performance.now() - t0);
                this.handleBatchChunkSuccess({
                    chunkIndex: chunk.chunkIndex,
                    totalChunks: chunk.totalChunks,
                    rawText: res.text,
                    latency: res.latency_ms || latency,
                    startSec: chunk.startSec,
                    endSec: chunk.endSec
                });
            })
            .catch(err => {
                console.warn("[Batch] Falha na transcrição nativa Rust, tentando fallback:", err);
                if (this.worker) {
                    this.worker.postMessage({
                        type: "TRANSCRIBE_CHUNK",
                        payload: {
                            chunkIndex: chunk.chunkIndex,
                            totalChunks: chunk.totalChunks,
                            audioFloat32: chunk.audioFloat32,
                            language: language,
                            startSec: chunk.startSec,
                            endSec: chunk.endSec
                        }
                    });
                } else {
                    this.handleBatchChunkError({
                        chunkIndex: chunk.chunkIndex,
                        message: err.message || String(err)
                    });
                }
            });
            return;
        }

        let chunkTimeoutMs = 60000;
        if (modelName.includes("medium") || modelName.includes("large")) {
            chunkTimeoutMs = 180000; // 3 minutos para medium em WASM CPU
        } else if (modelName.includes("small")) {
            chunkTimeoutMs = 100000; // 100s para small (150MB)
        }

        this.batchChunkTimeout = setTimeout(() => {
            if (this.isBatchProcessing && !this.isBatchCancelled) {
                console.warn(`[Batch] Bloco ${chunk.chunkIndex} excedeu tempo limite de ${chunkTimeoutMs / 1000}s. Avançando...`);
                this.handleBatchChunkError({
                    chunkIndex: chunk.chunkIndex,
                    message: "Tempo limite de processamento excedido para este modelo."
                });
            }
        }, chunkTimeoutMs);

        if (this.worker) {
            this.worker.postMessage({
                type: "TRANSCRIBE_CHUNK",
                payload: {
                    chunkIndex: chunk.chunkIndex,
                    totalChunks: chunk.totalChunks,
                    audioFloat32: chunk.audioFloat32,
                    language: language,
                    startSec: chunk.startSec,
                    endSec: chunk.endSec
                }
            });
        }
    }

    handleBatchChunkSuccess(payload) {
        if (this.batchChunkTimeout) {
            clearTimeout(this.batchChunkTimeout);
            this.batchChunkTimeout = null;
        }

        if (!this.isBatchProcessing || this.isBatchCancelled) return;

        const { chunkIndex, totalChunks, rawText, latency, startSec, endSec } = payload;
        this.batchChunkLatencies.push(latency);

        // Aplica regras de auto-correção
        let processed = (rawText || "").trim();
        for (const [from, to] of Object.entries(this.profile.correction_rules || {})) {
            const regex = new RegExp(`\\b${from}\\b`, "gi");
            processed = processed.replace(regex, to);
        }

        this.batchResults.push({
            chunkIndex,
            startSec,
            endSec,
            rawText,
            processedText: processed
        });

        // Atualiza renderização de texto imediatamente e progresso
        this.renderBatchResults();
        this.batchCurrentIndex++;
        this.updateBatchProgressUI(this.batchCurrentIndex, totalChunks);

        // Dispara próximo bloco
        this.dispatchNextBatchChunk();
    }

    handleBatchChunkError(payload) {
        if (this.batchChunkTimeout) {
            clearTimeout(this.batchChunkTimeout);
            this.batchChunkTimeout = null;
        }

        if (!this.isBatchProcessing || this.isBatchCancelled) return;

        console.warn(`Erro no bloco ${payload.chunkIndex}:`, payload.message);
        const chunk = this.batchChunks[this.batchCurrentIndex] || { startSec: 0, endSec: 0 };

        // Diagnóstico claro no placeholder conforme o motivo do erro
        let placeholder = "[Trecho não decodificado ou com ruído]";
        if (payload.message && payload.message.includes("Tempo limite")) {
            placeholder = "[Tempo limite excedido - processamento muito lento para este modelo]";
        } else if (payload.message && (payload.message.includes("memória") || payload.message.includes("bad_alloc") || payload.message.includes("OrtRun"))) {
            placeholder = "[Memória do navegador esgotada para modelo de 750MB. Recomendado: Modelo Avançado 150MB]";
            if (!this.hasShownMemoryWarning) {
                this.hasShownMemoryWarning = true;
                this.showToast("O modelo de 750 MB excedeu o limite de memória WebAssembly. Recomendamos o Modelo Avançado (150 MB).", "warning", 8000);
            }
        }

        this.batchResults.push({
            chunkIndex: payload.chunkIndex,
            startSec: chunk.startSec,
            endSec: chunk.endSec,
            rawText: "",
            processedText: placeholder
        });

        this.renderBatchResults();
        this.batchCurrentIndex++;
        this.updateBatchProgressUI(this.batchCurrentIndex, this.batchChunks.length);
        this.dispatchNextBatchChunk();
    }

    updateBatchProgressUI(completed, total) {
        if (!total || total <= 0) return;
        const pct = Math.min(100, Math.round((completed / total) * 100));
        this.elements.batchProgressBarFill.style.width = `${pct}%`;
        this.elements.labelBatchPercentage.textContent = `${pct}%`;
        this.elements.metricBatchChunk.textContent = `${completed} / ${total}`;

        // Tempo decorrido
        const elapsedSec = Math.round((performance.now() - this.batchStartTime) / 1000);
        this.elements.metricBatchElapsed.textContent = this.formatTimerSeconds(elapsedSec);

        // Estimativa restante (ETA)
        if (completed > 0 && this.batchChunkLatencies.length > 0) {
            const avgLatencySec = (this.batchChunkLatencies.reduce((a, b) => a + b, 0) / this.batchChunkLatencies.length) / 1000;
            const remainingChunks = total - completed;
            const etaSec = Math.max(0, Math.round(remainingChunks * avgLatencySec));
            this.elements.metricBatchEta.textContent = `~${this.formatTimerSeconds(etaSec)}`;
        } else {
            this.elements.metricBatchEta.textContent = "Calculando...";
        }

        if (completed >= total) {
            this.elements.labelBatchStatus.textContent = "Transcrição Concluída com Sucesso! 🎉";
            this.elements.labelBatchStatus.style.color = "var(--accent-emerald)";
            this.elements.metricBatchEta.textContent = "00:00";
        } else {
            this.elements.labelBatchStatus.textContent = `Processando bloco ${completed + 1} de ${total}...`;
            this.elements.labelBatchStatus.style.color = "var(--text-primary)";
        }
    }

    cancelBatchTranscription() {
        if (this.batchChunkTimeout) {
            clearTimeout(this.batchChunkTimeout);
            this.batchChunkTimeout = null;
        }

        if (!this.isBatchProcessing && !this.isModelReady) {
            this.isBatchCancelled = true;
            this.elements.btnStartBatchTranscribe.disabled = false;
            this.showToast("Operação cancelada.", "info");
            return;
        }

        this.isBatchCancelled = true;
        this.isBatchProcessing = false;

        // Reinicia o Worker para interromper imediatamente qualquer inferência pesada presa em WASM
        try {
            if (this.worker) {
                this.worker.terminate();
                this.worker = null;
            }
        } catch (_) {}

        this.initWorker();

        this.elements.btnStartBatchTranscribe.disabled = false;
        this.elements.btnCancelBatch.disabled = true;
        this.elements.btnCancelBatch.textContent = "Cancelado";
        this.elements.labelBatchStatus.textContent = "Transcrição interrompida pelo usuário.";
        this.elements.labelBatchStatus.style.color = "var(--accent-amber)";
        this.renderBatchResults();
        this.showToast("Transcrição cancelada com sucesso.", "info");
    }

    finishBatchTranscription() {
        if (this.batchChunkTimeout) {
            clearTimeout(this.batchChunkTimeout);
            this.batchChunkTimeout = null;
        }

        this.isBatchProcessing = false;
        this.elements.btnStartBatchTranscribe.disabled = false;
        this.updateBatchProgressUI(this.batchChunks.length, this.batchChunks.length);
        if (this.elements.metricBatchEta) {
            this.elements.metricBatchEta.textContent = "00:00";
        }
        this.renderBatchResults();
        this.showToast("Transcrição completa finalizada com sucesso!");
    }

    // Renderiza os resultados no editor (com ou sem marcação de tempo)
    renderBatchResults() {
        const showTimestamps = this.elements.checkShowTimestamps.checked;
        const editor = this.elements.longTranscriptionEditor;

        if (showTimestamps) {
            editor.value = this.batchResults
                .map(item => `[${this.formatTimerSeconds(item.startSec)}] ${item.processedText}`)
                .filter(Boolean)
                .join("\n\n");
        } else {
            editor.value = this.batchResults
                .map(item => item.processedText)
                .filter(Boolean)
                .join(" ");
        }

        editor.scrollTop = editor.scrollHeight;
        this.updateLongEditorStats();
    }

    updateLongEditorStats() {
        const text = this.elements.longTranscriptionEditor.value.trim();
        const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
        const chars = this.elements.longTranscriptionEditor.value.length;

        this.elements.longStatWords.textContent = words;
        this.elements.longStatChars.textContent = chars;
    }

    // Exportações de Arquivo
    downloadLongAsTxt() {
        const text = this.elements.longTranscriptionEditor.value;
        if (!text.trim()) {
            this.showToast("Nenhum texto para baixar!", "info");
            return;
        }

        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const filename = `${this.getExportBaseName()}_transcricao.txt`;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast(`Arquivo baixado: ${filename}`);
    }

    downloadLongAsSrt() {
        if (this.batchResults.length === 0) {
            this.showToast("Nenhum bloco transcrito para gerar legendas!", "info");
            return;
        }

        const formatSrtTime = (seconds) => {
            const hrs = String(Math.floor(seconds / 3600)).padStart(2, '0');
            const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
            const secs = String(Math.floor(seconds % 60)).padStart(2, '0');
            return `${hrs}:${mins}:${secs},000`;
        };

        let srtContent = "";
        this.batchResults.forEach((item, index) => {
            srtContent += `${index + 1}\n`;
            srtContent += `${formatSrtTime(item.startSec)} --> ${formatSrtTime(item.endSec)}\n`;
            srtContent += `${item.processedText}\n\n`;
        });

        const blob = new Blob([srtContent], { type: "application/x-subrip;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const filename = `${this.getExportBaseName()}_transcricao.srt`;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast(`Legenda baixada: ${filename}`);
    }

    formatTimerSeconds(totalSeconds) {
        const secNum = Math.floor(totalSeconds);
        const hours = Math.floor(secNum / 3600);
        const minutes = Math.floor((secNum % 3600) / 60);
        const seconds = secNum % 60;

        const hStr = String(hours).padStart(2, '0');
        const mStr = String(minutes).padStart(2, '0');
        const sStr = String(seconds).padStart(2, '0');

        return `${hStr}:${mStr}:${sStr}`;
    }

}

// Inicialização robusta para scripts com type="module"
function bootApp() {
    if (!window.wispApp) {
        window.wispApp = new WispWebApp();
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootApp);
} else {
    bootApp();
}