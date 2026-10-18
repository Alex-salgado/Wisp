/**
 * WISP WEB - CONTROLADOR PRINCIPAL (V2)
 * Gerencia a interface, perfil do usuario, audio e worker de IA
 */

import { AudioManager } from "./audio.js";

// Configuracoes e Dados Padrao com exatamente 3 itens de teste selecionados
const DEFAULT_PROFILE = {
    custom_vocabulary: [
        "Wisp",
        "Inteligência Artificial",
        "WhatsApp"
    ],
    correction_rules: {
        "ia": "IA",
        "wisper": "Whisper",
        "vc": "você"
    },
    phrase_history: [],
    settings: {
        modelName: "Xenova/whisper-tiny",
        language: "portuguese",
        soundFeedback: true,
        voicePunctuation: true,
        voiceEnter: true,
        pauseDuration: 0.75,
        silenceThreshold: 0.015
    }
};

class WispWebApp {
    constructor() {
        console.log("[WispWeb] Inicializando aplicacao...");
        this.profile = this.loadProfile();
        this.audioManager = new AudioManager();
        this.worker = null;
        this.isModelReady = false;
        this.isTranscribing = false;

        this.initDOM();
        this.initWorker();
        this.initTabs();
        this.initAudioControls();
        this.initProfileManager();
        this.renderAll();
        console.log("[WispWeb] Aplicacao inicializada com sucesso!");
    }

    // Carregar Perfil do localStorage (Chave V2 para garantir os 3 itens de teste padrao)
    loadProfile() {
        try {
            const saved = localStorage.getItem("wisp_user_profile_v2");
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
            localStorage.setItem("wisp_user_profile_v2", JSON.stringify(this.profile));
        } catch (e) {
            console.error("Erro ao salvar perfil no localStorage:", e);
        }
    }

    // Inicializacao do DOM
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

            // Vocabulario & Regras
            formAddVocab: document.getElementById("form-add-vocab"),
            inputNewVocab: document.getElementById("input-new-vocab"),
            tbodyVocab: document.getElementById("tbody-vocab"),
            formAddRule: document.getElementById("form-add-rule"),
            inputRuleFrom: document.getElementById("input-rule-from"),
            inputRuleTo: document.getElementById("input-rule-to"),
            tbodyRules: document.getElementById("tbody-rules"),

            // Historico
            tbodyHistory: document.getElementById("tbody-history"),
            btnCopyHistory: document.getElementById("btn-copy-history"),
            btnClearHistory: document.getElementById("btn-clear-history"),

