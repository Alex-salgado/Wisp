@echo off
title Wisp Web - Transcritor de Voz IA no Navegador
cd /d "%~dp0"

echo ====================================================
echo      Wisp Web - In-Browser AI Speech-to-Text
echo ====================================================
echo.

if not exist ".venv\Scripts\python.exe" (
    echo [ERRO] Ambiente virtual nao encontrado!
    echo Execute a criacao com: python -m venv .venv
    pause
    exit /b
)

echo Iniciando servidor local com suporte a WebGPU e WebAssembly...
".venv\Scripts\python.exe" server.py
pause
