"""Formatter."""

from enum import Enum
from typing import Optional

from .constants import Constants

#############################################################################
# Formatter Types
#############################################################################

class OutputFormat(Enum):
    """Output format identifiers."""

    NONE = 0
    CPP = 1
    C = 2
    ASM = 3
    BASIC = 4

class OutputFormatVariant(Enum):
    """Output format variant identifiers."""

    NONE = 0
    ACME = 1
    KICK = 2

#############################################################################
# Output Formatters
#############################################################################

class BaseFormatter:
    """Base formatter."""

    def __init__(self, format_variant):
        self.format = OutputFormat.NONE
        self.format_variant = format_variant
        self.comment_begin: str = ''
        self.comment_end: str = ''
        self.commentline_char: str = '*'
        self.hex_prefix: str = '0x'
        self.byte_prefix: str = '0x'
        self.binary_prefix: str = '0b'
        self.bytearray_begin: str = '{0}[1] = {{\n'
        self.bytearray_linebegin: str = '  '
        self.bytearray_singlelinemode: bool = False
        self.bytearray_end: str = '}};\n'
        self.bytearray_size: str = '{0}_size = {1};\n'
        self.constant_value: str = '{0} {1};\n'
        self.label_fmt = '{0}'
        self.type_name_byte = ''
        self.type_name_word = ''
        self.max_line_length = Constants.MAX_LINE_LENGTH
        self.output_meta_info = True
        self.clang_format_pragma = False
        self.uppercase = False

    def begin_namespace(self, _name_: str):
        """Return namespace opening."""
        return ""

    def end_namespace(self, _name_: str):
        """Return namespace closing."""
        return ""

    def comment(self, comment: str):
        """Create comment."""
        s = ""
        s += self.comment_begin
        if len(s) > 0 and len(comment) > 0:
            s += " "
        s += comment if not self.uppercase else comment.upper()
        if len(comment) > 0 and len(self.comment_end) > 0: s += " "
        s += self.comment_end
        return s

    def label(self, label: str):
        """Create label."""
        return self.label_fmt.format(label)

    def comment_line(self):
        """Create comment line."""
        rep = self.max_line_length - (len(self.comment_begin) + len(self.comment_end))
        return self.comment_begin + (self.commentline_char * rep) + self.comment_end

    def format_byte(self, value: int):
        """Format integer value as hex string."""
        return self.byte_prefix + Constants.HEXCHARS[int(value/16)] + Constants.HEXCHARS[int(value%16)]

    def format_binary(self, value: int):
        """Format integer value as binary string."""
        return self.binary_prefix + f"{value:08b}"

    def format_hexnumber(self, value: int, digits: int = 4):
        return self.hex_prefix + (f"{value:02x}" if digits == 2 else f"{value:04x}")

    def format_binary_str(self, value: int, step_size: Optional[int], scale: Optional[int]):
        """Format integer value as character token."""
        s = ""
        if not step_size or step_size > 2:
            step_size = 1

        item0 = '.' if not scale else '.' + ('.'*scale) + '.'
        item1 = 'X' if not scale else '[' + ('X'*scale) + ']'
        item2 = 'A' if not scale else '[' + ('A'*scale) + ']'
        item3 = 'B' if not scale else '[' + ('B'*scale) + ']'

        i = 0
        while i < 8:
            if step_size == 1:
                if value & (1<<(7-i)):
                    s += item1
                else:
                    s += item0

            elif step_size == 2:
                j = 0
                if value & (1<<(7-i)): j += 1
                if value & (1<<(6-i)): j += 2

                if j == 1: s += item1
                elif j == 2: s += item2
                elif j == 3: s += item3
                else: s += item0

            i += step_size

        return s

    def byte_array(self, name: str, data, ofs: Optional[int]=None, sz: Optional[int]=None,
                   bitmask: Optional[int]=None, bitscale: Optional[int]=None,
                   elements_per_line: Optional[int]=None):
        """Format named byte array as hex value block."""

        data_len = sz if sz else len(data)

        s = ""
        s += self.bytearray_begin.format(name, data_len)
        s += self.binary(data, ofs, data_len, bitmask, bitscale, elements_per_line)
        s += self.bytearray_end.format(name, data_len)
        s += '\n'
        s += self.byte_array_size(name, data_len)
        return s

    def byte_array_size(self, name: str, sz: int):
        """Format byte array size info."""
        s = self.bytearray_size.format(name, sz)
        return s

    def constant(self, name: str, data: int, format_code: str):
        """Output constant declaration."""

        if not format_code:
            s = self.constant_value.format(name, data, self.type_name_byte)
        else:
            if format_code == 'i16' or format_code == 'x16':
                value_type = self.type_name_word
            else:
                value_type = self.type_name_byte

            prefix = self.byte_prefix

            if format_code == 'x8':
                value = f"{prefix}{data:02x}"
            elif format_code == 'x16':
                value = f"{prefix}{data:04x}"
            else:
                value = data

            s = self.constant_value.format(name, value, value_type)

        return s

    def binary(self, data, ofs: Optional[int]=None, sz: Optional[int]=None,
               bitmask: Optional[int]=None, bitscale: Optional[int]=None, elements_per_line: Optional[int]=None,
               continued: Optional[bool]=False):
        """Format byte array as hex value block."""

        if not ofs: ofs = 0
        if not sz: sz = len(data) - ofs
        end = ofs + sz

        s = ""
        line = ""
        comment_line = ""
        element_count = 0
        for pos in range(ofs, end):
            byte_value = data[pos]

            element = self.format_byte(byte_value) if not bitmask else self.format_binary(byte_value)

            linebreak = False

            if (elements_per_line and element_count >= elements_per_line) or \
                (len(self.bytearray_linebegin) + len(line) + len(element) > self.max_line_length - 2):
                linebreak = True

            if not linebreak or not self.bytearray_singlelinemode:
                if pos > ofs:
                    line += ","

            if linebreak:
                s += self.bytearray_linebegin + line
                if len(comment_line) > 0: s += "    " + self.comment(comment_line)
                s += '\n'
                line = ""
                comment_line = ""
                element_count = 0

            line += element
            if bitmask: comment_line += self.format_binary_str(byte_value, bitmask, bitscale)
            element_count += 1

        if len(line) > 0:
            s += self.bytearray_linebegin + line
            if continued and not self.bytearray_singlelinemode: s += ','
            s += "\n"

        return s

