import os
import sys

# Redireciona saídas padrão se estiver rodando em modo sem console (--noconsole / GUI)
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

if getattr(sys, 'frozen', False):
    APP_DIR = os.path.dirname(sys.executable)
    BASE_DIR = getattr(sys, '_MEIPASS', APP_DIR)
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))
    BASE_DIR = APP_DIR

if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

import time
import socket
import threading
import webbrowser
import subprocess

from config import cfg
from server import app, start_server, stop_server
from hotkey import hotkey_manager
from engine import whisper_engine
import injector

def find_available_port(start_port=28940, max_port=29040):
    for port in range(start_port, max_port):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind(("127.0.0.1", port))
                return port
        except OSError:
            continue
    return start_port

def run_qt_window(url, port):
    from PySide6.QtWidgets import QApplication, QMainWindow, QSystemTrayIcon, QMenu
    from PySide6.QtWebEngineWidgets import QWebEngineView
    from PySide6.QtWebEngineCore import QWebEngineSettings
    from PySide6.QtGui import QIcon, QAction
    from PySide6.QtCore import QUrl, Qt

    qt_app = QApplication(sys.argv)
    qt_app.setApplicationName("Wisp Desktop")

    # Ícone do aplicativo
    icon_candidates = [
        os.path.join(APP_DIR, "static", "icons", "icon.ico"),
        os.path.join(BASE_DIR, "static", "icons", "icon.ico"),
        os.path.join(APP_DIR, "static", "assets", "icon.ico")
    ]
    icon = QIcon()
    for ic in icon_candidates:
        if os.path.exists(ic):
            icon = QIcon(ic)
            break
    qt_app.setWindowIcon(icon)

    window = QMainWindow()
    window.setWindowTitle("Wisp Desktop — Ditador Pessoal Privado (100% Local)")

    win_w = cfg.get("ui", {}).get("window_width", 1080)
    win_h = cfg.get("ui", {}).get("window_height", 780)
    window.resize(win_w, win_h)

    # Centraliza janela na tela principal
    screen_geo = qt_app.primaryScreen().geometry()
    x = (screen_geo.width() - win_w) // 2
    y = (screen_geo.height() - win_h) // 2
    window.move(max(0, x), max(0, y))

    webview = QWebEngineView()
    settings = webview.settings()
    settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
    settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)

    # Permitir microfone e Web Audio sem diálogos bloqueantes
    webview.page().featurePermissionRequested.connect(
        lambda security_origin, feature: webview.page().setFeaturePermission(
            security_origin, feature, webview.page().PermissionPolicy.PermissionGrantedByUser
        )
    )
    webview.load(QUrl(url))
    window.setCentralWidget(webview)

    # Exibe a janela imediatamente para o usuário ter retorno visual instantâneo (<1s)
    window.show()
    try:
        wisp_hwnd = int(window.winId())
        injector.set_wisp_window_handle(wisp_hwnd)
    except Exception:
        pass

    # Ícone na bandeja do sistema (System Tray)
    tray = QSystemTrayIcon(icon, window)
    tray_menu = QMenu()

    action_show = QAction("Abrir Wisp", window)
    action_show.triggered.connect(lambda: (window.showNormal(), window.activateWindow()))
    tray_menu.addAction(action_show)

    action_quit = QAction("Sair do Wisp", window)
    action_quit.triggered.connect(qt_app.quit)
    tray_menu.addAction(action_quit)

    tray.setContextMenu(tray_menu)
    tray.show()

    def on_tray_activated(reason):
        if reason in (QSystemTrayIcon.ActivationReason.DoubleClick, QSystemTrayIcon.ActivationReason.Trigger):
            if window.isVisible() and not window.isMinimized():
                window.hide()
            else:
                window.showNormal()
                window.activateWindow()

    tray.activated.connect(on_tray_activated)

    return qt_app.exec()

def run_browser_app(url):
    edge_paths = [
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe")
    ]
    for exe in edge_paths:
        if os.path.exists(exe):
            try:
                subprocess.Popen([exe, f"--app={url}", f"--window-size={cfg.get('ui', {}).get('window_width', 1080)},{cfg.get('ui', {}).get('window_height', 780)}"])
                return
            except Exception:
                pass
    webbrowser.open(url)

def main():
    # 1. Obter porta do config.yaml
    cfg_port = cfg.get("server", {}).get("port", 28940)
    auto_port = cfg.get("server", {}).get("auto_port", True)

    if auto_port:
        port = find_available_port(start_port=cfg_port, max_port=cfg_port + 100)
    else:
        port = cfg_port

    url = f"http://127.0.0.1:{port}"

    # 2. Iniciar servidor Flask silencioso em segundo plano
    server_thread = threading.Thread(
        target=start_server,
        kwargs={"host": "127.0.0.1", "port": port},
        daemon=True
    )
    server_thread.start()

    # 3. Configurar e iniciar atalho global
    saved_hotkey = cfg.get("dictation", {}).get("global_hotkey", "Ctrl+F8")
    hotkey_manager.update_hotkey(saved_hotkey)
    hotkey_manager.start()

    # 4. Aguardar o servidor responder antes de carregar a página
    for _ in range(60):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) == 0:
                break
        time.sleep(0.04)

    # 5. Iniciar interface gráfica
    try:
        exit_code = run_qt_window(url, port)
    except Exception as e:
        run_browser_app(url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass

    # Finalização limpa
    stop_server()
    hotkey_manager.stop()

if __name__ == "__main__":
    main()
