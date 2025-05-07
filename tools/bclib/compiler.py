"""Basic."""

import os
import re

from typing import Optional

from .constants import Constants
from .common import CompileError, CompileOptions, CompileBuffer, CompileHelper

#############################################################################
# Basic Module
#############################################################################

class BasicModule:
    """Basic module."""

    def __init__(self, filename: str, options: CompileOptions):
        self.filename = filename
        self.options = options

    def read(self) -> (Optional[str], Optional[CompileError]):
        """Read module source code from file."""
        data = None
        try:
            with open(self.filename, "r", encoding="utf-8") as in_file:
                data = in_file.readlines()
        except OSError:
            return None, CompileError(self.filename, "could not read file")

        return data, None


#############################################################################
# Basic Line
#############################################################################

class BasicLine:
    """Basic line."""

    def __init__(self, module: BasicModule, line_number: Optional[int] = None):
        self.buffer = CompileBuffer()
        self.module = module
        self.line_number = line_number
        self.addr = 0x0
        self.next_addr = 0x0
        self.meta = False
        self.verbose = None
        self.source_line = None
        self.index = None

    def get_bytes(self) -> CompileBuffer:
        """Get buffer object."""
        return self.buffer.get_buffer()

    def set_source_line(self, source_line: str):
        """Set raw text."""
        self.source_line = source_line

    def set_index(self, index: int):
        """Set line index."""
        self.index = index

    def set_meta(self):
        """Mark line as nop/meta information."""
        self.meta = True

    def set_addr(self, addr: int):
        """Set BASIC line memory address."""
        self.addr = addr

    def set_next_addr(self, next_addr: int):
        """Set next BASIC line memory address."""
        self.next_addr = next_addr

    def get_code_size(self) -> int:
        """Get code size in bytes."""
        return self.buffer.length()

    def get_total_size(self) -> int:
        """Get line header and code size in bytes."""
        return (
            self.get_code_size() + 5
        )  # 2 (next addr) + 2 (line number) + CODE + 1 (null byte for end)

    def add_verbose(self, s):
        """Add verbose info."""
        if self.verbose is None:
            self.verbose = ""
        self.verbose += s

    def is_empty(self) -> bool:
        """Check if buffer is empty."""
        return self.buffer.length() < 1

    def set_line_number(self, line_number: int):
        """Set line number."""
        self.line_number = line_number

    def store_byte(self, value, verbose: Optional[str] = None):
        """Store byte to buffer."""
        self.buffer.store_byte(value)
        if verbose:
            self.add_verbose(verbose)

    def peek_last_char(self):
        """Get last char from buffer."""
        return self.buffer.peek_last_char()

    def drop_last_char(self):
        """Drop last char from buffer."""
        self.buffer.drop_last_char()
        if len(self.verbose) > 0 and self.verbose[-1] == ":":
            self.verbose = self.verbose[:-1]

    def store_char(self, c, verbose: Optional[str] = None):
        """Store char to buffer."""
        self.buffer.store_char(c, self.module.options.lower_case)
        self.add_verbose(verbose if verbose else c)

    def store_char_raw(self, c, verbose: Optional[str] = None):
        """Store char to buffer."""
        self.buffer.store_char_raw(c)
        self.add_verbose(verbose if verbose else c)

    def store_string(self, s: str, verbose: Optional[str] = None):
        """Store string bytes to buffer."""
        self.buffer.store_string(s, self.module.options.lower_case)
        self.add_verbose(verbose if verbose else s)

    def store_word_be(self, value, verbose: Optional[str] = None):
        """Store word to buffer."""
        self.buffer.store_word_be(value)
        if verbose:
            self.add_verbose(verbose)

    def to_string(self) -> str:
        """Generate string representation."""

        if self.meta:
            return self.verbose

        if not self.verbose:
            return f"{self.line_number}"

        return f"{self.line_number} {self.verbose}"


#############################################################################
# SourceMap
#############################################################################

