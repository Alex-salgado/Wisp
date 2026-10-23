# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all
from PyInstaller.utils.hooks import copy_metadata

datas = [('C:\\Projetos_IA\\Wisp_web\\desktop_python\\templates', 'templates'), ('C:\\Projetos_IA\\Wisp_web\\desktop_python\\static', 'static')]
binaries = []
hiddenimports = ['PySide6.QtWebEngineWidgets', 'PySide6.QtWebEngineCore', 'PySide6.QtWidgets', 'PySide6.QtGui', 'PySide6.QtCore', 'engine', 'server', 'injector', 'hotkey', 'hardware']
datas += copy_metadata('faster-whisper')
datas += copy_metadata('ctranslate2')
datas += copy_metadata('huggingface_hub')
datas += copy_metadata('tokenizers')
tmp_ret = collect_all('faster_whisper')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]
tmp_ret = collect_all('ctranslate2')
datas += tmp_ret[0]; binaries += tmp_ret[1]; hiddenimports += tmp_ret[2]


a = Analysis(
    ['C:\\Projetos_IA\\Wisp_web\\desktop_python\\main.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='wisp_Python',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['C:\\Projetos_IA\\Wisp_web\\desktop_python\\static\\icons\\icon.ico'],
)
