"""Common helpers."""

import os
import re

from typing import Optional

from .constants import Constants

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

    @staticmethod
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

#############################################################################
# Compile Options
#############################################################################

class CompileOptions:
    """Compile options."""

    def __init__(self):
        self.verbose = False
        self.disable_extensions = False
        self.include_path = []
        self.map_file = None
        self.crunch = False
        self.pretty = False

    def set_map_file(self, map_file):
        """Set map filename."""
        self.map_file = map_file

    def append_include_path(self, include_path):
        """Add include path."""
        self.include_path.append(include_path)

    def set_disable_extensions(self):
        """Disable BASIC extensions."""
        self.disable_extensions = True

    def set_verbose(self):
        """Enable verbose outputs."""
        self.verbose = True

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

    def store_char(self, c):
        """Store char to buffer."""
        self.buffer.append(CompileHelper.get_petscii(c))
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

    def peek_last_byte(self):
        """Look at last byte."""
        if len(self.buffer) < 1: return 0
        return self.buffer[-1]

    def peek_last_char(self):
        """Look at last char."""
        if len(self.buffer) < 1: return '\0'
        b = self.buffer[-1]
        if b < 1 or b > 255: return '\0'
        return chr(b)
    
    def drop_last_char(self):
        """Drop last char."""
        if len(self.buffer) < 1: return
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
