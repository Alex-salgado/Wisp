import os
import ctypes
import platform
import subprocess

def get_system_hardware_info():
    # 1. CPU cores
    cpu_cores = os.cpu_count() or 4

    # 2. Total & Available RAM via Win32 GlobalMemoryStatusEx
    class MEMORYSTATUSEX(ctypes.Structure):
        _fields_ = [
            ("dwLength", ctypes.c_ulong),
            ("dwMemoryLoad", ctypes.c_ulong),
            ("ullTotalPhys", ctypes.c_ulonglong),
            ("ullAvailPhys", ctypes.c_ulonglong),
            ("ullTotalPageFile", ctypes.c_ulonglong),
            ("ullAvailPageFile", ctypes.c_ulonglong),
            ("ullTotalVirtual", ctypes.c_ulonglong),
            ("ullAvailVirtual", ctypes.c_ulonglong),
            ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
        ]

    total_ram_gb = 16.0
    avail_ram_gb = 8.0
    try:
        stat = MEMORYSTATUSEX()
        stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
            total_ram_gb = round(stat.ullTotalPhys / (1024 ** 3), 1)
            avail_ram_gb = round(stat.ullAvailPhys / (1024 ** 3), 1)
    except Exception:
        pass

    # 3. GPU Detection (CUDA / RTX 5060)
    gpu_name = "Processador (CPU)"
    has_cuda = False
    cuda_compute = "int8"
    vram_gb = 0.0

    try:
        import ctranslate2
        if ctranslate2.get_cuda_device_count() > 0:
            has_cuda = True
            cuda_compute = "float16"
    except Exception:
        pass

    # Tenta obter nome real da GPU via Win32 CIM / PowerShell ou wmic
    try:
        cmd = 'powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"'
        out = subprocess.check_output(cmd, shell=True, text=True, timeout=3).strip()
        lines = [l.strip() for l in out.splitlines() if l.strip()]
        for l in lines:
            if "NVIDIA" in l or "GeForce" in l or "RTX" in l:
                gpu_name = l
                break
            elif "Radeon" in l or "Intel" in l:
                gpu_name = l
    except Exception:
        if has_cuda:
            gpu_name = "NVIDIA GeForce RTX (CUDA)"

    return {
        "gpu_name": gpu_name,
        "has_cuda": has_cuda,
        "compute_type": cuda_compute if has_cuda else "int8",
        "total_ram_gb": total_ram_gb,
        "avail_ram_gb": avail_ram_gb,
        "cpu_cores": cpu_cores,
        "os_arch": platform.machine(),
        "is_64bit": platform.architecture()[0] == "64bit",
        "recommended_model": "medium" if has_cuda and total_ram_gb >= 8 else "small"
    }

if __name__ == "__main__":
    import json
    print(json.dumps(get_system_hardware_info(), indent=2))
