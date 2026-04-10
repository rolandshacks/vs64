"""VS64 Web Debug Server."""

import sys
import os
import getopt

from typing import Optional

SCRIPT_DIR = os.path.abspath(os.path.dirname(__file__))
sys.path.append(SCRIPT_DIR)

from webdbglib import WebDebug, WebDebugOptions

#############################################################################
# Main Entry
#############################################################################

def usage():
    """Print tool usage information."""

    print("Usage: webdbg [options] [port]")
    print("")
    print("options:")
    print("  -h, --help         : Show this help")
    print("  -v, --verbose      : Verbose output")
    print("  -d, --debug        : Show extended debug output")
    print("port                 : Server port, default: 8080")

def logo():
    """Print logo."""
    print("\n\033[0;38;5;196;49m", end='')
    print("██     ██ ███████ ██████  ██████  ██████   ██████  ")
    print("\033[0;38;5;160;49m", end='')
    print("██     ██ ██      ██   ██ ██   ██ ██   ██ ██       ")
    print("\033[0;38;5;124;49m", end='')
    print("██  █  ██ █████   ██████  ██   ██ ██████  ██   ███ ")
    print("\033[0;38;5;88;49m", end='')
    print("██ ███ ██ ██      ██   ██ ██   ██ ██   ██ ██    ██ ")
    print("\033[0;38;5;52;49m", end='')
    print(" ███ ███  ███████ ██████  ██████  ██████   ██████  ")
    print("\033[0m", end='')
    print("")

def main():
    """Main entry."""

    try:
        opts, args = getopt.getopt(sys.argv[1:], "hvd", ["help", "verbose", "debug"])
    except getopt.GetoptError as err:
        print(err.msg)
        usage()
        sys.exit(2)

    options = WebDebugOptions()
    if len(args) > 0: options.port = int(args[0])

    for option, _arg in opts:
        if option in ("-h", "--help"):
            usage()
            sys.exit()
        elif option in ("-v", "--verbose"):
            options.verbosity_level(1)
        elif option in ("-d", "--debug"):
            options.verbosity_level(2)

    logo()

    webdbg = WebDebug(options)
    webdbg.run()

if __name__ == "__main__":
    main()
