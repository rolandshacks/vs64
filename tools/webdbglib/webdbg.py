"""Basic."""

import os
import io
import re
import http.server

from typing import Optional

DEFAULT_PORT = 8080

#############################################################################
# Web Debug Error
#############################################################################

class WebDebugError:
    """Web debug errors."""

    def __init__(self, error: str):
        self.error = error

    def to_string(self):
        """Get string representation for error."""
        return f"error: {self.error}"

#############################################################################
# Web Debug Server Options
#############################################################################

class WebDebugOptions:
    """Compile options."""

    def __init__(self):
        self.port = DEFAULT_PORT
        self.verbosity_level = 0

    def set_port(self, port):
        """Set port."""
        self.port = port

    def set_verbosity_level(self, verbosity_level):
        """Set verbosity level."""
        self.verbosity_level = verbosity_level


#############################################################################
# Web Debug Server
#############################################################################

class WebDebug():
    """Web Debug Server."""

    def __init__(self, options: WebDebugOptions):
        """Constructor."""
        self.options = options

    def run(self) -> Optional[WebDebugError]:
        """Run debug server."""
        http.server.test(HandlerClass=WebDebugHttpRequestHandler, port=self.options.port)

class WebDebugHttpRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom request handler."""
    def end_headers(self):
        self.send_my_headers()
        http.server.SimpleHTTPRequestHandler.end_headers(self)

    def send_my_headers(self):
        """Patch headers."""
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

    macros = {
        "TITLE": "Test",
        "NAME": "mediaview",
        "RES": ".",
        "DIST": "dist",
        "NONCE": "12345",
        "CSP_SOURCE": "*",
        "BUNDLEIMPORT": 'import { testmain } from "../dist/web.js";',
        "BUNDLEENTRY": 'testmain(config);',
        "TESTSTYLE": '<link href="test.css" rel="stylesheet" />'
    }

    def replace_macros(self, content: str) -> str:
        # ${var} ersetzen
        def repl(match):
            key = match.group(1)
            return self.macros.get(key, match.group(0))  # falls nicht gefunden → unverändert

        return re.sub(r"\$\{(\w+)\}", repl, content)

    def send_head(self):
        path = self.translate_path(self.path)

        try:
            with open(path, "rb") as f:
                content = f.read()

            # Nur Textdateien bearbeiten
            if path.endswith((".html")):
                name = os.path.basename(path)[:-5]
                self.macros["NAME"] = name
                text = content.decode("utf-8")
                text = self.replace_macros(text)
                content = text.encode("utf-8")

            self.send_response(200)
            self.send_header("Content-type", self.guess_type(path))
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()

            return io.BytesIO(content)

        except FileNotFoundError:
            self.send_error(404, "File not found")
            return None
