#!/usr/bin/env python3
"""Dev server for the portfolio.

Identical to `python3 -m http.server` except it tells the browser never to
cache anything — otherwise an edited main.js keeps serving from cache and the
page looks unchanged until a hard reload.

    ./tools/serve.py [port]
"""
import os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter: only failures
        if not args or not str(args[1]).startswith("2"):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    print(f"serving http://localhost:{port} (no cache)")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
