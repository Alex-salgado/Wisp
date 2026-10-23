# 🐍 Wisp Desktop — Versão 100% Python (Flask + CUDA GPU)

> **Aplicativo Desktop Inteligente com Interface Moderna e Aceleração por GPU**  
> **Motor de IA:** `faster-whisper` com aceleração nativa **NVIDIA CUDA** (`float16`) na **RTX 5060**  
> **Servidor Local:** Flask embutido com suporte a streaming de eventos SSE  
> **Interface Visual:** HTML5, CSS3 Glassmorphism e Web Audio API via Chromium / PySide6  
> **Injeção de Texto:** Win32 API nativa (detecção automática da janela sob o mouse + `Ctrl+V` instantâneo)  
> **Atalho Global:** `CTRL + F8` registrado diretamente no Windows  

---

## 🚀 Como Executar

Basta dar um duplo clique no arquivo **[`run.bat`](file:///c:/Projetos_IA/Wisp_web/desktop_python/run.bat)** ou executar via terminal:

```bash
cd desktop_python
py main.py
```

O Wisp inicializará o servidor Flask local, ativará o monitor de atalhos globais do Windows e abrirá a janela dedicada do aplicativo.

---

## 📁 Estrutura de Arquivos

```
desktop_python/
│   main.py               # Ponto de entrada: inicia Flask, hotkeys e abre a janela do app
│   server.py             # Servidor Flask e rotas REST API (/api/transcribe, /api/inject, etc.)
│   engine.py             # Gerenciador do modelo Whisper (CUDA float16 na RTX 5060)
│   injector.py           # Injeção Win32 direta onde o mouse estiver apontado (ctypes)
│   hotkey.py             # Monitor de teclas de atalho global Win32 (Ctrl + F8)
│   hardware.py           # Leitor de informações de GPU, CPU e memória RAM
│   requirements.txt      # Dependências Python
│   run.bat               # Inicializador de 1 clique
│
├───templates/
│       index.html        # Interface visual moderna com visualizador de onda e editor
│
├───static/
│   ├───css/
│   │       style.css     # Estilos escuros em glassmorphism, animações e responsividade
│   ├───js/
│   │       app.js        # Lógica de controle do frontend e integração com a API Flask
│   │       audio.js      # Captura de áudio do microfone a 16kHz float32
│   └───icons/
│           icon.ico      # Ícone do aplicativo
│           icon.png
│
└───models/               # Cache local dos modelos Whisper baixados
```

---

## ✨ Recursos

1. **Aceleração na RTX 5060:** Inferência de voz em menos de 80ms utilizando tensores FP16 diretamente nos núcleos Tensor da GPU.
2. **Injeção no Mouse:** O texto ditado vai instantaneamente para a janela onde o mouse estiver apontando (Word, Bloco de Notas, Navegador, etc.).
3. **Atalho Global:** Pressione `CTRL + F8` em qualquer programa para ligar ou desligar o microfone.
4. **Transcrição de Arquivos:** Suporte a arquivos MP3, WAV, M4A e geração automática de legendas `.SRT`.
5. **Zero Compilação Obrigatória:** O código roda diretamente no Python local, facilitando iterações e customizações visuais instantâneas.
