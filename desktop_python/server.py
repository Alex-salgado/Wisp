import os
import sys
import time
import json
import queue
import logging

from config import cfg

if getattr(sys, 'frozen', False):
    BASE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    APP_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    APP_DIR = BASE_DIR

if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Fallback para pastas templates e static caso não estejam dentro de _MEIPASS
template_dir = os.path.join(BASE_DIR, "templates")
if not os.path.exists(template_dir):
    template_dir = os.path.join(APP_DIR, "templates")

static_dir = os.path.join(BASE_DIR, "static")
if not os.path.exists(static_dir):
    static_dir = os.path.join(APP_DIR, "static")

# Silenciar logs do Werkzeug
logging.getLogger('werkzeug').setLevel(logging.ERROR)
logging.getLogger('werkzeug').disabled = True

from flask import Flask, render_template, request, jsonify, Response
from werkzeug.serving import make_server

app = Flask(
    __name__,
    template_folder=template_dir,
    static_folder=static_dir,
    static_url_path=""
)
app.logger.disabled = True

from engine import whisper_engine
from injector import inject_text_at_cursor, press_enter_at_cursor
from hotkey import hotkey_manager
from hardware import get_system_hardware_info

# Fila para eventos SSE de atalho global (Ctrl + F8)
hotkey_event_queue = queue.Queue()

def on_hotkey_triggered():
    hotkey_event_queue.put({"action": "toggle_mic", "timestamp": time.time()})

# Conecta o callback do atalho global à fila SSE
hotkey_manager.callback = on_hotkey_triggered

@app.route("/")
def index():
    hw = get_system_hardware_info()
    return render_template("index.html", hardware=hw)

# -------------------------------------------------------------
# Rotas de Configuração YAML & Perfil JSON Local
# -------------------------------------------------------------

@app.route("/api/config", methods=["GET", "POST"])
def handle_config():
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        cfg.config.update(data)
        cfg.save()
        return jsonify({"status": "saved", "config": cfg.config})
    return jsonify(cfg.config)

@app.route("/api/profile", methods=["GET", "POST"])
def handle_profile():
    profile_path = cfg.get_user_profile_path()
    if request.method == "POST":
        data = request.get_json(force=True, silent=True) or {}
        try:
            with open(profile_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            return jsonify({"status": "saved"})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500

    if os.path.exists(profile_path):
        try:
            with open(profile_path, "r", encoding="utf-8") as f:
                return jsonify(json.load(f))
        except Exception:
            pass
    return jsonify({})

# -------------------------------------------------------------
# Rotas Nativas do Desktop (Compatibilidade 100% com Wisp Tauri/Web)
# -------------------------------------------------------------

@app.route("/api/native/<cmd>", methods=["POST"])
def handle_native_command(cmd):
    data = request.get_json(force=True, silent=True) or {}

    if cmd == "is_desktop_native":
        return jsonify(True)

    elif cmd == "get_system_hardware_info":
        hw = get_system_hardware_info()
        hw["supports_large_models"] = True
        return jsonify(hw)

    elif cmd == "check_native_engine_status":
        return jsonify(True)

    elif cmd == "is_native_engine_ready":
        return jsonify(whisper_engine.model is not None)

    elif cmd == "load_native_model":
        model_name = data.get("modelName") or cfg.get("ai_model", {}).get("default_model", "small")
        try:
            res = whisper_engine.load_model(model_name)
            return jsonify(res)
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    elif cmd == "transcribe_native_audio":
        audio = data.get("audio", [])
        lang = data.get("language") or cfg.get("dictation", {}).get("language", "pt")
        try:
            res = whisper_engine.transcribe(audio, language=lang)
            return jsonify(res)
        except Exception as e:
            return jsonify({"text": "", "error": str(e), "latency_ms": 0}), 500

    elif cmd == "inject_text_at_cursor":
        text = data.get("text", "")
        click_default = cfg.get("dictation", {}).get("click_before_type", False)
        click_to_focus = bool(data.get("clickToFocus", click_default) or data.get("click_to_focus", click_default))
        success = inject_text_at_cursor(text, click_to_focus=click_to_focus)
        return jsonify(success)

    elif cmd == "press_enter_at_cursor":
        click_default = cfg.get("dictation", {}).get("click_before_type", False)
        click_to_focus = bool(data.get("clickToFocus", click_default) or data.get("click_to_focus", click_default))
        success = press_enter_at_cursor(click_to_focus=click_to_focus)
        return jsonify(success)

    elif cmd == "get_current_global_hotkey":
        saved_hotkey = cfg.get("dictation", {}).get("global_hotkey", hotkey_manager.hotkey_str)
        return jsonify(saved_hotkey)

    elif cmd == "update_global_hotkey":
        hotkey = data.get("hotkey", "Ctrl+F8")
        hotkey_manager.update_hotkey(hotkey)
        cfg.config.setdefault("dictation", {})["global_hotkey"] = hotkey
        cfg.save()
        return jsonify(True)

    return jsonify({"error": f"Comando nativo desconhecido: {cmd}"}), 404

# Rotas diretas adicionais
@app.route("/api/inject", methods=["POST"])
def api_inject():
    data = request.get_json(force=True, silent=True) or {}
    text = data.get("text", "")
    click_to_focus = bool(data.get("clickToFocus", False) or data.get("click_to_focus", False))
    success = inject_text_at_cursor(text, click_to_focus=click_to_focus)
    return jsonify({"success": success})

@app.route("/api/transcribe", methods=["POST"])
def api_transcribe():
    data = request.get_json(force=True, silent=True) or {}
    audio = data.get("audio", [])
    lang = data.get("language", "pt")
    try:
        res = whisper_engine.transcribe(audio, language=lang)
        return jsonify(res)
    except Exception as e:
        return jsonify({"text": "", "error": str(e), "latency_ms": 0}), 500

@app.route("/api/status", methods=["GET"])
def get_status():
    return jsonify({
        "status": "online",
        "model": whisper_engine.current_model_name or "nenhum",
        "device": whisper_engine.device,
        "compute_type": whisper_engine.compute_type,
        "hotkey": hotkey_manager.hotkey_str,
        "is_loading": whisper_engine.is_loading,
        "models_dir": cfg.get_models_dir()
    })

@app.route("/api/hardware", methods=["GET"])
def get_hardware():
    return jsonify(get_system_hardware_info())

@app.route("/api/hotkey/events")
def sse_hotkey_events():
    def event_stream():
        while True:
            try:
                ev = hotkey_event_queue.get(timeout=25.0)
                yield f"data: {json.dumps(ev)}\n\n"
            except queue.Empty:
                yield f": ping\n\n"

    return Response(
        event_stream(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no"
        }
    )

server_instance = None

def start_server(host="127.0.0.1", port=28940, debug=False):
    global server_instance
    logging.getLogger('werkzeug').disabled = True
    server_instance = make_server(host, port, app, threaded=True)
    server_instance.serve_forever()

def stop_server():
    global server_instance
    if server_instance:
        try:
            server_instance.shutdown()
        except Exception:
            pass

if __name__ == "__main__":
    hotkey_manager.start()
    start_server(debug=False)
