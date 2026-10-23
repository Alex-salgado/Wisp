import ctypes
import time
from ctypes import wintypes

# Win32 Constants
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP   = 0x0004
VK_CONTROL = 0x11
VK_V       = 0x56
VK_RETURN  = 0x0D
VK_MENU    = 0x12  # Alt
KEYEVENTF_KEYUP = 0x0002
GA_ROOT = 2
CF_UNICODETEXT = 13
GMEM_MOVEABLE = 0x0002
DESKTOP_GENERIC_ALL = 0x01FF

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

class POINT(ctypes.Structure):
    _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

# Configurações de Tipos Win32 de 64 bits explícitos
user32.OpenInputDesktop.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
user32.OpenInputDesktop.restype = wintypes.HANDLE

user32.SetThreadDesktop.argtypes = [wintypes.HANDLE]
user32.SetThreadDesktop.restype = wintypes.BOOL

user32.CloseDesktop.argtypes = [wintypes.HANDLE]
user32.CloseDesktop.restype = wintypes.BOOL

user32.GetCursorPos.argtypes = [ctypes.POINTER(POINT)]
user32.GetCursorPos.restype = wintypes.BOOL

user32.WindowFromPoint.argtypes = [POINT]
user32.WindowFromPoint.restype = wintypes.HWND

user32.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
user32.GetAncestor.restype = wintypes.HWND

user32.GetForegroundWindow.argtypes = []
user32.GetForegroundWindow.restype = wintypes.HWND

user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.SetForegroundWindow.restype = wintypes.BOOL

user32.BringWindowToTop.argtypes = [wintypes.HWND]
user32.BringWindowToTop.restype = wintypes.BOOL

user32.AllowSetForegroundWindow.argtypes = [wintypes.DWORD]
user32.AllowSetForegroundWindow.restype = wintypes.BOOL

user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
user32.GetWindowThreadProcessId.restype = wintypes.DWORD

user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
user32.AttachThreadInput.restype = wintypes.BOOL

user32.mouse_event.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, ctypes.c_size_t]
user32.mouse_event.restype = None

user32.keybd_event.argtypes = [wintypes.BYTE, wintypes.BYTE, wintypes.DWORD, ctypes.c_size_t]
user32.keybd_event.restype = None

kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
kernel32.GlobalAlloc.restype = ctypes.c_void_p
kernel32.GlobalLock.argtypes = [ctypes.c_void_p]
kernel32.GlobalLock.restype = ctypes.c_void_p
kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]
kernel32.GlobalFree.argtypes = [ctypes.c_void_p]

user32.OpenClipboard.argtypes = [wintypes.HWND]
user32.OpenClipboard.restype = wintypes.BOOL
user32.EmptyClipboard.argtypes = []
user32.EmptyClipboard.restype = wintypes.BOOL
user32.SetClipboardData.argtypes = [wintypes.UINT, ctypes.c_void_p]
user32.SetClipboardData.restype = ctypes.c_void_p
user32.CloseClipboard.argtypes = []
user32.CloseClipboard.restype = wintypes.BOOL

# Armazena o HWND da janela principal do Wisp se conhecido
_wisp_window_hwnd = None

def set_wisp_window_handle(hwnd):
    global _wisp_window_hwnd
    _wisp_window_hwnd = hwnd

def ensure_desktop_access():
    """Conecta a thread atual ao desktop interativo para que GetCursorPos e SetForegroundWindow funcionem de threads Flask."""
    try:
        h_desk = user32.OpenInputDesktop(0, False, DESKTOP_GENERIC_ALL)
        if h_desk:
            user32.SetThreadDesktop(h_desk)
            user32.CloseDesktop(h_desk)
    except Exception:
        pass

def set_clipboard_text(text: str) -> bool:
    """Copia texto unicode diretamente para a área de transferência do Windows."""
    if not text:
        return True

    data = text.encode("utf-16-le") + b"\x00\x00"
    h_mem = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(data))
    if not h_mem:
        return False

    p_mem = kernel32.GlobalLock(h_mem)
    if not p_mem:
        kernel32.GlobalFree(h_mem)
        return False

    ctypes.memmove(p_mem, data, len(data))
    kernel32.GlobalUnlock(h_mem)

    # Abre a área de transferência com até 8 tentativas rápidas
    for _ in range(8):
        if user32.OpenClipboard(None):
            break
        time.sleep(0.015)
    else:
        kernel32.GlobalFree(h_mem)
        return False

    user32.EmptyClipboard()
    res = user32.SetClipboardData(CF_UNICODETEXT, h_mem)
    user32.CloseClipboard()
    return bool(res)

