#!/usr/bin/env python3
"""Download the pinned three.js files into codecity/vendor/ (one-time).

Run this once while you have internet. After that the viewer is fully offline.

    python fetch_vendor.py            # default three.js r160
    python fetch_vendor.py 0.160.0
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

THREE_VERSION = "0.160.0"

FILES = {
    "three.module.js": "https://unpkg.com/three@{v}/build/three.module.js",
    "OrbitControls.js": "https://unpkg.com/three@{v}/examples/jsm/controls/OrbitControls.js",
}


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    version = argv[0] if argv else THREE_VERSION
    here = Path(__file__).resolve().parent
    vendor = here / "vendor"
    vendor.mkdir(parents=True, exist_ok=True)

    for name, url in FILES.items():
        target = vendor / name
        if target.exists() and target.stat().st_size > 0:
            print(f"[codecity] skip {name} (already present)")
            continue
        full = url.format(v=version)
        print(f"[codecity] GET  {full}")
        with urllib.request.urlopen(full, timeout=60) as resp:
            data = resp.read()
        target.write_bytes(data)
        print(f"[codecity] saved {target} ({len(data) / 1024:.0f} KiB)")

    print("[codecity] vendor ready - the viewer now runs offline.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
