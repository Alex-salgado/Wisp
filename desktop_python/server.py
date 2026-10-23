import os
import sys
import time
import json
import queue
import logging

if getattr(sys, 'frozen', False):
    BASE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

# Fallback para pastas templates e static caso não estejam dentro de _MEIPASS
template_dir = os.path.join(BASE_DIR, "templates")
if not os.path.exists(template_dir):
    template_dir = os.path.join(os.path.dirname(sys.executable), "templates")

static_dir = os.path.join(BASE_DIR, "static")
if not os.path.exists(static_dir):
    static_dir = os.path.join(os.path.dirname(sys.executable), "static")

# Silenciar completamente logs do Werkzeug e servidor Flask
os.environ["WERKZEUG_RUN_MAIN"] = "true"
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)
log.disabled = True

from flask import Flask, render_template, request, jsonify, Response, send_from_directory

app = Flask(
    __name__,
    template_folder=template_dir,
    static_folder=static_dir,
    static_url_path=""
)
app.logger.disabled = True

# Silenciar banner do Flask CLI
try:
    import flask.cli
    flask.cli.show_server_banner = lambda *args, **kwargs: None
except Exception:
    pass

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
        model_name = data.get("modelName") or "small"
        try:
            res = whisper_engine.load_model(model_name)
            return jsonify(res)
        except Exception as e:
            return jsonify({"status": "error", "error": str(e)}), 500

    elif cmd == "transcribe_native_audio":
        audio = data.get("audio", [])
        lang = data.get("language", "pt")
        try:
            res = whisper_engine.transcribe(audio, language=lang)
            return jsonify(res)
        except Exception as e:
            return jsonify({"text": "", "error": str(e), "latency_ms": 0}), 500

    elif cmd == "inject_text_at_cursor":
        text = data.get("text", "")
        click_to_focus = bool(data.get("clickToFocus", False) or data.get("click_to_focus", False))
        success = inject_text_at_cursor(text, click_to_focus=click_to_focus)
        return jsonify(success)

    elif cmd == "press_enter_at_cursor":
        click_to_focus = bool(data.get("clickToFocus", False) or data.get("click_to_focus", False))
        success = press_enter_at_cursor(click_to_focus=click_to_focus)
        return jsonify(success)

    elif cmd == "get_current_global_hotkey":
        return jsonify(hotkey_manager.hotkey_str)

    elif cmd == "update_global_hotkey":
        hotkey = data.get("hotkey", "Ctrl+F8")
        hotkey_manager.update_hotkey(hotkey)
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

# -------------------------------------------------------------
# Rotas Complementares & SSE
# -------------------------------------------------------------

@app.route("/api/status", methods=["GET"])
def get_status():
    return jsonify({
        "status": "online",
        "model": whisper_engine.current_model_name or "nenhum",
        "device": whisper_engine.device,
        "compute_type": whisper_engine.compute_type,
        "hotkey": hotkey_manager.hotkey_str,
        "is_loading": whisper_engine.is_loading
    })

@app.route("/api/hardware", methods=["GET"])
def get_hardware():
    return jsonify(get_system_hardware_info())

@app.route("/api/hotkey/events")
def sse_hotkey_events():
    """Server-Sent Events para disparar atalhos na interface web em tempo real."""
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

def start_server(host="127.0.0.1", port=28940, debug=False):
    logging.getLogger('werkzeug').disabled = True
    app.run(host=host, port=port, debug=False, use_reloader=False, threaded=True)

if __name__ == "__main__":
    hotkey_manager.start()
    start_server(debug=False)
