"""VS64 Basic Compiler."""

import sys
import os
import getopt

from typing import Optional

SCRIPT_DIR = os.path.abspath(os.path.dirname(__file__))
sys.path.append(SCRIPT_DIR)

from bclib import CompileOptions, BasicCompiler, BasicDecompiler

#############################################################################
# Main Entry
#############################################################################

def usage():
    """Print tool usage information."""

    print("Usage: bc [--config config] [--map mapfile] -o output input...")
    print("")
    print("-h, --help         : show this help")
    print("-n, --noext        : Disable BASIC extensions")
    print("-l, --lower        : Enable lower-case mode")
    print("-m, --map          : Name of source map file to be generated")
    print("-I, --include      : Add include directory (multiple usage possible")
    print("-o, --output       : Name of file to be generated")
    print("-u, --unpack       : Unpack a .prg into BASIC source code")
    print("-c, --crunch       : Crunch BASIC source code")
    print("-p, --pretty       : Make BASIC source code pretty")
    print("-v, --verbose      : Verbose output")
    print("-d, --debug        : Show extended debug output")
    print("input              : Source files")

def main():
    """Main entry."""

    try:
        opts, args = getopt.getopt(sys.argv[1:], "hvdtlumcp:I:o:", ["help", "verbose", "debug", "tsb", "lower", "unpack", "crunch", "pretty", "map=", "include=", "output="])
    except getopt.GetoptError as err:
        print(err.msg)
        usage()
        sys.exit(2)

    if len(opts) == 0 and len(args) == 0:
        usage()
        sys.exit(2)

    unpack: bool = False
    output: Optional[str] = None
    options = CompileOptions()

    for option, arg in opts:
        if option in ("-h", "--help"):
            usage()
            sys.exit()
        elif option in ("-o", "--output"):
            output = arg
        elif option in ("-m", "--map"):
            options.set_map_file(arg)
        elif option in ("-I", "--include"):
            options.append_include_path(arg)
        elif option in ("-t", "--tsb"):
            options.set_enable_tsb()
        elif option in ("-v", "--verbose"):
            options.set_verbosity_level(1)
        elif option in ("-d", "--debug"):
            options.set_verbosity_level(2)
        elif option in ("-c", "--crunch"):
            options.set_crunch()
        elif option in ("-p", "--pretty"):
            options.set_pretty()
        elif option in ("-l", "--lower"):
            options.set_lower_case()
        elif option in ("-u", "--unpack"):
            unpack = True

    err = None

    if unpack:
        basic_decompiler = BasicDecompiler(options)
        err = basic_decompiler.unpack(args, output)
    else:
        basic_compiler = BasicCompiler(options)
        err = basic_compiler.compile(args, output)

    if err:
        print(err.to_string())
        sys.exit(1)

if __name__ == "__main__":
    main()
