#!/usr/bin/env python3
"""metrics_agent.py - optional local agent for LIVE CPU/RAM in the CodeCity viewer.

The viewer works fully offline with static estimates; if this agent is running
it polls `http://127.0.0.1:8770/metrics` and replaces the estimates with live
numbers.

    python metrics_agent.py [port]        # default 8770

Uses psutil when installed, otherwise a stdlib fallback (Windows ctypes /
Linux /proc). No dependencies required.
"""

from __future__ import annotations

import http.server
import json
import socketserver
import sys
import time
import threading

_last_cpu = None  # (idle, total) for the delta-based CPU calculation
_cpu_lock = threading.Lock()


def _cpu_percent(idle, total):
    """A process-wide sample, shared by HTTP request threads."""
    global _last_cpu
    with _cpu_lock:
        previous = _last_cpu
        _last_cpu = (idle, total)
        if previous is None or total <= previous[1]:
            return -1
        di, dt = idle - previous[0], total - previous[1]
        return round(max(0.0, min(100.0, 100.0 * (1 - di / dt))))


def _cpu_ram() -> dict:
    # preferred: psutil
    try:
        import psutil  # type: ignore
        vm = psutil.virtual_memory()
        times = psutil.cpu_times()
        total = sum(times) - getattr(times, 'guest', 0) - getattr(times, 'guest_nice', 0)
        idle = times.idle + getattr(times, 'iowait', 0)
        return {
            "cpu_pct": _cpu_percent(idle, total),
            "ram_pct": round(vm.percent),
            "ram_used_mb": round(vm.used / 1048576),
            "ram_total_mb": round(vm.total / 1048576),
        }
    except Exception:
        pass
    # Windows fallback (ctypes)
    if sys.platform.startswith("win"):
        import ctypes

        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                        ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]

        st = MEMORYSTATUSEX()
        st.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st))
        idle = ctypes.c_ulonglong()
        kernel = ctypes.c_ulonglong()
        user = ctypes.c_ulonglong()
        ctypes.windll.kernel32.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user))
        total = kernel.value + user.value
        cpu = _cpu_percent(idle.value, total)
        used = st.ullTotalPhys - st.ullAvailPhys
        return {
            "cpu_pct": cpu,
            "ram_pct": st.dwMemoryLoad,
            "ram_used_mb": round(used / 1048576),
            "ram_total_mb": round(st.ullTotalPhys / 1048576),
        }
    # Linux fallback (/proc)
    try:
        with open("/proc/stat") as f:
            parts = f.readline().split()[1:]
        vals = [int(x) for x in parts]
        idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
        total = sum(vals[:8])  # guest times are already included in user/nice
        cpu = _cpu_percent(idle, total)
        mem = {}
        with open("/proc/meminfo") as f:
            for line in f:
                k, _, v = line.partition(":")
                mem[k.strip()] = int(v.split()[0])
        tot = mem.get("MemTotal", 1)
        avail = mem.get("MemAvailable", mem.get("MemFree", 0))
        return {
            "cpu_pct": cpu,
            "ram_pct": round(100 * (tot - avail) / tot),
            "ram_used_mb": round((tot - avail) / 1024),
            "ram_total_mb": round(tot / 1024),
        }
    except Exception:
        return {"available": False}


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] in ("/metrics", "/"):
            data = _cpu_ram()
            data["t"] = time.time()
            self._send(data)
        else:
            self._send({"error": "not found"}, 404)

    def log_message(self, *a):
        pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8770
    _cpu_ram()  # prime the CPU delta
    time.sleep(0.3)
    with Server(("127.0.0.1", port), Handler) as httpd:
        print(f"[metrics_agent] http://127.0.0.1:{port}/metrics  (Ctrl+C to stop)")
        httpd.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
