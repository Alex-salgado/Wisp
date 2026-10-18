# 🎙️ Wisp Web - Transcritor de Voz IA no Navegador (Client-Side AI)

> **Protótipo 100% Funcional da Estratégia 2**  
> Modelo Whisper executado diretamente no navegador do usuário utilizando **WebAssembly + WebGPU** e **Transformers.js**.  
> **Custo de Servidor: R$ 0,00 | Privacidade Absoluta: 100% Local.**

---

## 🌟 O Que é o Wisp Web?

O **Wisp Web** é a versão web estática e independente do Wisp. Diferente de soluções convencionais de reconhecimento de voz que enviam o áudio para servidores na nuvem (Google, OpenAI, AWS), o Wisp Web executa a inteligência artificial **diretamente dentro do navegador do visitante** através da aceleração por hardware da placa de vídeo (WebGPU) ou processador (WASM SIMD).

- **Zero Custo de Servidor**: Não requer servidor Python com GPU na nuvem; roda como uma página estática (SPA).
- **Privacidade Total**: O áudio do microfone nunca trafega pela internet nem sai da máquina do usuário.
- **Cache Local no Navegador (IndexedDB)**: O modelo Whisper (`whisper-tiny` ~39 MB ou `whisper-base` ~75 MB) é baixado apenas no primeiro acesso e fica salvo permanentemente no cache local.
- **Ditador & Produtividade**: Editor de texto de alta performance com estatísticas ao vivo, cópia em 1 clique e download em `.txt`.
- **Comandos de Voz & Pontuação Inteligente**:
  - *"vírgula"* ➔ `,`
  - *"ponto final"* ➔ `.`
  - *"ponto de exclamação"* ➔ `!`
  - *"ponto de interrogação"* ➔ `?`
  - *"dois pontos"* ➔ `:`
  - *"nova linha"* ou *"parágrafo"* ➔ quebra de linha
  - *"enter"* ➔ pressiona Enter no editor
- **Vocabulário Prioritário & Regras de Auto-Correção**: Salvas localmente no `localStorage`, com suporte a **Exportar/Importar Perfil JSON**.
- **Avisos Sonoros (Beeps)**: Feedback sonoro suave sintetizado via Web Audio API.

---

## 🚀 Como Executar Localmente

### Opção 1: Atalho Rápido (Windows)
Basta dar dois cliques no arquivo:
```cmd
run_web.bat
```
Ele iniciará o servidor local com os cabeçalhos de alto desempenho (`COOP`/`COEP`) e abrirá automaticamente seu navegador em `http://localhost:8000`.

### Opção 2: Linha de Comando (PowerShell)
```powershell
.\.venv\Scripts\python.exe server.py
```

---

## 🌐 Como Publicar Grátis na Internet (GitHub Pages ou Cloudflare Pages)

Como este projeto é **100% frontend estático (HTML, CSS e JS)**, ele não precisa de backend:

### No GitHub Pages:
1. Crie um repositório no seu GitHub (ex: `wisp-web`).
2. Vincule este repositório local e envie os arquivos:
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/wisp-web.git
   git branch -M main
   git push -u origin main
   ```
3. No GitHub, vá em **Settings > Pages > Branch: `main` / Folder: `/ (root)` > Save**.
4. Em menos de 1 minuto, seu app estará no ar mundialmente com link HTTPS!

---

## 📁 Estrutura do Projeto

```text
Wisp_web/
│
├── index.html            # Estrutura semântica completa e abas
├── style.css             # Design System moderno Dark Glass (Neon / Glassmorphism)
├── app.js                # Orquestrador da interface, perfil e atalhos
├── audio.js              # Captura de microfone 16kHz e VAD por energia
├── worker.js             # Web Worker com Transformers.js (não trava a interface)
├── server.py             # Servidor HTTP local com suporte a WebAssembly e WebGPU
├── run_web.bat           # Executável rápido de inicialização
├── .gitignore            # Ignora .venv e arquivos temporários
│
├── assets/               # Ícones e identidade visual herdados do Wisp Desktop
│   ├── icon.ico
│   └── icon.png
│
└── data/                 # Perfis e configurações de referência
    ├── settings.json
    └── user_profile.json
```

---

## ⚖️ Comparativo: Wisp Desktop vs. Wisp Web

| Recurso | Wisp Desktop (Windows) | Wisp Web (Navegador) |
| :--- | :---: | :---: |
| **Ambiente de Execução** | Executável Windows (`.exe` nativo) | Navegador Web (Chrome, Edge, Firefox, Safari) |
| **Injeção de Teclas no Cursor** | Digita em qualquer programa do PC (Word, Notepad, WhatsApp) | Digita no editor da página web ou via Extensão |
| **Motor de Inferência** | Faster-Whisper (CUDA FP16 / CTranslate2) | Transformers.js (ONNX Runtime WebGPU / WASM) |
| **Custo de Hospedagem** | Zero (Local) | **Zero (Página Estática / GitHub Pages)** |
| **Compatibilidade** | Apenas Windows 10/11 | **Qualquer sistema (Windows, Mac, Linux, Celular)** |
| **Backup de Perfil** | `user_profile.json` | `localStorage` + Exportação JSON |