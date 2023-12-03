"""VS64 Resource Compiler Frontend."""

import sys
import os
import getopt

from typing import Optional

SCRIPT_DIR = os.path.abspath(os.path.dirname(__file__))
sys.path.append(SCRIPT_DIR)

from rclib import ResourceCompiler, ResourceFactory

#############################################################################
# Main Entry
#############################################################################

def usage():
    """Print tool usage information."""

    print("Usage: rc [--format cpp|cc|acme|kick|raw] [--config config] -o output input...")
    print("")
    print("--format          : Specify output data format")
    print("                    cpp  - Generate C++ data")
    print("                    cc   - Generate C data")
    print("                    acme - Generate ACME assembler data")
    print("                    kick - Generate KickAssembler data")
    print("--config          : path to JSON configuration file")
    print("-o                : Name of file to be generated")
    print("input             : Resource files")

def main():
    """Main entry."""

    try:
        opts, args = getopt.getopt(sys.argv[1:], "ho:", ["format=", "config=", "help", "output="])
    except getopt.GetoptError as err:
        print(err.msg)
        usage()
        sys.exit(2)

    if len(opts) == 0 and len(args) == 0:
        usage()
        sys.exit(2)

    format_str: Optional[str] = None
    config_file: Optional[str] = None
    output: Optional[str] = None

    for option, arg in opts:
        if option in ("-h", "--help"):
            usage()
            sys.exit()
        elif option in ("--format"):
            format_str = arg
        elif option in ("--config"):
            config_file = arg
        elif option in ("-o", "--output"):
            output = arg

    resource_compiler = ResourceCompiler()
    resource_factory = ResourceFactory()

    err = resource_compiler.compile(args, output, resource_factory, format_str, config_file)
    if err:
        print(err.to_string())
        sys.exit(1)

if __name__ == "__main__":
    main()
