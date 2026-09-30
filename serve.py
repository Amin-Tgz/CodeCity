#!/usr/bin/env python3
"""serve.py - build the city model and serve the CodeCity viewer.

    python serve.py                       # build (if needed) + serve + open browser
    python serve.py --rebuild             # force a fresh city.json first
    python serve.py --root .. --port 8000
    python serve.py --no-build            # just serve what is already there

Everything is standard library - no pip install required.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Serve the CodeCity viewer.")
    ap.add_argument("--port", type=int, default=8137)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--root", default=str(HERE.parent), help="codebase to visualise")
    ap.add_argument("--source", choices=["auto", "codegraph", "scan"], default="auto")
    ap.add_argument("--rebuild", action="store_true", help="rebuild city.json before serving")
    ap.add_argument("--no-build", action="store_true", help="do not build, just serve")
    ap.add_argument("--no-open", action="store_true", help="do not open the browser")
    args = ap.parse_args(argv)

    city_json = HERE / "city.json"
    if not args.no_build and (args.rebuild or not city_json.exists()):
        sys.path.insert(0, str(HERE))
        import build_city
        print(f"[codecity] building model from {args.root}")
        build_city.build(Path(args.root), city_json, args.source, None)
    elif not city_json.exists():
        print("[codecity] city.json missing - run without --no-build, or: python build_city.py")
        return 1

    handler = functools.partial(Handler, directory=str(HERE))
    url = f"http://{args.host}:{args.port}/index.html"

    port = args.port
    for _ in range(20):
        try:
            httpd = Server((args.host, port), handler)
            break
        except OSError:
            port += 1
    else:
        print("[codecity] no free port found")
        return 1

    url = f"http://{args.host}:{port}/index.html"
    print(f"[codecity] serving {HERE}  ->  {url}")
    print("[codecity] Ctrl+C to stop")

    if not args.no_open:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[codecity] stopped")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
