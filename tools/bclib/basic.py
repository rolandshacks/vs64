"""Basic."""

import os
import re

from typing import Optional

from .constants import Constants

class CompileError:
    """Compile errors."""

    def __init__(
        self,
        filename: str,
        error: str,
        line: Optional[int] = None,
        column: Optional[int] = None,
    ):
        self.filename = filename
        self.error = error
        self.line = line
        self.column = column

    def to_string(self):
        """Get string representation for error."""
        s = ""
        if self.filename:
            s = f"{self.filename}"
            if self.line is not None:
                s += f"({self.line+1}"
                if self.column is not None:
                    s += f",{self.column}"
                s += ")"
            s += ": "
        s += f"error: {self.error}"
        return s


def get_petscii(c):
    """Convert char to PETSCII."""
    if c == "^" or ord(c) == 8593:
        return 30
    if ord(c) > 0xFF:
        return 0
    if c == "[":
        return 0x5B
    if c == "]":
        return 0x5D
    if ord(c) == 0xC2A3:
        return 0x5C  # pound char

    return ord(c)


def get_petscii_char(c):
    """Convert char to PETSCII."""
    if ord(c) == 8593:
        return "^"
    if ord(c) == 0xC2A3:
        return c
    if ord(c) > 0xFF:
        return ""
    return c


class BinaryBuffer:
    """Binary buffer."""

    def __init__(self):
        self.buffer = bytearray()
        self.offset = 0

    def length(self):
        """Get buffer length."""
        return len(self.buffer)

    def get_buffer(self):
        """Get buffer."""
        return self.buffer

    def reset(self):
        """Reset buffer and position."""
        self.buffer = bytearray()
        self.offset = 0

    def seek(self, offset):
        """Set offset."""
        self.offset = offset

    def getpos(self):
        """Get current offset."""
        return self.offset

    def store_byte(self, value):
        """Store byte to buffer."""
        self.buffer.append(value)
        self.offset += 1

    def store_char(self, c):
        """Store byte to buffer."""
        self.buffer.append(get_petscii(c))
        self.offset += 1

    def store_word(self, value):
        """Store word to buffer."""
        self.buffer.append(value & 0xFF)
        self.buffer.append((value & 0xFF00) >> 8)
        self.offset += 2

    def store_word_be(self, value):
        """Store word to buffer."""
        self.buffer.append((value & 0xFF00) >> 8)
        self.buffer.append(value & 0xFF)
        self.offset += 2

    def store_buffer(self, buffer):
        """Append buffer to buffer."""
        buffer_bytes = buffer.get_buffer()
        self.buffer.extend(buffer_bytes)
        self.offset += len(buffer_bytes)

    def store_string(self, s):
        """Store string bytes to buffer."""
        for c in s:
            self.store_char(c)

    def read_byte(self):
        """Read byte from buffer."""
        value = self.buffer[self.offset]
        self.offset += 1
        return value

    def read_word(self):
        """Read word from buffer."""
        value = self.buffer[self.offset] + (self.buffer[self.offset + 1] << 8)
        self.offset += 2
        return value

    def read_word_be(self):
        """Read word from buffer."""
        value = self.buffer[self.offset + 1] + (self.buffer[self.offset] << 8)
        self.offset += 2
        return value


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
# Basic Compiler
#############################################################################


