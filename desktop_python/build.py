import os
import sys
import shutil
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
RELEASE_DIR = os.path.join(PROJECT_ROOT, "release")
os.makedirs(RELEASE_DIR, exist_ok=True)

# Remove executável antigo onefile se existir
old_onefile = os.path.join(RELEASE_DIR, "wisp_Python.exe")
if os.path.exists(old_onefile):
    try:
        os.remove(old_onefile)
        print("[Build] Removido executável onefile antigo pesado.")
    except Exception:
        pass

# Pasta de saída da versão portátil em pasta
DIST_PORTABLE_DIR = os.path.join(RELEASE_DIR, "wisp_Python")
if os.path.exists(DIST_PORTABLE_DIR):
    try:
        shutil.rmtree(DIST_PORTABLE_DIR)
    except Exception:
        pass

icon_path = os.path.join(BASE_DIR, "static", "icons", "icon.ico")
main_script = os.path.join(BASE_DIR, "main.py")

print("=" * 65)
print("  COMPILANDO WISP PYTHON — VERSÃO PORTÁVEL EM PASTA (--ONEDIR)  ")
print("=" * 65)

cmd = [
    sys.executable, "-m", "PyInstaller",
    "--name=wisp_Python",
    "--noconsole",
    "--onedir",
    "--clean",
    f"--icon={icon_path}",
    f"--add-data={os.path.join(BASE_DIR, 'templates')};templates",
    f"--add-data={os.path.join(BASE_DIR, 'static')};static",
    "--collect-all=faster_whisper",
    "--collect-all=ctranslate2",
    "--copy-metadata=faster-whisper",
    "--copy-metadata=ctranslate2",
    "--copy-metadata=huggingface_hub",
    "--copy-metadata=tokenizers",
    "--hidden-import=PySide6.QtWebEngineWidgets",
    "--hidden-import=PySide6.QtWebEngineCore",
    "--hidden-import=PySide6.QtWidgets",
    "--hidden-import=PySide6.QtGui",
    "--hidden-import=PySide6.QtCore",
    "--hidden-import=yaml",
    "--hidden-import=config",
    "--hidden-import=engine",
    "--hidden-import=server",
    "--hidden-import=injector",
    "--hidden-import=hotkey",
    "--hidden-import=hardware",
    f"--distpath={RELEASE_DIR}",
    f"--workpath={os.path.join(BASE_DIR, 'build')}",
    f"--specpath={BASE_DIR}",
    main_script
]

print("Executando PyInstaller (--onedir)...")
res = subprocess.run(cmd)

if res.returncode == 0:
    out_dir = os.path.join(RELEASE_DIR, "wisp_Python")
    out_exe = os.path.join(out_dir, "wisp_Python.exe")
    
    # 1. Copiar config.yaml padrão para a pasta portátil
    config_src = os.path.join(BASE_DIR, "config.yaml")
    config_dst = os.path.join(out_dir, "config.yaml")
    if os.path.exists(config_src):
        shutil.copy2(config_src, config_dst)
    else:
        from config import DEFAULT_CONFIG_YAML
        with open(config_dst, "w", encoding="utf-8") as f:
            f.write(DEFAULT_CONFIG_YAML)
    print(f"[OK] Arquivo config.yaml criado em: {config_dst}")

    # 2. Criar pastas locais de models e data na pasta portátil
    os.makedirs(os.path.join(out_dir, "models"), exist_ok=True)
    os.makedirs(os.path.join(out_dir, "data"), exist_ok=True)
    print(f"[OK] Pastas 'models/' e 'data/' criadas na pasta portátil.")

    # 3. Copiar templates e static diretamente para a pasta raiz portátil para fácil edição
    dest_templates = os.path.join(out_dir, "templates")
    if not os.path.exists(dest_templates):
        shutil.copytree(os.path.join(BASE_DIR, "templates"), dest_templates)
    dest_static = os.path.join(out_dir, "static")
    if not os.path.exists(dest_static):
        shutil.copytree(os.path.join(BASE_DIR, "static"), dest_static)

    # 4. Criar atalho de inicialização simples (run.bat) na pasta portátil
    bat_content = """@echo off
title Wisp Desktop
cd /d "%~dp0"
start "" wisp_Python.exe
"""
    with open(os.path.join(out_dir, "Iniciar_Wisp.bat"), "w", encoding="utf-8") as f:
        f.write(bat_content)

    print(f"\n[SUCESSO] Versão portátil em pasta gerada em: {out_dir}")
    print(f"Executável: {out_exe}")
else:
    print(f"\n[ERRO] PyInstaller falhou com código de retorno: {res.returncode}")
    sys.exit(res.returncode)
