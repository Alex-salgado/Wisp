import ctypes
import threading
import time
from ctypes import wintypes

user32 = ctypes.windll.user32

# Modifiers
MOD_ALT      = 0x0001
MOD_CONTROL  = 0x0002
MOD_SHIFT    = 0x0004
MOD_WIN      = 0x0008
MOD_NOREPEAT = 0x4000

# Virtual Keys map
VK_MAP = {
    "F1": 0x70, "F2": 0x71, "F3": 0x72, "F4": 0x73, "F5": 0x74,
    "F6": 0x75, "F7": 0x76, "F8": 0x77, "F9": 0x78, "F10": 0x79,
    "F11": 0x7A, "F12": 0x7B, "SPACE": 0x20, "ESPAÇO": 0x20,
    "RETURN": 0x0D, "ENTER": 0x0D, "TAB": 0x09, "ESCAPE": 0x1B
}
for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789":
    VK_MAP[c] = ord(c)

WM_HOTKEY = 0x0312
WM_QUIT   = 0x0012

class GlobalHotkeyManager:
    def __init__(self, hotkey_str="Ctrl+F8", callback=None):
        self.hotkey_str = hotkey_str
        self.callback = callback
        self.thread = None
        self.thread_id = None
        self.running = False
        self.last_trigger_time = 0
        self.event_counter = 0

    def parse_hotkey(self, text):
        parts = [p.strip().upper() for p in text.replace("-", "+").split("+") if p.strip()]
        mods = MOD_NOREPEAT
        vk = 0x77 # Default F8

        for p in parts:
            if p in ["CTRL", "CONTROL"]:
                mods |= MOD_CONTROL
            elif p in ["ALT"]:
                mods |= MOD_ALT
            elif p in ["SHIFT"]:
                mods |= MOD_SHIFT
            elif p in ["WIN", "WINDOWS", "SUPER"]:
                mods |= MOD_WIN
            elif p in VK_MAP:
                vk = VK_MAP[p]

        return mods, vk

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread_id:
            user32.PostThreadMessageW(self.thread_id, WM_QUIT, 0, 0)

    def update_hotkey(self, new_hotkey_str):
        self.hotkey_str = new_hotkey_str
        self.stop()
        time.sleep(0.1)
        self.start()

    def _loop(self):
        self.thread_id = ctypes.windll.kernel32.GetCurrentThreadId()

        # Garante criação da fila de mensagens Win32 para esta thread
        msg = wintypes.MSG()
        user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, 0)

        mods, vk = self.parse_hotkey(self.hotkey_str)
        hotkey_id = 1

        # Registra com MOD_NOREPEAT
        success = user32.RegisterHotKey(None, hotkey_id, mods, vk)
        if not success:
            # Fallback sem MOD_NOREPEAT caso o Windows rejeite
            mods_fallback = mods & ~MOD_NOREPEAT
            success = user32.RegisterHotKey(None, hotkey_id, mods_fallback, vk)

        if success:
            print(f"[Hotkey] Atalho global registrado com sucesso: {self.hotkey_str}")
        else:
            print(f"[Hotkey] Falha ao registrar atalho global: {self.hotkey_str}")

        try:
            while self.running:
                # GetMessageW bloqueia eficientemente sem consumir CPU
                ret = user32.GetMessageW(ctypes.byref(msg), None, 0, 0)
                if ret == 0 or ret == -1:
                    break

                if msg.message == WM_HOTKEY and msg.wParam == hotkey_id:
                    now = time.time()
                    # Debounce de 350ms para evitar disparos repetidos acidentais
                    if now - self.last_trigger_time > 0.35:
                        self.last_trigger_time = now
                        self.event_counter += 1
                        print(f"[Hotkey] Atalho {self.hotkey_str} disparado! (Contador: {self.event_counter})")
                        if self.callback:
                            try:
                                self.callback()
                            except Exception as ex:
                                print(f"[Hotkey] Erro no callback: {ex}")

                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))
        finally:
            user32.UnregisterHotKey(None, hotkey_id)
            self.running = False
            print("[Hotkey] Atalho global desregistrado.")

# Instância singleton global
hotkey_manager = GlobalHotkeyManager()

if __name__ == "__main__":
    def on_press():
        print(">>> AÇÃO: Alternando estado do Microfone! <<<")

    hk = GlobalHotkeyManager("Ctrl+F8", callback=on_press)
    hk.start()
    print("Pressione Ctrl+F8 em qualquer lugar do Windows. Pressione Ctrl+C para sair.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        hk.stop()
