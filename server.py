import http.server
import socketserver
import os
import sys
import webbrowser

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class DualHeaderHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Permitir CORS e evitar bloqueios de CORP (require-corp) para download de modelos
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def guess_type(self, path):
        if path.endswith(".wasm"):
            return "application/wasm"
        if path.endswith(".onnx"):
            return "application/octet-stream"
        if path.endswith(".js") or path.endswith(".mjs"):
            return "application/javascript"
        if path.endswith(".json"):
            return "application/json"
        if path.endswith(".css"):
            return "text/css"
        return super().guess_type(path)

def run():
    os.chdir(DIRECTORY)
    handler = DualHeaderHTTPRequestHandler
    
    print("=" * 60)
    print("       WISP WEB - SERVIDOR LOCAL DE DESENVOLVIMENTO")
    print("=" * 60)
    print(f"Diretorio: {DIRECTORY}")
    print(f"Acessivel em: http://localhost:{PORT}")
    print("=" * 60)
    
    try:
        webbrowser.open(f"http://localhost:{PORT}")
    except Exception:
        pass

    with socketserver.TCPServer(("", PORT), handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor encerrado.")
            httpd.server_close()

if __name__ == "__main__":
    run()