class SourceMap:
    """Debug information."""

    def __init__(self):
        self.buffer = []

    def add_file(self, filename):
        """Add file to source map."""
        self.buffer.append(os.path.normpath(filename))

    def add(self, start_addr, end_addr, idx, line, line_len):
        """Add entry to source map."""
        self.buffer.append(f"{start_addr},{end_addr},{idx},{line},{line_len}")

    def get_string(self):
        """Join all entries to string."""
        s = "\n".join(self.buffer)
        return s


#############################################################################
# Basic Program
#############################################################################

class BasicProgram:
    """Basic program."""

    def __init__(self, start_addr):
        self.start_addr = start_addr
        self.lines: list[BasicLine] = []

    def get_lines(self) -> "list[BasicLine]":
        """Get BASIC lines."""
        return self.lines

    def add_line(self, line: BasicLine):
        """Add BASIC line."""
        self.lines.append(line)

    def add_meta(self, module: BasicModule, s: str):
        """Add meta information."""
        line = BasicLine(module)
        line.set_meta()
        line.add_verbose(s)
        self.add_line(line)

    def resolve(self):
        """Resolve all addresses."""

        addr = self.start_addr

        for basic_line in self.get_lines():
            if basic_line.meta:
                continue
            if basic_line.is_empty():
                print(f"skip empty line {basic_line.line_number}")
                continue

            next_addr = addr + basic_line.get_total_size()
            basic_line.set_addr(addr)
            basic_line.set_next_addr(next_addr)
            addr = next_addr

    def write_map(self, filename: Optional[str]) -> Optional[CompileError]:
        """Write map file."""

        s = []

        source_file = ""

        s.append(
            "################################################################################"
        )
        s.append("# MAP FILE")
        s.append("# generated file: DO NOT EDIT!")
        s.append(
            "################################################################################"
        )

        for basic_line in self.get_lines():
            if basic_line.meta or basic_line.is_empty():
                continue

            if source_file != basic_line.module.filename:
                source_file = basic_line.module.filename
                s.append("")
                s.append(f"{source_file}")

            # --------------------------------------------------
            # Info Structure:
            # --------------------------------------------------
            # start_addr : program line absolute start address
            # end_addr   : program line absolute end address
            # line       : numeric BASIC line number
            # idx        : row number in source file
            # len        : number of source chars
            # --------------------------------------------------

            start_addr = basic_line.addr
            end_addr = start_addr + basic_line.get_total_size() - 1
            line = basic_line.line_number
            idx = basic_line.index
            line_len = len(basic_line.source_line)
            src = basic_line.to_string()

            info = f"{start_addr},{end_addr},{line},{idx},{line_len}"

            s.append(info.ljust(30) + f"# {src}")

        s.append("")
        content = "\n".join(s)

        if filename:
            err = CompileHelper.write_textfile(filename, content)
            if err:
                return err
        else:
            print(content)

        return None

    def write_prg(self, filename: Optional[str]) -> Optional[CompileError]:
        """Write program to file or console."""

        if not filename:
            return None

        CompileHelper.makedirs(filename)

        try:
            with open(filename, "wb") as binary_file:
                # program load address (2 bytes)
                addr = self.start_addr
                binary_file.write(bytearray([addr & 0xFF, (addr & 0xFF00) >> 8]))

                # write basic lines
                for basic_line in self.get_lines():
                    if basic_line.meta:
                        continue

                    # address of next statement (2 bytes)
                    next_addr = basic_line.next_addr
                    binary_file.write(
                        bytearray([next_addr & 0xFF, (next_addr & 0xFF00) >> 8])
                    )

                    # line number (2 bytes)
                    line_number = basic_line.line_number
                    binary_file.write(
                        bytearray([line_number & 0xFF, (line_number & 0xFF00) >> 8])
                    )

                    # interpreter code
                    binary_file.write(basic_line.get_bytes())

                    # end of line (1 zero-byte)
                    binary_file.write(b"\x00")  # end of line

                # end of program (2 zero-bytes)
                binary_file.write(bytearray([0x0, 0x0]))

        except OSError:
            return (CompileError(filename, "could not write file"), None)

        return None


