@echo off
title Wisp Desktop (Python + CUDA RTX 5060)
cd /d "%~dp0"
echo ========================================================
echo   Iniciando Wisp Desktop (Python + Flask + CUDA GPU)
echo ========================================================

if exist "..\.venv\Scripts\python.exe" (
    "..\.venv\Scripts\python.exe" main.py
) else if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" main.py
) else (
    py main.py
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Ocorreu um erro ao executar o Wisp Desktop.
    pause
)