            // Configuracoes
            settingSoundFeedback: document.getElementById("setting-sound-feedback"),
            settingVoicePunctuation: document.getElementById("setting-voice-punctuation"),
            settingVoiceEnter: document.getElementById("setting-voice-enter"),
            settingPauseDuration: document.getElementById("setting-pause-duration"),
            labelPauseVal: document.getElementById("label-pause-val"),
            settingSilenceThreshold: document.getElementById("setting-silence-threshold"),
            labelThresholdVal: document.getElementById("label-threshold-val"),
            btnExportProfile: document.getElementById("btn-export-profile"),
            inputImportProfile: document.getElementById("input-import-profile"),
            btnResetProfile: document.getElementById("btn-reset-profile"),
            toastContainer: document.getElementById("toast-container")
        };
    }

    // Inicializacao do Web Worker de IA
    initWorker() {
        try {
            console.log("[WispWeb] Inicializando Worker de IA...");
            this.worker = new Worker("worker.js", { type: "module" });

            this.worker.onerror = (err) => {
                console.error("[WispWeb] Erro no Worker de IA:", err);
                this.updateSystemStatus("Erro no Worker IA", false, true);
                this.showToast("Falha ao carregar motor de IA no navegador. Verifique a conexao.", "error");
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
                        this.elements.progressCard.style.display = "none";
                        this.updateSystemStatus("Modelo pronto", false);
                        this.showToast(`Modelo '${payload.modelName}' pronto para uso local!`);
                        break;

                    case "TRANSCRIBE_SUCCESS":
                        this.handleTranscriptionSuccess(payload);
                        break;

                    case "ERROR":
                        this.updateSystemStatus("Erro", false, true);
                        this.showToast(payload.message, "error");
                        break;
                }
            };

            // Solicita carregamento do modelo padrao salvo
            this.loadSelectedModel();
        } catch (err) {
            console.error("[WispWeb] Falha ao instanciar Worker:", err);
            this.updateSystemStatus("Erro de Inicializacao", false, true);
            this.showToast("Navegador bloqueou execucao do Worker de IA.", "error");
        }
    }

    loadSelectedModel() {
        this.isModelReady = false;
        this.elements.progressCard.style.display = "block";
        this.elements.progressBarFill.style.width = "0%";
        this.elements.progressPercentage.textContent = "0%";
        this.elements.progressFileName.textContent = `Carregando ${this.profile.settings.modelName}...`;

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
                this.elements.progressFileName.textContent = `Baixando: ${data.file} (${pct}%)`;
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

    // Navegacao por Abas
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

    // Controles de Audio e Microfone
    initAudioControls() {
        this.elements.btnToggleMic.addEventListener("click", () => this.toggleMicrophone());

        // Mudanca de modelo
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

        // Calibracao de Ruido
        this.elements.btnCalibrateNoise.addEventListener("click", async () => {
            this.elements.btnCalibrateNoise.disabled = true;
            this.elements.btnCalibrateNoise.textContent = "Medindo silencio da sala (2s)...";
            this.showToast("Fique em silencio por 2 segundos...", "info");

            const newThreshold = await this.audioManager.calibrateNoise(2.0);
            this.profile.settings.silenceThreshold = Number(newThreshold.toFixed(4));
            this.audioManager.silenceThreshold = this.profile.settings.silenceThreshold;
            this.elements.settingSilenceThreshold.value = this.profile.settings.silenceThreshold;
            this.elements.labelThresholdVal.textContent = this.profile.settings.silenceThreshold;
            this.saveProfile();

            this.elements.btnCalibrateNoise.disabled = false;
            this.elements.btnCalibrateNoise.textContent = "🎚️ Calibrar Ruido da Sala";
            this.showToast(`Sensibilidade calibrada para ${this.profile.settings.silenceThreshold}!`);
        });

        // Acoes do Editor
        this.elements.editor.addEventListener("input", () => this.updateEditorStats());

        this.elements.btnCopyText.addEventListener("click", () => {
            const text = this.elements.editor.value;
            if (!text.trim()) {
                this.showToast("O editor esta vazio!", "info");
                return;
            }
            navigator.clipboard.writeText(text);
            this.showToast("Texto copiado para a Area de Transferencia!");
        });

        this.elements.btnDownloadTxt.addEventListener("click", () => {
            const text = this.elements.editor.value;
            if (!text.trim()) {
                this.showToast("Nada para baixar!", "info");
                return;
            }
            const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `wisp_ditado_${new Date().toISOString().slice(0, 10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            this.showToast("Arquivo .txt baixado com sucesso!");
        });

        this.elements.btnClearText.addEventListener("click", () => {
            if (this.elements.editor.value && confirm("Deseja realmente limpar todo o texto do editor?")) {
                this.elements.editor.value = "";
                this.updateEditorStats();
                this.showToast("Editor limpo.");
            }
        });
    }

    async toggleMicrophone() {
        if (this.audioManager.isActive) {
            this.audioManager.stop();
            this.elements.btnToggleMic.classList.remove("active");
            this.elements.micStatusLabel.textContent = "Microfone Desligado";
            this.elements.micStatusSub.textContent = "Clique para ligar a escuta";
            this.elements.vuBarFill.style.width = "0%";
            this.playChime(false);
            this.updateSystemStatus("Pronto", false);
        } else {
            if (!this.isModelReady) {
                this.showToast("Aguarde o modelo Whisper terminar de carregar...", "info");
                return;
            }

            try {
                this.audioManager.silenceThreshold = this.profile.settings.silenceThreshold;
                this.audioManager.pauseDuration = this.profile.settings.pauseDuration;

                await this.audioManager.start(
                    (audioFloat32, durationSec) => this.onSpeechChunkCaptured(audioFloat32, durationSec),
                    (level) => {
                        this.elements.vuBarFill.style.width = `${level}%`;
                    }
                );

                this.elements.btnToggleMic.classList.add("active");
                this.elements.micStatusLabel.textContent = "Ouvindo sua voz...";
                this.elements.micStatusSub.textContent = "Fale normalmente";
                this.playChime(true);
                this.updateSystemStatus("Ouvindo...", true);
            } catch (err) {
                console.error("Erro ao acessar microfone:", err);
                this.showToast("Permissao de microfone negada ou indisponivel!", "error");
            }
        }
    }

    // Quando um trecho de audio completo e capturado pelo VAD
    onSpeechChunkCaptured(audioFloat32, durationSec) {
        if (!this.isModelReady) return;

        const initialPrompt = this.profile.custom_vocabulary.join(", ");

        this.worker.postMessage({
            type: "TRANSCRIBE",
            payload: {
                audioFloat32,
                duration: durationSec,
                initialPrompt,
                language: this.profile.settings.language
            }
        });
    }

    // Tratamento do resultado da transcricao
    handleTranscriptionSuccess(payload) {
        const { rawText, latency } = payload;
        if (!rawText || !rawText.trim()) return;

        this.elements.statLatency.textContent = `${latency} ms`;

        // 1. Aplicar regras de auto-correcao
        let processed = rawText.trim();
        for (const [from, to] of Object.entries(this.profile.correction_rules)) {
            const regex = new RegExp(`\\b${from}\\b`, "gi");
            processed = processed.replace(regex, to);
        }

        // 2. Processar comando de voz "Entra" (substitui Enter conforme requisitado)
        let pressEnterAfter = false;
        let pressEnterBefore = false;

        if (this.profile.settings.voiceEnter) {
            const lower = processed.toLowerCase();
            // Caso 1: Disse apenas "entra"
            if (lower === "entra" || lower === "entra." || lower === "entra!") {
                this.injectTextIntoEditor("\n");
                this.recordHistory("[Comando Entra]");
                return;
            }

            // Caso 2: Falou "entra" no final da frase
            if (/\bentra[\.!\?]?$/i.test(lower)) {
                processed = processed.replace(/\bentra[\.!\?]?$/i, "").trim();
                pressEnterAfter = true;
            } else if (/^entra\b[:,\s]*/i.test(lower)) {
                processed = processed.replace(/^entra\b[:,\s]*/i, "").trim();
                pressEnterBefore = true;
            }
        }

        // 3. Processar comandos explicitos de pontuacao por voz
        if (this.profile.settings.voicePunctuation) {
            const rules = [
                [/\b(ponto de exclama[çc][aã]o|exclama[çc][aã]o)\b/gi, "!"],
                [/\b(ponto de interroga[çc][aã]o|interroga[çc][aã]o)\b/gi, "?"],
                [/\bponto e v[ií]rgula\b/gi, ";"],
                [/\bdois pontos\b/gi, ":"],
                [/\bponto final\b/gi, "."],
                [/\bv[ií]rgula\b/gi, ","],
                [/\b(nova linha|par[aá]grafo)\b/gi, "\n"]
            ];

            for (const [pattern, symbol] of rules) {
                processed = processed.replace(pattern, symbol);
            }

            // Ajustar espacamento de pontuacao
            processed = processed.replace(/\s+([,.:;!?])/g, "$1");
            processed = processed.replace(/([,.:;!?])([A-Za-zÀ-ÿ0-9])/g, "$1 $2");
        }

        if (pressEnterBefore) {
            this.injectTextIntoEditor("\n");
        }

        if (processed.trim()) {
            this.injectTextIntoEditor(processed.trim() + " ");
            this.recordHistory(processed.trim());
        }

        if (pressEnterAfter) {
            this.injectTextIntoEditor("\n");
        }
    }

    // Insercao inteligente de texto no cursor do editor
    injectTextIntoEditor(text) {
        const editor = this.elements.editor;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const currentVal = editor.value;

        editor.value = currentVal.substring(0, start) + text + currentVal.substring(end);
        editor.selectionStart = editor.selectionEnd = start + text.length;
        editor.focus();
        this.updateEditorStats();
    }

    updateEditorStats() {
        const text = this.elements.editor.value.trim();
        const words = text ? text.split(/\s+/).length : 0;
        const chars = text.length;

        this.elements.statWordCount.textContent = words;
        this.elements.statCharCount.textContent = chars;
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

    // Gerenciamento de Perfil e Configuracoes
    initProfileManager() {
        // Form Vocabulario
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

        // Configuracoes Toggles & Sliders
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

        // Acoes de Historico
        this.elements.btnCopyHistory.addEventListener("click", () => {
            const lines = this.profile.phrase_history.map(item => `[${item.time}] ${item.text}`).join("\n");
            if (!lines) {
                this.showToast("Historico vazio!", "info");
                return;
            }
            navigator.clipboard.writeText(lines);
            this.showToast("Todo o historico copiado!");
        });

        this.elements.btnClearHistory.addEventListener("click", () => {
            if (this.profile.phrase_history.length && confirm("Limpar todo o historico de falas?")) {
                this.profile.phrase_history = [];
                this.saveProfile();
                this.renderHistoryTable();
                this.showToast("Historico limpo.");
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
                        throw new Error("Formato invalido");
                    }
                } catch (err) {
                    this.showToast("Arquivo JSON de perfil invalido!", "error");
                }
            };
            reader.readAsText(file);
            e.target.value = "";
        });

        this.elements.btnResetProfile.addEventListener("click", () => {
            if (confirm("Deseja restaurar as configuracoes e vocabulario para os padroes de fabrica?")) {
                this.profile = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
                this.saveProfile();
                this.renderAll();
                this.showToast("Perfil restaurado aos padroes (3 itens de teste)!");
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
            tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Nenhuma transcricao recente registrada.</td></tr>`;
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
}

// Inicializacao robusta para scripts com type="module"
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