#############################################################################
# Basic Compiler
#############################################################################

class BasicCompiler:
    """Basic compiler."""

    def __init__(self, options: CompileOptions):
        """Constructor."""

        self.options = options
        self.program = BasicProgram(Constants.BASIC_START_ADDR)
        self.sorted_token_list = None
        self.token_map = None
        self.line_number_map = None
        self.last_line = 0
        self.max_line_number = 0
        self.new_labels = []
        self.labels = {}
        self.modules = None
        self.repeat_pattern = re.compile("(\\d+)\\s(\\w+)")

        if self.options.feature_tsb:
            all_tokens = list(Constants.BASIC_TOKENS.keys()) + list(
                Constants.TSB_TOKENS.keys()
            )
            self.sorted_token_list = sorted(all_tokens, key=lambda x: -len(x))
            self.token_map = {}
            self.token_map.update(Constants.BASIC_TOKENS)
            for k, v in Constants.TSB_TOKENS.items():
                if k in self.token_map:
                    continue
                if v & 0xFF00:
                    v += 0x640000
                else:
                    v += 0x6400
                self.token_map[k] = v
        else:
            self.sorted_token_list = sorted(Constants.BASIC_TOKENS.keys(), key=lambda x: -len(x))
            self.token_map = Constants.BASIC_TOKENS

    def compile(
        self, inputs: "list[str]", output: Optional[str]
    ) -> Optional[CompileError]:
        """Compile basic source and generate encoded output."""

        options = self.options

        # backup initial options (might be changed by preprocessor)
        initial_lower_case_settings = options.lower_case

        # run preprocessing steps
        err = self.preprocessor(inputs)
        if err:
            return err

        # there was a label at the end without following BASIC statement
        need_ending_line = False
        if len(self.new_labels) > 0:
            need_ending_line = True
            for new_label in self.new_labels:
                self.labels[new_label] = self.max_line_number+1
            self.new_labels = []

        # restore initial options
        options.lower_case = initial_lower_case_settings

        # compile all modules
        for module in self.modules:
            err = self.compile_module(module)
            if err:
                return err

        # add REM statement at the end in case there was a label at the end
        if need_ending_line and len(self.modules) > 0:
            (ending_line, err) = self.compile_line(self.modules[-1], "rem", -1)
            if ending_line:
                ending_line.set_source_line("rem")
                ending_line.set_index(-1)
                self.program.add_line(ending_line)

        # resolve program addresses
        self.program.resolve()

        # dump generated code to stdout
        if options.verbosity_level > 0:
            for basic_line in self.program.get_lines():
                print(basic_line.to_string())

        # write PRG file
        err = self.program.write_prg(output)
        if err:
            return err

        # write map file
        if options.map_file:
            err = self.program.write_map(options.map_file)
            if err:
                return err

        return None

    def preprocessor(self, inputs: "list[str]") -> Optional[CompileError]:
        """Preprocess files."""

        self.modules = []
        self.line_number_map = {}
        options = self.options

        self.last_line = 0
        for filename in inputs:
            abs_filename = os.path.abspath(filename)
            module = BasicModule(abs_filename, options)
            err = self.preprocess_module(module)
            if err:
                return err
            self.modules.append(module)
        self.max_line_number = max(self.last_line, self.max_line_number)
        self.last_line = 0

        return None

    def preprocess_module(self, module: BasicModule) -> Optional[CompileError]:
        """Preprocess file."""

        data, err = module.read()
        if err:
            return err

        line_index = -1
        for raw_line in data:
            line = raw_line.strip()
            line_index += 1

            if len(line) < 1:
                # skip empty lines
                continue

            if line.startswith("#") or line.startswith(";"):
                # handle preprocessor line
                err = self.preprocess_line(module, line, line_index, True)
                if err:
                    return err
            else:
                # handle BASIC line
                self.fetch_line_info(module, line, True)

        return None

    def preprocess_line(
        self, module: BasicModule, line: str, line_index: int, preprocess: bool
    ) -> Optional[CompileError]:
        """Handle proprocessor statements."""

        program = self.program
        filename = module.filename
        options = self.options

        directive = CompileHelper.get_next_word(line, 1).lower()

        if directive == "include":
            # handle include statement
            include_file = line[len(directive) + 1 :].strip()
            if include_file.startswith("'"):
                include_file = include_file.strip("'")
            elif include_file.startswith('"'):
                include_file = include_file.strip('"')

            # lookup file using include path
            include_file_abs = self.lookup_file(include_file, os.path.dirname(filename))
            if not include_file_abs:
                return CompileError(
                    filename, f"include file not found '{include_file}'", line_index
                )

            included_module = BasicModule(include_file_abs, options)

            if preprocess:
                # in preprocessing mode
                err = self.preprocess_module(included_module)
                if err:
                    return err
            else:
                # in compilation mode
                program.add_meta(module, f'#include "{included_module.filename}"')
                err = self.compile_module(included_module)
                if err:
                    return err

        elif directive == "upper" or directive == "uppercase" or directive == "cset0":
            # switch compiler text mode to upper case / PETSCII
            options.lower_case = False

        elif directive == "lower" or directive == "lowercase" or directive == "cset1":
            # switch compiler text mode to lower/upper case
            options.lower_case = True

        else:
            # ignore comments or unknown preprocessor statement
            pass

        return None

    def compile_module(self, module: BasicModule) -> Optional[CompileError]:
        """Compile basic file."""
        data = None

        program = self.program

        data, err = module.read()
        if err:
            return err

        line_index = -1
        for raw_line in data:
            line = raw_line.strip()
            line_index += 1

            if len(line) < 1:
                # ignore empty lines
                continue

            if line.startswith("#") or line.startswith(";"):
                # handle preprocessor commands or comments
                err = self.preprocess_line(module, line, line_index, False)
                if err:
                    return err

            else:
                # handle BASIC line
                (basic_line, err) = self.compile_line(module, line, line_index)
                if err:
                    return err

                if basic_line:
                    basic_line.set_source_line(line)
                    basic_line.set_index(line_index)
                    program.add_line(basic_line)

    def compile_line(self, module: BasicModule, line: str, line_index: int):
        """Compile a single basic line of source code."""

        crunch = self.options.crunch
        verbosity_level = self.options.verbosity_level

        # parse line number or label from line
        (line_number, label, ofs) = self.fetch_line_info(module, line, False)
        if ofs is None:
            # just label line, no BASIC code
            return (None, None)

        basic_line = BasicLine(module, line_number)

        last_was_jump = 0x0

        last_was_whitespace = True

        command_token = None

        while ofs < len(line):
            c = line[ofs]
            current_char = c

            token = None
            token_id = None
            token_len = None

            if c == " ":
                # space
                if not basic_line.is_empty() and not last_was_whitespace and not crunch:
                    basic_line.store_char(c)
                ofs += 1

            elif c == "\t":
                # ignore tab outside strings
                ofs += 1

            elif c == ":":
                # handle statement separator ':'
                command_token = None
                last_was_jump = 0x0
                if not crunch or (
                    not basic_line.is_empty() and not basic_line.peek_last_char() == ":"
                ):
                    basic_line.store_char(c)

                ofs += 1

            elif command_token == 0x83 and c in ['-', '+']:
                # handle operator signs in data line
                basic_line.store_char(c)
                ofs += 1

            elif c == '"' or c == "'":
                # handle double quoted strings

                quote_char = c

                # single quote: convert upper/lowercase
                raw_mode = quote_char == "'"
                basic_line.store_char('"')
                ofs += 1

                while ofs < len(line) and line[ofs] != quote_char:
                    if line[ofs] == "{":
                        # handle control mnemonics
                        ofs += 1
                        control = ""
                        while ofs < len(line) and line[ofs] != "}":
                            control += line[ofs]
                            ofs += 1
                        if ofs < len(line) and line[ofs] == "}":
                            ofs += 1
                        if len(control) > 0:
                            repeat = 1

                            # Check if this is a repeating control character
                            # seen in Cmmpute! magazine.  For example:
                            # {23 DOWN}
                            repeating_match = self.repeat_pattern.match(control)
                            if repeating_match:
                                repeat = int(repeating_match.group(1))
                                control = repeating_match.group(2)

                            try:
                                if control.startswith("$"):
                                    control_char = int(control[1:], 16)
                                elif control.startswith("0x"):
                                    control_char = int(control[2:], 16)
                                elif control.startswith("%"):
                                    control_char = int(control[1:], 2)
                                elif control.startswith("0b"):
                                    control_char = int(control[2:], 2)
                                else:
                                    control_char = (
                                        int(control) if control.isdigit() else None
                                    )
                            except ValueError:
                                control_char = None

                            if not control_char:
                                control_char = Constants.CONTROL_TOKENS.get(control.lower())
                                if not control_char:
                                    control_char = 63  # '?' if unknown control sequence

                            for _ in range(repeat):
                                basic_line.store_byte(control_char, f"{{{control_char}}}")

                    else:
                        # store string characters
                        c = line[ofs]
                        if raw_mode:
                            basic_line.store_char_raw(c, line[ofs])
                        else:
                            basic_line.store_char(c, line[ofs])
                        ofs += 1

                if ofs < len(line) and line[ofs] == quote_char:
                    basic_line.store_char('"', line[ofs])
                    ofs += 1

            elif ord(c) > 0xFF:
                # extended UTF-8 char
                basic_line.store_char(c, CompileHelper.get_petscii_char(c))
                ofs += 1

            elif last_was_jump != 0x0 and self.is_label_char(c):
                # handle label after jump
                label = ""
                no_jump_label_after_then = False

                ofs_before_label = ofs # backup position after jump/then token

                while ofs < len(line):
                    if last_was_jump == 0xA7 and self.is_numeric_char(c) and (label.lower() == "goto" or label.lower() == "gosub" or label.lower() == "go"):
                        # handle THEN GOTOn or GOSUBn or GOn without whitespace after GO...
                        break
                    elif last_was_jump == 0xCB and self.is_numeric_char(c) and label.lower() == "to":
                        # handle THEN GO TOn without whitespace after TO
                        break
                    elif self.is_label_char(c) or self.is_numeric_char(c):
                        label += c
                        ofs += 1
                        if ofs < len(line):
                            c = line[ofs]
                    else:
                        ofs_old = ofs # backup position after identifier

                        # look ahead if there is a variable assignment after THEN
                        while ofs < len(line) and c == " ":
                            ofs += 1
                            if ofs < len(line):
                                c = line[ofs]

                        # token ends either with variable type, any bracket (even special)
                        # or assignment operator
                        if c in "=$%([{" :
                            no_jump_label_after_then = True
                            ofs = ofs_old # continue after identifier
                        elif c == '#':
                            # example: 'THEN GET# ...'
                            no_jump_label_after_then = True
                            ofs = ofs_before_label # continue before identifier
                        else:
                            ofs = ofs_old # continue after identifier

                        break

                if last_was_jump == 0xCB and label.lower() == "sub":
                    # turn 'GO SUB' into GOSUB
                    basic_line.store_byte(0x8D, label)
                    last_was_jump = 0x8D
                elif last_was_jump == 0xCB and label.lower() == "to":
                    # handle 'GO TO'
                    basic_line.store_byte(0xA4, label)
                    last_was_jump = 0xA4
                elif last_was_jump == 0xA7 and label.lower() == "goto":
                    # handle 'THEN GOTO'
                    basic_line.store_byte(0x89, label)
                    last_was_jump = 0x89
                elif last_was_jump == 0xA7 and label.lower() == "go":
                    # handle 'THEN GO'
                    basic_line.store_byte(0xCB, label)
                    last_was_jump = 0xCB
                elif last_was_jump == 0xA7 and label.lower() == "gosub":
                    # handle 'THEN GOSUB'
                    basic_line.store_byte(0x8D, label)
                    last_was_jump = 0x8D
                else:

                    if last_was_jump == 0xA7:
                        # handle 'THEN TOKEN' instead of 'THEN label'
                        token, token_id, token_len = self.match_token(label)
                        if token: ofs = ofs_before_label # reset parsing and handling to token start

                    if not token:

                        if no_jump_label_after_then:
                            # store identifier for variable assignment and continue
                            basic_line.store_string(label)
                        else:
                            # get line number from label
                            label_line_number = self.labels.get(label.lower())

                            if label_line_number:
                                basic_line.store_string(str(label_line_number))
                            elif last_was_jump == 0xA7:
                                # if no label was found after THEN, just expect
                                # some token not separated with whitespace
                                last_was_jump = 0x0
                                ofs = ofs_before_label
                            else:
                                return (
                                    None,
                                    CompileError(
                                        module.filename,
                                        f"undefined label '{label}'",
                                        line_index,
                                    ),
                                )

            elif last_was_jump != 0x0 and self.is_numeric_char(c):
                # handle line number after jump
                number = 0

                while ofs < len(line) and self.is_numeric_char(c):
                    number = number * 10 + (ord(c) - 48)
                    ofs += 1
                    if ofs < len(line):
                        c = line[ofs]

                mapped_line_number = self.map_line_number(module, number)

                basic_line.store_string(str(mapped_line_number))

            else:  # scan BASIC token
                token, token_id, token_len = self.peek_token(line, ofs)
                if not token:
                    # no token
                    if c != "," and not self.is_numeric_char(c):
                        last_was_jump = 0x0

                    # make sure code and variable names are using the right case
                    if self.options.lower_case and c >= "A" and c <= "Z":
                        c = c.lower()
                    elif (not self.options.lower_case) and c >= "a" and c <= "z":
                        c = c.upper()

                    basic_line.store_char(c)
                    ofs += 1

            if token:

                if command_token is None: command_token = token_id

                token_skipped = False

                if token_id & 0xFF0000:
                    # 3-byte token (TSB extensions)
                    basic_line.store_byte((token_id & 0xFF0000) >> 16)
                    basic_line.store_byte((token_id & 0xFF00) >> 8)
                    basic_line.store_byte(token_id & 0xFF)
                elif token_id & 0xFF00:
                    if token_id == 0x6428:
                        # special case 'AT(' because bracket needs to follow,
                        # but BASIC interpreter generates one automatically
                        basic_line.store_byte(0x64)
                    else:
                        # map extension tokens: (3c->b3, 3d->b2, 3e->b1)
                        if token_id >= 0x643c and token_id <= 0x643e:
                            token_id = token_id ^ 0x8f

                        # 2-byte token (SB/TSB)
                        basic_line.store_word_be(token_id)
                else:
                    # 1-byte token (BASIC V2 originals)
                    if not crunch or token_id != 0x8F:  # ignore REM when crunching
                        basic_line.store_byte(token_id)
                    else:
                        token_skipped = True

                # GOTO or GOSUB ? ('GOTO', 'GOSUB', 'GO', 'THEN')
                last_was_jump = token_id if token_id in [0x89, 0x8D, 0xCB, 0xA7] else 0x0

                ofs += token_len
                if not token_skipped:
                    if verbosity_level >= 2:
                        basic_line.add_verbose(f"{{${token_id:x}:{token}}}")
                    else:
                        basic_line.add_verbose(token)

                # REM ?
                if token_id == 0x8F:
                    # after REM, consume all characters until eol
                    while ofs < len(line):
                        if not crunch:
                            c = line[ofs]
                            if c != "\t":
                                basic_line.store_char(line[ofs])
                        ofs += 1



            last_was_whitespace = current_char == " "

        while basic_line.peek_last_char() == ":":
            basic_line.drop_last_char()

        if crunch and basic_line.is_empty():
            # to be done: re-number in case crunching eliminated referenced lines
            basic_line.store_byte(0x8F, "REM")

        return (basic_line, None)

    def fetch_line_info(self, _module_: BasicModule, line: str, preprocess: bool):
        """Fetch line number from basic line"""

        line_number = 0
        label = None
        ofs = 0

        crunch = self.options.crunch
        verbosity_level = self.options.verbosity_level

        result = re.match(r"\d+", line)
        if result:
            # found regular line number
            line_number = int(result[0])

            if crunch:
                # overwrite line number

                if preprocess:
                    mapped_line_number = self.last_line + 1
                    self.line_number_map[line_number] = mapped_line_number
                    line_number = mapped_line_number
                else:
                    mapped_line_number = self.line_number_map[line_number]
                    if mapped_line_number is None:
                        mapped_line_number = self.last_line + 1
                    line_number = mapped_line_number

            ofs = len(result[0])
        else:
            # check if 'label:' was given
            result = re.match(r"[a-zA-Z_][a-zA-Z0-9_]+(?=:)", line)
            if result:
                # found label
                if not self.is_token(result[0]):
                    label = result[0]
                    if preprocess:
                        self.new_labels.append(label.lower())
                    ofs = len(result[0]) + 1
                    if ofs >= len(line):
                        if verbosity_level > 0 and preprocess:
                            print(f"{label}:")
                        return (0, None, None)  # just label line, no BASIC code

            # auto-generate next line number
            line_number = self.last_line + 1

        if preprocess:
            for new_label in self.new_labels:
                self.labels[new_label] = line_number
            self.new_labels = []

        self.last_line = line_number

        return (line_number, label, ofs)

    def map_line_number(self, _module_: BasicModule, number: int) -> int:
        """ "Map line number to crunched line number."""

        crunch = self.options.crunch
        if not crunch:
            return number

        mapped_number = self.line_number_map.get(number)
        if mapped_number is None:
            return number

        return mapped_number

    def lookup_file(self, filename: str, parent_path: str) -> str:
        """Lookup filename in path."""

        if os.path.isabs(filename) and os.path.exists(filename):
            return os.path.normpath(filename)

        f = os.path.abspath(filename)
        if os.path.exists(f):
            return f

        f = os.path.abspath(os.path.join(parent_path, filename))
        if os.path.exists(f):
            return f

        f = os.path.abspath(os.path.join(os.getcwd(), filename))
        if os.path.exists(f):
            return f

        for path_entry in self.options.include_path:
            f = os.path.abspath(os.path.join(path_entry, filename))
            if os.path.exists(f):
                return f

        return None

    def is_token(self, text):
        """Check if text is a token."""
        token, _, _ = self.match_token(text)
        return token is not None

    def match_token(self, text):
        """Get token info for text."""

        if text == "?":
            return ("?", 0x99, 1)

        uppercase_text = text.upper()

        for k in self.sorted_token_list:
            if len(k) >= 2:
                abbrev = ""
                if k in ["gosub", "left", "step", "str", "restore", "return", "close"]:
                    abbrev = k[0].lower() + k[1].lower + k[2].upper()
                else:
                    abbrev = k[0].lower() + k[1].upper()
                if text == abbrev:
                    return (k, Constants.BASIC_TOKENS[k], len(abbrev))
            if uppercase_text == k:
                return (k, self.token_map[k], len(k))

        return None, None, 0

    def peek_token(self, text, ofs):
        """Look at the next token."""

        uppercase_text = text.upper()

        if text[ofs] == "?":
            return ("?", 0x99, 1)

        for k in self.sorted_token_list:
            if len(k) >= 2:
                abbrev = ""
                if k in ["gosub", "left", "step", "str", "restore", "return", "close"]:
                    abbrev = k[0].lower() + k[1].lower + k[2].upper()
                else:
                    abbrev = k[0].lower() + k[1].upper()
                if text.startswith(abbrev, ofs):
                    return (k, Constants.BASIC_TOKENS[k], len(abbrev))
            if uppercase_text.startswith(k, ofs):
                return (k, self.token_map[k], len(k))

        return None, None, 0

    def is_label_char(self, c: str):
        """Check if char is a label char."""
        return (c >= "A" and c <= "Z") or (c >= "a" and c <= "z") or c == "_"

    def is_numeric_char(self, c: str):
        """Check if char is numeric."""
        return c >= "0" and c <= "9"