class BasicCompiler:
    """Resource compiler."""

    def __init__(self):
        """Constructor."""
        self.verbose = False
        self.disable_extensions = False
        self.source_map = SourceMap()
        self.basic_program_address = Constants.BASIC_START_ADDR
        self.load_address = self.basic_program_address
        self.tokens = sorted(Constants.BASIC_TOKENS, key=lambda x: -len(x))
        self.tsb_tokens = sorted(Constants.TSB_TOKENS, key=lambda x: -len(x))
        self.last_line = 0
        self.new_labels = []
        self.include_path = []
        self.labels = {}

    def unpack(
        self,
        inputs: "list[str]",
        output: Optional[str],
        verbose: Optional[bool],
        disable_extensions: Optional[bool]
    ) -> Optional[CompileError]:
        self.verbose = verbose
        self.disable_extensions = disable_extensions

        output_buffer = ""

        for filename in inputs:
            abs_filename = os.path.abspath(filename)
            err, data = self.unpack_file(abs_filename)
            if err: return err
            if data: output_buffer += data

        self.write_textfile(output, output_buffer)

        return None

    def unpack_file(self, filename: str) -> (Optional[CompileError], str):

        tokens = []

        for k, v in Constants.BASIC_TOKENS.items():
            idx = (v - 0x80)
            while len(tokens) < idx:
                tokens.append("")
            tokens.append(k)

        tcb_tokens = []

        for k, v in Constants.TSB_TOKENS.items():
            idx = (v - 1)
            while len(tcb_tokens) < idx:
                tcb_tokens.append("")
            tcb_tokens.append(k)

        output_buffer = ""

        data = None

        try:
            with open(filename, "rb") as in_file:
                data = in_file.read()
        except OSError:
            return (CompileError(filename, "could not read file"), None)

        data_size = len(data)
        if data_size < 2: return (CompileError(filename, "invalid file"), None)

        ofs = 0
        count = data_size
        #prg_address = data[ofs] + (data[ofs+1]<<8)
        ofs += 2
        count -= 2

        while count > 0:

            if count < 2: break
            #next_line_addr = data[ofs] + (data[ofs+1]<<8)
            ofs += 2
            count -= 2

            if count < 2: break
            line_number = data[ofs] + (data[ofs+1]<<8)
            output_buffer += f"{line_number} "
            ofs += 2
            count -= 2

            while count > 0:
                b = data[ofs]&0xff
                ofs += 1
                count -= 1

                if b >= 0x80:
                    token = tokens[b-0x80]
                    output_buffer += token
                    if b == 0x8F: # REM
                        while count and (data[ofs]&0xff) != 0:
                            output_buffer += chr(data[ofs])
                            ofs += 1
                            count -= 1

                elif b == 0x64:
                    if count < 1: break
                    b2 = data[ofs]&0xff
                    ofs += 1
                    count -= 1
                    token = tcb_tokens[b2-1]
                    output_buffer += token

                elif b == 34: # '"'
                    output_buffer += chr(b)
                    while count > 0 and (data[ofs]&0xff) != 34:
                        output_buffer += chr(data[ofs])
                        ofs += 1
                        count -= 1
                    if count > 0 and (data[ofs]&0xff) == 34:
                        output_buffer += chr(data[ofs])
                        ofs += 1
                        count -= 1

                elif b == 0: # end of line
                    output_buffer += "\n"
                    break

                else:
                    output_buffer += chr(b)

        return (None, output_buffer)

    def compile(
        self,
        inputs: "list[str]",
        output: Optional[str],
        map_file: Optional[str],
        include_path: [str],
        verbose: Optional[bool],
        disable_extensions: Optional[bool]
    ) -> Optional[CompileError]:
        """Compile basic source and generate encoded output."""

        self.verbose = verbose
        self.disable_extensions = disable_extensions
        self.include_path = include_path

        err = self.preprocessor(inputs)
        if err:
            return err

        output_buffer = BinaryBuffer()
        output_buffer.store_word(self.load_address)  # specify prg load address

        for filename in inputs:
            abs_filename = os.path.abspath(filename)
            err = self.compile_file(abs_filename, output_buffer)
            if err:
                return err

        output_buffer.store_word(0x0)  # end of program (2 zero-bytes)

        self.write(output, output_buffer.get_buffer())

        if map_file and self.source_map:
            s = self.source_map.get_string()
            self.makedirs(map_file)
            with open(map_file, "w", encoding="utf-8") as text_file:
                text_file.write(s)

        return None

    def preprocessor(self, inputs: "list[str]") -> Optional[CompileError]:
        """Preprocess files."""
        self.last_line = 0
        for filename in inputs:
            abs_filename = os.path.abspath(filename)
            err = self.preprocess_file(abs_filename)
            if err:
                return err
        self.last_line = 0

        return None

    def preprocess_file(self, filename: str) -> Optional[CompileError]:
        """Preprocess file."""
        data = None

        try:
            with open(filename, "r", encoding="utf-8") as in_file:
                data = in_file.readlines()
        except OSError:
            return CompileError(filename, "could not read file")

        line_index = -1
        for raw_line in data:
            line = raw_line.strip()
            line_index += 1

            if len(line) < 1:
                continue

            if line.startswith("#"):
                err = self.preprocess_line(filename, line, None, line_index)
                if err:
                    return err
                continue

            self.fetch_line_info(line, True)

        return None

    def preprocess_line(
        self,
        filename: str,
        line: str,
        output_buffer: Optional[BinaryBuffer],
        line_index: int,
    ) -> Optional[CompileError]:
        """Handle proprocessor statements."""

        if not line.startswith("#include"):
            return None

        # handle include statement

        include_file = line[8:].strip()
        if include_file.startswith("'"):
            include_file = include_file.strip("'")
        elif include_file.startswith('"'):
            include_file = include_file.strip('"')

        include_file_abs = self.lookup_file(include_file, os.path.dirname(filename))
        if not include_file_abs:
            return CompileError(
                filename, f"include file not found '{include_file}'", line_index
            )

        err = None

        if output_buffer:
            if self.verbose:
                print(f'#include ("{include_file_abs}")')
            err = self.compile_file(include_file_abs, output_buffer)
            self.source_map.add_file(filename)
        else:
            err = self.preprocess_file(include_file_abs)

        return err

    def compile_file(
        self, filename: str, output_buffer: BinaryBuffer
    ) -> Optional[CompileError]:
        """Compile basic file."""
        data = None

        self.source_map.add_file(filename)

        try:
            with open(filename, "r", encoding="utf-8") as in_file:
                data = in_file.readlines()
        except OSError:
            return CompileError(filename, "could not read file")

        line_index = -1
        for raw_line in data:
            line = raw_line.strip()
            line_index += 1

            if len(line) < 1:
                continue

            if line.startswith("#"):
                err = self.preprocess_line(filename, line, output_buffer, line_index)
                if err:
                    return err
                continue

            (line_number, compiled_line, err) = self.compile_line(
                filename, line, line_index
            )
            if err:
                return err
            if not compiled_line:
                continue

            line_start_addr = self.basic_program_address + output_buffer.getpos() - 2
            line_end_addr = line_start_addr + compiled_line.length() + 1
            self.source_map.add(
                line_start_addr,
                line_end_addr,
                line_number,
                line_index,
                len(raw_line.rstrip()),
            )

            next_line_addr = (
                self.basic_program_address + output_buffer.getpos() + compiled_line.length()
            )
            output_buffer.store_word(next_line_addr)
            output_buffer.store_buffer(compiled_line)

    def compile_line(self, filename: str, line: str, line_index: int):
        """Compile a single basic line of source code."""

        verbose = self.verbose
        verbose_line = ""

        (line_number, label, ofs) = self.fetch_line_info(line, False)
        if ofs is None:
            return (line_number, None, None)

        if label and verbose:
            verbose_line += label + ":"
        if verbose:
            verbose_line += str(line_number) + " "

        line_buffer = BinaryBuffer()
        line_buffer.store_word(line_number)

        last_was_jump = 0x0

        last_was_whitespace = True

        while ofs < len(line):

            c = line[ofs]
            current_char = c

            if c == " ":
                if not last_was_whitespace:
                    line_buffer.store_char(c)
                    if verbose:
                        verbose_line += "_" if Constants.DEBUG_MODE else c
                ofs += 1

            elif c == "\t":  # ignore tab outside strings
                ofs += 1

            elif c == '"': # handle double quoted strings

                line_buffer.store_char(c)
                if verbose: verbose_line += c
                ofs += 1

                while ofs < len(line) and line[ofs] != '"':
                    if line[ofs] == "{": # handle control mnemonics
                        ofs += 1
                        control = ""
                        while ofs < len(line) and line[ofs] != "}":
                            control += line[ofs]
                            ofs += 1
                        if ofs < len(line) and line[ofs] == "}":
                            ofs += 1
                        if len(control) > 0:
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
                                        int(control)
                                        if control.isdigit()
                                        else None
                                    )
                            except ValueError:
                                control_char = None

                            if not control_char:
                                control_char = Constants.CONTROL_TOKENS.get(
                                    control.lower()
                                )
                                if not control_char:
                                    control_char = (
                                        63  # '?' if unknown control sequence
                                    )

                            line_buffer.store_string(chr(control_char))
                            if verbose:
                                verbose_line += f"{{{control_char}}}"
                    else:
                        line_buffer.store_char(line[ofs])
                        if verbose:
                            verbose_line += line[ofs]
                        ofs += 1

                if ofs < len(line) and line[ofs] == '"':
                    line_buffer.store_char(line[ofs])
                    if verbose:
                        verbose_line += line[ofs]
                    ofs += 1

            elif ord(c) > 0xFF: # extended UTF-8 char
                line_buffer.store_char(c)
                if verbose:
                    verbose_line += get_petscii_char(c)
                ofs += 1

            elif last_was_jump != 0x0 and self.is_label_char(c): # handle label after jump
                label = ""
                while ofs < len(line) and (self.is_label_char(c) or self.is_numeric_char(c)):
                    label += c
                    ofs += 1
                    if ofs < len(line):
                        c = line[ofs]

                if last_was_jump == 0xCB and label.lower() == "sub":
                    # turn into gosub
                    if verbose:
                        verbose_line += label
                    line_buffer.store_byte(0x8D)
                    last_was_jump = 0x8D
                else:
                    label_line_number = self.labels.get(label.lower())

                    if label_line_number:
                        line_buffer.store_string(str(label_line_number))
                        if verbose:
                            verbose_line += str(label_line_number)
                    else:
                        return (
                            0,
                            None,
                            CompileError(
                                filename, f"undefined label '{label}'", line_index
                            ),
                        )

            else: # scan BASIC token
                token, token_id, token_len = self.peek_token(line, ofs)
                if token:
                    if token_id & 0xff0000:
                        # 3-byte token (TSB extensions)
                        line_buffer.store_byte((token_id&0xff0000)>>16)
                        line_buffer.store_byte((token_id&0xff00)>>8)
                        line_buffer.store_byte(token_id&0xff)
                    elif token_id & 0xff00:
                        # 2-byte token (SB/TSB)
                        line_buffer.store_word_be(token_id)
                    else:
                        # 1-byte token (BASIC V2 originals)
                        line_buffer.store_byte(token_id)

                    # GOTO or GOSUB ?
                    last_was_jump = token_id if token_id in [0x89, 0x8D, 0xCB] else 0x0

                    ofs += token_len
                    if verbose:
                        if Constants.DEBUG_MODE:
                            verbose_line += f"{{${token_id:x}:{token}}}"
                        else:
                            verbose_line += token

                    # REM ?
                    if token_id == 0x8F:  # REM
                        while ofs < len(line):
                            c = line[ofs]
                            if c != "\t":
                                line_buffer.store_char(line[ofs])
                                if verbose:
                                    verbose_line += line[ofs]
                            ofs += 1

                else:
                    # no token
                    if c != "," and not self.is_numeric_char(c): last_was_jump = 0x0
                    if c >= 'a' and c <= 'z': c = c.upper()
                    line_buffer.store_char(c)
                    if verbose:
                        verbose_line += c
                    ofs += 1

            last_was_whitespace = (current_char == ' ')

        line_buffer.store_byte(0)  # end of line
        if verbose:
            print(f"{verbose_line}")
        return (line_number, line_buffer, None)

    def fetch_line_info(self, line: str, scan_labels: bool):
        """Fetch line number from basic line"""

        line_number = 0
        label = None
        ofs = 0

        result = re.match(r"\d+", line)
        if result:
            line_number = int(result[0])
            ofs = len(result[0])
        else:
            result = re.match(r"[a-zA-Z_][a-zA-Z0-9_]+(?=:)", line)
            if result:
                label = result[0]
                if scan_labels:
                    self.new_labels.append(label.lower())
                ofs = len(result[0]) + 1
                if ofs >= len(line):
                    if self.verbose:
                        print(f"{label}:")
                    return (0, None, None)  # just label line, no BASIC code

            line_number = self.last_line + 1

        if scan_labels:
            for new_label in self.new_labels:
                self.labels[new_label] = line_number
            self.new_labels = []

        self.last_line = line_number

        return (line_number, label, ofs)

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

        for path_entry in self.include_path:
            f = os.path.abspath(os.path.join(path_entry, filename))
            if os.path.exists(f):
                return f

        return None

    def makedirs(self, filename):
        """Ensure output folder exists."""
        try:
            os.makedirs(os.path.dirname(filename))
        except FileExistsError:
            pass

    def write(self, filename: Optional[str], content: bytes):
        """Write generated output to file or console."""

        if not filename:
            print(content)
            return

        self.makedirs(filename)

        with open(filename, "wb") as binary_file:
            binary_file.write(content)

    def write_textfile(self, filename: Optional[str], content: str):
        """Write generated output to file or console."""

        if not filename:
            print(content)
            return

        self.makedirs(filename)

        with open(filename, "w", encoding="utf-8") as text_file:
            text_file.write(content)

    def peek_token(self, text, ofs):
        """Look at the next token."""
        uppercase_text = text.upper()

        if text[ofs] == '?':
            return ('?', 0x99, 1)

        for k in self.tokens:
            if len(k) >= 2:
                abbrev = ""
                if k in ["gosub", "left", "step", "str", "restore", "return", "close"]:
                    abbrev = k[0].lower() + k[1].lower + k[2].upper()
                else:
                    abbrev = k[0].lower() + k[1].upper()
                if text.startswith(abbrev, ofs):
                    return (k, Constants.BASIC_TOKENS[k], len(abbrev))
            if uppercase_text.startswith(k, ofs):
                return (k, Constants.BASIC_TOKENS[k], len(k))

        if self.disable_extensions:
            return None, None, 0

        for k in self.tsb_tokens:
            # abbreviations not supported, yet (TODO)
            if uppercase_text.startswith(k, ofs):
                # multi-byte tokens, first byte is always 0x64
                # bytes: 0x64,xx OR 0x64,xx,yy
                token = Constants.TSB_TOKENS[k]
                if token & 0xff00: token += 0x640000
                else: token += 0x6400
                return (k, token, len(k))

        return None, None, 0

    def is_label_char(self, c: str):
        """Check if char is a label char."""
        return (c >= "A" and c <= "Z") or (c >= "a" and c <= "z") or c == "_"

    def is_numeric_char(self, c: str):
        """Check if char is numeric."""
        return c >= "0" and c <= "9"
