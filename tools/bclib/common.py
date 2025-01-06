"""Common helpers."""

import os

from typing import Optional

#############################################################################
# Compile Error
#############################################################################


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


#############################################################################
# Compile Helper
#############################################################################

class CompileHelper:
    """Compiler helper functions."""

    @staticmethod
    def get_petscii(c, lower_case: bool = False, raw_string: bool = False):
        """Convert char to PETSCII."""

        p = ord(c)

        if (not raw_string) and lower_case and p >= 65 and p <= 90:
            # convert [A-Z] to upper/lower case charset
            p += 32
        elif (not raw_string) and p >= 97 and p <= 122:
            # convert [a-z] to and from upper/lower case charset
            p -= 32
        elif c == "^" or p == 8593:
            p = 30
        elif ord(c) > 0xFF:
            p = 0
        elif c == "[":
            p = 0x5B
        elif c == "]":
            p = 0x5D
        elif p == 0xC2A3:
            p = 0x5C  # pound char

        return p

    @staticmethod
    def get_petscii_char(c):
        """Convert char to PETSCII."""
        if ord(c) == 8593:
            return "^"
        if ord(c) == 0xC2A3:
            return c
        if ord(c) > 0xFF:
            return ""
        return c

    @staticmethod
    def makedirs(filename):
        """Ensure output folder exists."""
        try:
            os.makedirs(os.path.dirname(filename))
        except FileExistsError:
            pass

    @staticmethod
    def write_textfile(filename: Optional[str], content: str) -> Optional[CompileError]:
        """Write generated output to file or console."""

        if not filename:
            print(content)
            return

        CompileHelper.makedirs(filename)

        try:
            with open(filename, "w", encoding="utf-8") as text_file:
                text_file.write(content)
        except OSError:
            return (CompileError(filename, "could not write file"), None)

        return None

    @staticmethod
    def get_next_word(s: str, offset: int = 0) -> str:
        """Fetch next word from string."""
        if not s:
            return s
        length = len(s)

        while offset < length:
            # skip whitespaces and control chars
            c = s[offset]
            char_code = ord(c)
            if char_code > 32:
                break
            offset += 1

        word = ""
        while offset < length:
            # fetch word characters ([a-zA-Z0-9_])
            c = s[offset]
            char_code = ord(c)
            if ((char_code >= 65 and char_code <= 90) or
                (char_code >= 97 and char_code <= 122) or
                (char_code >= 48 and char_code <= 57) or
                (char_code == 95)
            ):
                word += c
            else:
                break
            offset += 1
        return word


#############################################################################
# Compile Options
#############################################################################


class CompileOptions:
    """Compile options."""

    def __init__(self):
        self.verbosity_level = 0
        self.feature_tsb = False
        self.include_path = []
        self.map_file = None
        self.crunch = False
        self.pretty = False
        self.lower_case = False

    def set_map_file(self, map_file):
        """Set map filename."""
        self.map_file = map_file

    def append_include_path(self, include_path):
        """Add include path."""
        self.include_path.append(include_path)

    def set_enable_tsb(self):
        """Disable BASIC extensions."""
        self.feature_tsb = True

    def set_verbosity_level(self, level):
        """Enable verbose outputs."""
        self.verbosity_level = level

    def set_lower_case(self):
        """Set lower case mode."""
        self.lower_case = True

    def set_crunch(self):
        """Enable crunching of BASIC lines."""
        self.crunch = True

    def set_pretty(self):
        """Enable formatting of de-compiled BASIC code."""
        self.pretty = True


#############################################################################
# Compile Buffer
#############################################################################


class CompileBuffer:
    """Compiler buffer."""

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

    def store_char(self, c, lower_case: bool = False):
        """Store char to buffer."""
        self.buffer.append(CompileHelper.get_petscii(c, lower_case))
        self.offset += 1

    def store_char_raw(self, c, lower_case: bool = False):
        """Store char to buffer."""
        self.buffer.append(CompileHelper.get_petscii(c, lower_case, True))
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

    def store_string(self, s, lower_case: bool = False):
        """Store string bytes to buffer."""
        for c in s:
            self.store_char(c, lower_case)

    def peek_last_byte(self):
        """Look at last byte."""
        if len(self.buffer) < 1:
            return 0
        return self.buffer[-1]

    def peek_last_char(self):
        """Look at last char."""
        if len(self.buffer) < 1:
            return "\0"
        b = self.buffer[-1]
        if b < 1 or b > 255:
            return "\0"
        return chr(b)

    def drop_last_char(self):
        """Drop last char."""
        if len(self.buffer) < 1:
            return
        del self.buffer[-1]
        if self.offset > len(self.buffer):
            self.offset = len(self.buffer)

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
