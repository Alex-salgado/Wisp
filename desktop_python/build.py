import os
import sys
import shutil
import subprocess

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BASE_DIR, ".."))
RELEASE_DIR = os.path.join(PROJECT_ROOT, "release")
os.makedirs(RELEASE_DIR, exist_ok=True)

# Caminho para o ícone
icon_path = os.path.join(BASE_DIR, "static", "icons", "icon.ico")
main_script = os.path.join(BASE_DIR, "main.py")

print("=" * 60)
print("  COMPILANDO WISP PYTHON PORTÁVEL (PYINSTALLER)  ")
print("=" * 60)

cmd = [
    sys.executable, "-m", "PyInstaller",
    "--name=wisp_Python",
    "--noconsole",
    "--onefile",
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

print("Comando de build:", " ".join(cmd))
res = subprocess.run(cmd)

if res.returncode == 0:
    out_exe = os.path.join(RELEASE_DIR, "wisp_Python.exe")
    if os.path.exists(out_exe):
        size_mb = os.path.getsize(out_exe) / (1024 * 1024)
        print(f"\n[SUCESSO] Executavel gerado em: {out_exe} ({size_mb:.1f} MB)")
    else:
        print("\n[AVISO] PyInstaller finalizou mas wisp_Python.exe nao foi encontrado no destino esperado.")
else:
    print(f"\n[ERRO] PyInstaller falhou com codigo de retorno: {res.returncode}")
    sys.exit(res.returncode)