class CppFormatter(BaseFormatter):
    """C++ formatter."""

    def __init__(self, format_variant):
        super().__init__(format_variant)
        self.format = OutputFormat.CPP
        self.comment_begin = '//'
        self.commentline_char = '/'
        self.bytearray_begin = 'extern const unsigned char {0}[] = {{\n'
        self.bytearray_end = '}}; // {0}\n'
        self.bytearray_size = 'extern const unsigned short {0}_size = {1};\n'
        self.constant_value = 'extern const {2} {0} = {1};\n'
        self.type_name_byte = 'unsigned char'
        self.type_name_word = 'unsigned short'
        self.clang_format_pragma = True

class CFormatter(BaseFormatter):
    """C formatter."""

    def __init__(self, format_variant):
        super().__init__(format_variant)
        self.format = OutputFormat.C
        self.comment_begin = '//'
        self.commentline_char = '/'
        self.bytearray_begin = 'unsigned char {0}[{1}] = {{\n'
        self.bytearray_end = '}}; // {0}\n'
        self.bytearray_size = 'const unsigned short {0}_size = {1};\n'
        self.constant_value = 'const {2} {0} = {1};\n'
        self.type_name_byte = 'unsigned char'
        self.type_name_word = 'unsigned short'
        self.clang_format_pragma = True

class AsmFormatter(BaseFormatter):
    """Assembler formatter."""

    def __init__(self, format_variant):
        super().__init__(format_variant)
        self.format = OutputFormat.ASM
        self.byte_prefix = "$"
        self.binary_prefix = '%'
        self.bytearray_singlelinemode = True
        self.bytearray_size = ''

        if self.format_variant is OutputFormatVariant.ACME:
            self.comment_begin = ';'
            self.bytearray_begin = '{0}\n'
            self.bytearray_linebegin = '    !byte '
            self.bytearray_end = '{0}_end\n'
            self.constant_value = '!set {0} = {1}\n'
            self.type_name_byte = '!byte'
            self.type_name_word = '!word'

        else:
            self.comment_begin = '//'
            self.commentline_char = '/'
            self.bytearray_begin = '{0}:\n'
            self.bytearray_linebegin = '    .byte '
            self.bytearray_end = '{0}_end:\n'
            self.label_fmt = '{0}:'
            self.constant_value = '.const {0} = {1}\n'
            self.type_name_byte = '.byte'
            self.type_name_word = '.word'

class BasicFormatter(BaseFormatter):
    """BASIC formatter."""

    def __init__(self, format_variant):
        super().__init__(format_variant)
        self.format = OutputFormat.BASIC
        self.comment_begin = '#'
        self.commentline_char = '#'
        self.hex_prefix = '$'
        self.byte_prefix = ""
        self.bytearray_begin = ''
        self.bytearray_end = ''
        self.bytearray_linebegin = 'DATA '
        self.bytearray_size = ''
        self.constant_value = '# {2} {0} = {1};\n'
        self.type_name_byte = ''
        self.type_name_word = ''
        self.bytearray_singlelinemode = True
        self.max_line_length = 78
        self.output_meta_info = False

    def format_byte(self, value: int):
        """Format integer value as hex string."""
        return str(value)


class FormatterFactory:
    """Formatter factory."""

    @staticmethod
    def create_instance(format_str: str):
        """Create formatter instance."""

        formatter = None
        if format_str == "cpp":
            formatter = CppFormatter(OutputFormatVariant.NONE)
        elif format_str == "cc":
            formatter = CFormatter(OutputFormatVariant.NONE)
        elif format_str == "basic":
            formatter = BasicFormatter(OutputFormatVariant.NONE)
        elif format_str == "acme":
            formatter = AsmFormatter(OutputFormatVariant.ACME)
        elif format_str == "kick":
            formatter = AsmFormatter(OutputFormatVariant.KICK)
        elif not format_str:
            formatter = BaseFormatter(OutputFormat.NONE)
        else:
            raise TypeError(f"could create formatter instance for type {format_str}")

        return formatter
