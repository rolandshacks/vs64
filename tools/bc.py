"""VS64 Basic Compiler."""

import sys
import os
import getopt

from typing import Optional

SCRIPT_DIR = os.path.abspath(os.path.dirname(__file__))
sys.path.append(SCRIPT_DIR)

from bclib import BasicCompiler

#############################################################################
# Main Entry
#############################################################################

def usage():
    """Print tool usage information."""

    print("Usage: bc [--config config] [--map mapfile] -o output input...")
    print("")
    print("-h, --help        . show this help")
    print("-v, --verbose     : Verbose output")
    print("-n, --noext       : Disable BASIC extensions")
    print("-m, --map         : Name of source map file to be generated")
    print("-I, --include     : Add include directory (multiple usage possible")
    print("-o, --output      : Name of file to be generated")
    print("-u, --unpack      : Unpack a .prg into BASIC source code")
    print("input             : Source files")

def main():
    """Main entry."""

    try:
        opts, args = getopt.getopt(sys.argv[1:], "hvnum:I:o:", ["help", "verbose", "noext", "unpack", "map=", "include=", "output="])
    except getopt.GetoptError as err:
        print(err.msg)
        usage()
        sys.exit(2)

    if len(opts) == 0 and len(args) == 0:
        usage()
        sys.exit(2)

    output: Optional[str] = None
    map_file: Optional[str] = None
    verbose: bool = False
    include_path = []
    disable_extensions: bool = False
    unpack: bool = False

    for option, arg in opts:
        if option in ("-h", "--help"):
            usage()
            sys.exit()
        elif option in ("-o", "--output"):
            output = arg
        elif option in ("-m", "--map"):
            map_file = arg
        elif option in ("-I", "--include"):
            include_path.append(arg)
        elif option in ("-n", "--noext"):
            disable_extensions = True
        elif option in ("-v", "--verbose"):
            verbose = True
        elif option in ("-u", "--unpack"):
            unpack = True

    basic_compiler = BasicCompiler()

    err = None

    if unpack:
        err = basic_compiler.unpack(args, output, verbose, disable_extensions)
    else:
        err = basic_compiler.compile(args, output, map_file, include_path, verbose, disable_extensions)

    if err:
        print(err.to_string())
        sys.exit(1)

if __name__ == "__main__":
    main()