def activate_window_under_mouse(click: bool = False) -> bool:
    """
    Ativa suavemente a janela onde o ponteiro do mouse está apontado ou a janela em primeiro plano.
    Retorna True se for uma janela externa (Word, Bloco de Notas, Navegador, etc.),
    ou False se for a própria janela do Wisp Desktop.
    """
    ensure_desktop_access()

    pt = POINT()
    if not user32.GetCursorPos(ctypes.byref(pt)):
        # Fallback se não conseguir pegar o cursor
        pass

    hwnd_under_mouse = user32.WindowFromPoint(pt)
    fg_hwnd = user32.GetForegroundWindow()

    # Prioriza a janela sob o mouse; se não detectada, usa a janela ativa em foco
    target_hwnd = hwnd_under_mouse if hwnd_under_mouse else fg_hwnd
    if not target_hwnd:
        return False

    root_hwnd = user32.GetAncestor(target_hwnd, GA_ROOT)
    final_target = root_hwnd if root_hwnd else target_hwnd

    # Se for a própria janela principal do Wisp conhecida
    global _wisp_window_hwnd
    if _wisp_window_hwnd and (final_target == _wisp_window_hwnd or target_hwnd == _wisp_window_hwnd):
        return False

    current_pid = kernel32.GetCurrentProcessId()
    target_pid = wintypes.DWORD()
    user32.GetWindowThreadProcessId(final_target, ctypes.byref(target_pid))

    # Se a janela for do próprio processo do Wisp Desktop, o texto já vai para o editor HTML
    if target_pid.value == current_pid:
        return False

    needs_activation = (final_target != fg_hwnd)

    if needs_activation:
        try:
            user32.AllowSetForegroundWindow(target_pid.value)
        except Exception:
            pass

        current_tid = kernel32.GetCurrentThreadId()
        target_tid = user32.GetWindowThreadProcessId(final_target, None)
        fg_tid = user32.GetWindowThreadProcessId(fg_hwnd, None) if fg_hwnd else 0

        if fg_tid and fg_tid != current_tid:
            user32.AttachThreadInput(current_tid, fg_tid, True)
        if target_tid and target_tid != current_tid:
            user32.AttachThreadInput(current_tid, target_tid, True)

        # Destrava restrição de SetForegroundWindow simulando tecla Menu (Alt)
        user32.keybd_event(VK_MENU, 0, 0, 0)
        user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)

        user32.SetForegroundWindow(final_target)
        user32.BringWindowToTop(final_target)
        time.sleep(0.04)

        if fg_tid and fg_tid != current_tid:
            user32.AttachThreadInput(current_tid, fg_tid, False)
        if target_tid and target_tid != current_tid:
            user32.AttachThreadInput(current_tid, target_tid, False)

    # Se solicitado clique para focar ou se a janela precisou ser ativada
    if click or needs_activation:
        user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        time.sleep(0.015)
        user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        time.sleep(0.04)

    return True

def inject_text_at_cursor(text: str, click_to_focus: bool = False) -> bool:
    """Injeta o texto na janela externa onde o mouse estiver apontando via Clipboard + Ctrl+V."""
    if not text:
        return True

    is_external = activate_window_under_mouse(click=click_to_focus)
    if not is_external:
        return True

    if not set_clipboard_text(text):
        return False

    time.sleep(0.03)

    # Simulação nativa de Ctrl + V
    user32.keybd_event(VK_CONTROL, 0, 0, 0)
    user32.keybd_event(VK_V, 0, 0, 0)
    time.sleep(0.02)
    user32.keybd_event(VK_V, 0, KEYEVENTF_KEYUP, 0)
    user32.keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)
    time.sleep(0.03)
    return True

def press_enter_at_cursor(click_to_focus: bool = False) -> bool:
    """Envia o comando Enter para a janela ativa onde o mouse estiver apontando."""
    is_external = activate_window_under_mouse(click=click_to_focus)
    if not is_external:
        return True

    user32.keybd_event(VK_RETURN, 0, 0, 0)
    time.sleep(0.015)
    user32.keybd_event(VK_RETURN, 0, KEYEVENTF_KEYUP, 0)
    time.sleep(0.02)
    return True
