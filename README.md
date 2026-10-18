# 🎙️ Wisp - Ditador Pessoal Privado (100% In-Browser & Local)

> **Aplicativo Web e PWA de Reconhecimento de Voz por Inteligência Artificial no Navegador**  
> Modelo de IA executado diretamente no dispositivo do usuário utilizando **WebAssembly + WebGPU** e **Transformers.js**.  
> **Custo de Servidor: R$ 0,00 | Privacidade Absoluta: 100% Local | Conformidade Total com LGPD.**

---

## 🌟 O Que é o Wisp?

O **Wisp** é um ditador e transcritor de voz por inteligência artificial que executa o processamento neural **diretamente dentro do seu navegador ou celular**. Ao contrário de soluções convencionais de transcrição que enviam seu áudio para servidores na nuvem, o Wisp garante que **a sua voz nunca saia do seu computador ou smartphone**.

- **🔒 Privacidade Total (Privacy by Design)**: O áudio capturado pelo microfone é processado na memória RAM e placa de vídeo local. Nenhum dado de áudio ou texto é enviado para servidores externos.
- **⚡ Zero Custo de Infraestrutura**: Totalmente estático (SPA / PWA). Pode ser hospedado gratuitamente no GitHub Pages sem necessidade de backend Python ou GPUs na nuvem.
- **📱 PWA Instalável (Progressive Web App)**: Pode ser instalado diretamente no Windows, Mac, Linux, Android e iOS com ícone dedicado na área de trabalho e execução em tela cheia.
- **🌐 Suporte Offline**: Após o primeiro carregamento, o modelo de IA fica armazenado no cache local do navegador (IndexedDB), permitindo ditar mesmo sem conexão com a internet.
- **🎙️ Seleção Dinâmica de Microfones**: Permite alternar instantaneamente entre o microfone do notebook, fone Bluetooth, headset USB ou webcam com detecção automática via `enumerateDevices`.
- **🔊 Resamostragem Universal de Áudio**: Algoritmo integrado para garantir compatibilidade impecável em qualquer taxa de amostragem de hardware (44.1 kHz, 48 kHz, etc.), ideal para Safari (iPhone/iPad/Mac) e Android.
- **✨ Comandos de Voz & Pontuação Inteligente**:
  - *"vírgula"* ➔ `,`
  - *"ponto final"* ou *"ponto"* ➔ `.`
  - *"ponto de exclamação"* ➔ `!`
  - *"ponto de interrogação"* ➔ `?`
  - *"dois pontos"* ➔ `:`
  - *"nova linha"* ou *"parágrafo"* ➔ quebra de linha
  - *"entra"* ➔ insere quebra de linha física no editor
- **🎯 Vocabulário Prioritário & Regras de Auto-Correção**: Salvas localmente no `localStorage`, com suporte a exportar e importar perfil em formato JSON.
- **💾 Gerenciamento de Armazenamento**: Botão em configurações para desocupar espaço e limpar o cache dos modelos baixados a qualquer momento.

---

## 🚀 Como Executar Localmente

### Opção 1: Atalho Rápido (Windows)
Dê dois cliques no arquivo:
```cmd
run_web.bat
```
Ele iniciará o servidor local e abrirá automaticamente seu navegador em `http://localhost:8000`.

### Opção 2: Linha de Comando (PowerShell)
```powershell
.\.venv\Scripts\python.exe server.py
```

---

## 🌐 Como Publicar Gratuitamente no GitHub Pages

Este repositório está pronto para ser publicado no **GitHub Pages**:

1. Crie ou vincule este repositório ao seu GitHub:
   ```bash
   git remote add origin https://github.com/Alex-salgado/Wisp.git
   git branch -M main
   git push -u origin main
   ```
2. No seu repositório no GitHub, acesse:
   - **Settings** (Configurações) ➔ **Pages**
   - Em **Source**, selecione **Deploy from a branch**
   - Escolha a branch **`main`** e a pasta **`/ (root)`**
   - Clique em **Save**
3. Em menos de 1 minuto, seu aplicativo estará online com endereço seguro HTTPS:
   `https://alex-salgado.github.io/Wisp/`

---

## 📁 Estrutura do Projeto

```text
Wisp_web/
│
├── index.html            # Estrutura semântica completa, PWA e abas da aplicação
├── style.css             # Design System moderno Dark Glass (Glassmorphism neon)
├── app.js                # Orquestrador da interface, perfil, PWA e atalhos
├── audio.js              # Captura de áudio, resamostragem universal e VAD
├── worker.js             # Web Worker de inferência de IA sem travamento da UI
├── manifest.json         # Manifesto PWA para instalação como app nativo
├── service-worker.js     # Cache offline de arquivos estáticos da aplicação
├── server.py             # Servidor de desenvolvimento local com cabeçalhos CORS
├── run_web.bat           # Inicializador de um clique para Windows
├── .gitignore            # Ignora .venv e arquivos temporários
│
├── assets/               # Ícones e identidade visual em alta resolução
│   ├── icon.ico
│   └── icon.png
│
└── data/                 # Perfis e configurações de referência
    ├── settings.json
    └── user_profile.json
```

---

## ⚖️ Licença e Privacidade

O **Wisp** é distribuído como software livre. Nenhuma informação pessoal, áudio ou texto gerado pelo usuário é coletado, armazenado ou compartilhado.
