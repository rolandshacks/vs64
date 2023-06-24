"""VS64 Resource Compiler."""

import sys
import os
import getopt
import math

from enum import Enum
from typing import Optional
from datetime import datetime

import json

#import matplotlib.pyplot as plt
#import matplotlib as mpl

#############################################################################
# Helpers
#############################################################################

class Constants:
    """Global constants."""

    HEXCHARS = "0123456789abcdef"
    SYMBOL_CHARS = "abcdefghijklmnopqrstuvwxyz"\
                   "ABCDEFGHIJKLMNOPQRSTUVWXYZ"\
                   "0123456789"\
                   "_"
    MAX_LINE_LENGTH = 80
    RESOURCE_CONFIG_ROOT = "resources"
    DEFAULT_SAMPLE_FREQUENCY = 4000
    DEFAULT_SAMPLE_BITS = 4
    MAX_SAMPLE_OUTPUT_SIZE = 65535

class OutputFormat(Enum):
    """Output format identifiers."""

    NONE = 0
    CPP = 1
    C = 2
    ASM = 3

class OutputFormatVariant(Enum):
    """Output format variant identifiers."""

    NONE = 0
    ACME = 1
    KICK = 2

def clamp(value, min_value, max_value):
    """Clamp value"""
    return max(min_value, min(value, max_value))


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
        self.byte_prefix: str = '0x'
        self.binary_prefix: str = '0b'
        self.bytearray_begin: str = '{0}[1] = {{\n'
        self.bytearray_linebegin: str = '  '
        self.bytearray_singlelinemode: bool = False
        self.bytearray_end: str = '}};\n'
        self.bytearray_size: str = '{0}_size = {1};\n'

    def begin_namespace(self, name: str):
        """Return namespace opening."""
        return ""

    def end_namespace(self, name: str):
        """Return namespace closing."""
        return ""

    def comment(self, comment: str):
        """Create comment."""
        s = ""
        s += self.comment_begin
        if len(s) > 0 and len(comment) > 0:
            s += " "
        s += comment
        if len(comment) > 0 and len(self.comment_end) > 0: s += " "
        s += self.comment_end
        return s

    def comment_line(self):
        """Create comment line."""
        rep = Constants.MAX_LINE_LENGTH - (len(self.comment_begin) + len(self.comment_end))
        return self.comment_begin + (self.commentline_char * rep) + self.comment_end

    def format_byte(self, value: int):
        """Format integer value as hex string."""
        return self.byte_prefix + Constants.HEXCHARS[int(value/16)] + Constants.HEXCHARS[int(value%16)]

    def format_binary(self, value: int):
        """Format integer value as binary string."""
        return self.binary_prefix + f"{value:08b}"

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
                (len(self.bytearray_linebegin) + len(line) + len(element) > Constants.MAX_LINE_LENGTH - 2):
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
        else:
            self.comment_begin = '//'
            self.commentline_char = '/'
            self.bytearray_begin = '{0}:\n'
            self.bytearray_linebegin = '    .byte '
            self.bytearray_end = '{0}_end:\n'

class CompileError:
    """Compile errors."""

    def __init__(self, resource: 'Resource', error: str, line: Optional[int]=None, column: Optional[int]=None):
        self.resource = resource
        self.error = error

    def to_string(self):
        """Get string representation fo error."""
        if self.resource and hasattr(self.resource, "filename"):
            return f"{self.resource.filename}: error: {self.error}"
        else:
            return f"error: {self.error}"

def has_bit(value, bit: int):
    """Check if specific bit of integer value is set."""
    return (value & (1 << bit)) != 0x0

def get_timestamp():
    """Get time stamp string."""

    now = datetime.now()
    return now.strftime("%Y-%m-%d %H:%M:%S")

def id_from_filename(filename: str):
    """Get identifier from file name."""

    name = os.path.splitext(os.path.basename(filename))[0]
    identifier = ""
    for i, c in enumerate(name):
        if c.isnumeric():
            if i == 0: identifier += '_'
            identifier += c
        elif Constants.SYMBOL_CHARS.find(c) != -1:
            identifier += c
        else:
            identifier += '_'

    return identifier

#############################################################################
# Resource Types
#############################################################################

class ResourceType():
    """Resource type identifiers."""
    def __init__(self, major="generic", minor="generic", version=""):
        self.major = major
        self.minor = minor
        self.version = version
        self.type_str = major + "." + minor
        if len(version) > 0: self.type_str += "." + version

    def equals(self, type_str: str):
        """Compare type identifier."""
        elements = type_str.split('.')
        count = len(elements)
        if count == 0: return False
        if count >= 1 and elements[0] != self.major: return False
        if count >= 2 and elements[1] != self.minor: return False
        if count >= 3 and elements[2] != self.version: return False
        return True

    def to_string(self):
        """Get string representation."""
        return self.type_str

    @staticmethod
    def from_file(filename: str):
        """Detect resource type from file."""

        resource_type = None

        ext = os.path.splitext(filename)[1].lower()

        if ext == ".sid":
            resource_type = ResourceType("music", "sid")
        elif ext == ".spm":
            resource_type = ResourceType("sprite", "spritemate")
        elif ext == ".spd":
            resource_type = ResourceType("sprite", "spritepad")
        elif ext == ".ctm":
            resource_type = ResourceType("charset", "charpad")
        elif ext == ".wav":
            resource_type = ResourceType("music", "wave")
        else:
            resource_type = ResourceType()

        return resource_type

class ResourceFactory:
    """Resource factory."""

    @staticmethod
    def create_instance_from_file(filename: str):
        """Create resource type from file type."""
        resource_type = ResourceType.from_file(filename)
        resource = None
        if resource_type.equals("music.sid"):
            resource = SidResource(filename, resource_type)
        elif resource_type.equals("sprite.spritemate"):
            resource = SpriteMateResource(filename, resource_type)
        elif resource_type.equals("sprite.spritepad"):
            resource = SpritePadResource(filename, resource_type)
        elif resource_type.equals("charset.charpad"):
            resource = CharPadResource(filename, resource_type)
        elif resource_type.equals("music.wave"):
            resource = WaveResource(filename, resource_type)
        else:
            resource = Resource(filename, resource_type)
        return resource

class Resource:
    """Resource item."""

    def __init__(self, filename: str, resource_type: ResourceType):
        self.filename = filename
        self.identifier = None
        self.resource_type = resource_type
        self.package = None
        self.input_endianness = 'big'
        self.input = None
        self.input_size = 0
        self.input_ofs = 0
        self.input_avail = 0
        self.output = None

    @staticmethod
    def from_file(filename: str):
        """Create resource instance from file."""
        return ResourceFactory.create_instance_from_file(filename)

    def set_package(self, package: 'ResourcePackage'):
        """Attach resource package reference."""
        self.package = package

    def get_config(self, name: str, default_value: Optional[str]):
        """Get configuration value."""
        if not self.package: return default_value
        return self.package.get_config(name, default_value)

    def read(self):
        """Read data from file."""
        data = None

        try:
            with open(self.filename, "rb") as in_file:
                data = in_file.read()
        except:
            return CompileError(self, "could not read file")

        self.input = data
        self.input_size = len(data)
        self.read_reset()

    def read_reset(self):
        """Reset read offset within resource data."""
        self.read_set_pos(0)

    def read_endianness(self, endianness: str):
        """Set binary data endianness."""
        self.input_endianness = endianness

    def read_set_pos(self, newpos: int):
        """Set read offset within resource data."""
        self.input_ofs = newpos
        self.input_avail = self.input_size - self.input_ofs

    def read_skip(self, num_bytes: int):
        """Skip bytes in buffer."""
        if num_bytes < 1 or num_bytes > self.input_avail: return
        self.input_ofs += num_bytes
        self.input_avail -= num_bytes

    def read_int(self, num_bytes: int):
        """Read int from buffer."""
        if num_bytes > self.input_avail: return -1
        value = int.from_bytes(self.input[self.input_ofs:self.input_ofs+num_bytes], self.input_endianness)
        self.input_ofs += num_bytes
        self.input_avail -= num_bytes
        return value

    def read_signed_int(self, num_bytes: int):
        """Read signed int from buffer."""
        if num_bytes > self.input_avail: return -1
        value = int.from_bytes(self.input[self.input_ofs:self.input_ofs+num_bytes], self.input_endianness, signed=True)
        self.input_ofs += num_bytes
        self.input_avail -= num_bytes
        return value

    def read_byte(self):
        """Read byte from buffer."""
        if self.input_avail < 1: return -1
        value = self.input[self.input_ofs]
        self.input_ofs += 1
        self.input_avail -= 1
        return value

    def read_byte_at(self, pos: int):
        """Read byte at specific position and do not change stream offset."""
        if pos < 0 or pos >= self.input_size: return -1
        return self.input[pos]

    def read_bytearray(self, num_bytes: int):
        """Read byte array from buffer."""
        if num_bytes > self.input_avail: return None
        mem = memoryview(self.input)
        data = bytearray(mem[self.input_ofs:self.input_ofs+num_bytes])
        self.input_ofs += num_bytes
        self.input_avail -= num_bytes
        return data

    def read_str(self, num_bytes: int):
        """Read fixed size string from buffer."""
        if num_bytes > self.input_avail: return None
        value = ""
        for i in range(num_bytes):
            c = self.input[self.input_ofs+i]
            if c == 0: break
            value += chr(c)
        self.input_ofs += num_bytes
        self.input_avail -= num_bytes
        return value

    def read_cstr(self, max_bytes: int):
        """Read fixed size string from buffer."""
        if max_bytes > self.input_avail:
            return None
        value = ""
        for i in range(max_bytes):
            c = self.input[self.input_ofs+i]
            self.input_ofs += 1
            self.input_avail -= 1
            if c == 0:
                break
            value += chr(c)
        return value

    def parse(self) -> Optional[CompileError]:
        """Parse resource data."""
        if not self.filename:
            return CompileError(self, "missing filename")

        self.identifier = self.package.get_unique_id(self.filename)
        return None

    def compile(self) -> Optional[CompileError]:
        """Compile resource."""
        err = self.read()
        if err:
            return err

        err = self.parse()
        if err:
            return err

        self.output = self.input

        return None

    def to_string(self, formatter: BaseFormatter, ofs: Optional[int]=None, sz: Optional[int]=None):
        """Convert resource data to string."""

        s = ""
        s += formatter.comment_line() + "\n"
        s += formatter.comment("Type:         Binary Data\n")
        s += formatter.comment(f"Name:         {self.identifier}\n")
        s += formatter.comment(f"Data size:    {self.input_size} bytes (0x{self.input_size:04x})\n")
        s += formatter.comment_line() + "\n"

        s += formatter.byte_array(self.identifier, self.input, ofs, sz)

        return s

class WaveResource(Resource):
    """Wave file resource."""

    def __init__(self, filename: str, resource_type: ResourceType):
        super().__init__(filename, resource_type)
        self.chunks_ofs = 0

    def find_chunk(self, id: str) -> int:
        """Find chunk in chunk file."""
        self.read_set_pos(12) # start of chunks

        while self.input_avail >= 8:
            chunk_id = self.read_str(4)
            chunk_size = self.read_int(4)
            if chunk_id == id:
                return chunk_size
            self.read_skip(chunk_size)

        return 0

    def parse(self) -> Optional[CompileError]:
        """Parset resource data."""
        err = super().parse()
        if err: return err

        target_sample_rate = self.get_config('sampleFrequency', Constants.DEFAULT_SAMPLE_FREQUENCY)
        target_bits_per_sample = self.get_config('sampleBits', Constants.DEFAULT_SAMPLE_BITS)

        wave = self.input
        wave_size = self.input_size

        if wave_size < 12:
            return CompileError(self, "invalid wave file size")

        magic = chr(wave[0]) + chr(wave[1]) + chr(wave[2]) + chr(wave[3])
        self.magic_num = self.read_int(4)

        if magic != "RIFF":
            return CompileError(self, f"invalid file magic bytes: {magic}")

        self.read_endianness('little')

        wave_chunk_size = self.read_int(4)
        wave_format = self.read_str(4)
        if wave_format != "WAVE":
            return CompileError(self, f"unsupported wave format: {wave_format}")

        chunk_size = self.find_chunk("fmt ")
        if not chunk_size:
            return CompileError(self, f"wave file does not contain format info")

        if chunk_size < 16:
            return CompileError(self, "unexpected wave format info size")

        format_type = self.read_int(2)
        if format_type != 1:
            return CompileError(self, "unsupported wave sample format")

        format_num_channels = self.read_int(2)
        format_sample_rate = self.read_int(4)
        format_byte_rate = self.read_int(4)
        format_bytes_per_sample_block = self.read_int(2)
        format_bits_per_sample = self.read_int(2)
        if not format_bits_per_sample in [8, 16, 24]:
            return CompileError(self, "unsupported wave sample size")

        chunk_size = self.find_chunk("data")
        if not chunk_size:
            return CompileError(self, f"wave file does not contain PCM data chunk")

        chunk_end_ofs = self.input_ofs + chunk_size

        self.read_endianness('little')

        # setup conversion parameters

        target_max_output_size = int((Constants.MAX_SAMPLE_OUTPUT_SIZE * 8) / target_bits_per_sample)

        sample_rate = format_sample_rate if not target_sample_rate else min(format_sample_rate, target_sample_rate)
        sample_step = int(format_sample_rate / sample_rate) * format_bytes_per_sample_block
        sample_start = self.input_ofs
        sample_ofs = 0.0

        max_idx = chunk_size - format_bytes_per_sample_block * 2

        # decoding, interpolation and resampling

        logical_data = []
        loudness_rms = 0.0 # root-mean-square

        while True:
            idx = int(sample_ofs)

            idx_alignment_ofs = idx % format_bytes_per_sample_block
            if idx_alignment_ofs:
                idx += format_bytes_per_sample_block - idx_alignment_ofs

            if idx > max_idx - format_bytes_per_sample_block: break
            ratio = sample_ofs - idx

            self.read_set_pos(sample_start + idx)

            if format_num_channels == 1:
                s0 = self.read_sample(format_bits_per_sample)
                s1 = self.read_sample(format_bits_per_sample)
            elif format_num_channels == 2:
                s0 = (self.read_sample(format_bits_per_sample) + self.read_sample(format_bits_per_sample))/2.0
                s1 = (self.read_sample(format_bits_per_sample) + self.read_sample(format_bits_per_sample))/2.0
            else:
                s0 = 0.0
                for channel in range(0, format_num_channels):
                    s0 += self.read_sample(format_bits_per_sample)
                s0 /= format_num_channels
                s1 = 0.0
                for channel in range(0, format_num_channels):
                    s1 += self.read_sample(format_bits_per_sample)
                s1 /= format_num_channels

            s = ((s0 * (1.0-ratio)) + (s1 * ratio) / 2.0)
            loudness_rms += (s * s)
            logical_data.append(s)

            if len(logical_data) >= target_max_output_size:
                break

            sample_ofs += sample_step

        if len(logical_data) > 0: loudness_rms /= len(logical_data)
        if loudness_rms > 0.0: loudness_rms = math.sqrt(loudness_rms)

        normalization_factor = (1.0 / max(0.33, loudness_rms))

        # normalize, quantize and compress to byte array

        data = bytearray()

        if target_bits_per_sample == 4:
            # 4-bit output
            idx = 0
            while idx < len(logical_data) - 1:
                s0 = clamp(normalization_factor * logical_data[idx+0], -1.0, 1.0)
                nibble0 = (self.float_to_byte(s0) >> 4)

                s1 = clamp(normalization_factor * logical_data[idx+1], -1.0, 1.0)
                nibble1 = (self.float_to_byte(s1) >> 4)

                data.append((nibble0 << 4) | nibble1)
                idx += 2

        else:
            # 8-bit output
            idx = 0
            while idx < len(logical_data):
                s = clamp(normalization_factor * logical_data[idx], -1.0, 1.0)
                b = self.float_to_byte(s)
                data.append(b)
                idx += 1

        self.sample_rate = sample_rate
        self.sample_count = len(data)
        self.sample_bits = target_bits_per_sample
        self.sample_data = data

        '''

        plot_data = []

        for item in data:
            if target_bits_per_sample == 4:
                sample0 = (item >> 4)
                plot_data.append(sample0)
                sample1 = (item & 0x0f)
                plot_data.append(sample1)
            else:
                plot_data.append(item)

        mpl.rcParams['lines.linewidth'] = 0.1
        plt.plot(plot_data)
        plt.ylabel('sample')
        plt.savefig("./build/fig.png", dpi=300.0, format='png')

        '''

        return None

    def float_to_byte(self, f):
        b = int(128.0 + f * 128.0) if f < 0.0 else int(128.0 + f * 127.0)
        return b

    def read_sample(self, bits_per_sample):

        if bits_per_sample == 8:
            s = self.read_byte()
            v = (s - 128) / 128.0
        elif bits_per_sample == 16:
            s = self.read_signed_int(2)
            #v = ((s ^ 0x8000) - 0x8000) / 32768.0
            v = s / 32768.0
        elif bits_per_sample == 24:
            s = self.read_signed_int(3)
            #v = ((s ^ 0x8000) - 0x8000) / 32768.0
            v = s / 8388608.0
        else:
            v = 0.0

        return v


    def to_string(self, formatter: BaseFormatter, ofs: Optional[int]=None, sz: Optional[int]=None,
                  name: Optional[str]=None):
        """Convert resource data to string."""

        s = ""
        s += formatter.comment_line() + "\n"
        s += formatter.comment("Type:             Wave Sample Data\n")
        s += formatter.comment(f"Name:             {self.identifier}\n")
        s += formatter.comment(f"Bits per sample:  {self.sample_bits}\n")
        s += formatter.comment(f"Sample rate:      {self.sample_rate}\n")
        s += formatter.comment(f"Data size:        {self.sample_count} bytes (0x{self.sample_count:04x})\n")
        s += formatter.comment_line() + "\n"

        s += formatter.byte_array(self.identifier, self.sample_data, 0, self.sample_count)

        return s

class SidResource(Resource):
    """SID music resource."""

    def __init__(self, filename: str, resource_type: ResourceType):
        super().__init__(filename, resource_type)

    def parse(self) -> Optional[CompileError]:
        """Parset resource data."""
        err = super().parse()
        if err: return err

        sid = self.input
        sid_size = self.input_size

        if sid_size < 126:
            return CompileError(self, "invalid sid file size")

        magic = chr(sid[0]) + chr(sid[1]) + chr(sid[2]) + chr(sid[3])
        self.magic_num = self.read_int(4)

        if magic != "PSID" and magic != "RSID":
            return CompileError(self, f"invalid file magic bytes: {magic}")

        self.version = self.read_int(2)
        self.data_offset = self.read_int(2)
        self.data_size = sid_size - (self.data_offset + 2)
        self.load_address = self.read_int(2)
        if self.load_address == 0x0:
            self.load_address = int.from_bytes(sid[self.data_offset:self.data_offset + 2], 'little')

        self.init_address = self.read_int(2)
        self.play_address = self.read_int(2)
        self.num_songs = self.read_int(2)
        self.start_song = self.read_int(2)
        self.speed = self.read_int(4)
        self.name = self.read_str(32)
        self.author = self.read_str(32)
        self.released = self.read_str(32)

        self.flags = None
        self.player = None
        self.compatibility = None
        self.norm = None

        if self.version != 1:
            self.flags = self.read_int(2)

            if self.flags & 0x1:
                self.player = "built-in music player"
            else:
                self.player = "Compute!'s Sidplayer MUS data"

            if self.flags & 0x2:
                self.compatibility = "C64 compatible"
            else:
                self.compatibility = "PlaySID specific (PSID v2NG, v3, v4) / C64 BASIC flag (RSID)"

            if self.flags & 0x4 and self.flags & 0x8:
                self.norm = "PAL and NTSC"
            elif self.flags & 0x4:
                self.norm = "PAL"
            elif self.flags & 0x8:
                self.norm = "NTSC"

        return None

    def to_string(self, formatter: BaseFormatter, ofs: Optional[int]=None, sz: Optional[int]=None,
                  name: Optional[str]=None):
        """Convert resource data to string."""

        s = ""
        s += formatter.comment_line() + "\n"
        s += formatter.comment("Type:         SID Music Data\n")
        s += formatter.comment(f"Name:         {self.name}\n")
        s += formatter.comment(f"Author:       {self.author}\n")
        s += formatter.comment(f"Release:      {self.released}\n")
        s += formatter.comment(f"Load address: 0x{self.load_address:04x}\n")
        s += formatter.comment(f"Init address: 0x{self.init_address:04x}\n")
        s += formatter.comment(f"Play address: 0x{self.play_address:04x}\n")
        s += formatter.comment(f"Num songs:    0x{self.num_songs:04x}\n")
        s += formatter.comment(f"Start song:   0x{self.start_song:02x}\n")
        s += formatter.comment(f"Speed:        0x{self.speed:08}\n")
        s += formatter.comment(f"Data size:    {self.data_size} bytes (0x{self.data_size:04x})\n")
        s += formatter.comment_line() + "\n"

        s +=  formatter.byte_array(self.identifier, self.input, self.data_offset + 2, self.data_size)

        return s

class ResourceElement:
    """Resource Element."""

    def __init__(self):
        self.name = None
        self.identifier = None

class Sprite(ResourceElement):
    """Sprite."""

    def __init__(self):
        super().__init__()
        self.palette = None
        self.color = 0
        self.multicolor = False
        self.double_x = False
        self.double_y = False
        self.overlay = False
        self.data = None

class SpriteResource(Resource):
    """Sprite resource."""

    def __init__(self, filename: str, resource_type: ResourceType):
        super().__init__(filename, resource_type)

    def parse(self) -> Optional[CompileError]:
        """Parset resource data."""
        err = super().parse()
        if err: return err

        return None

    def to_string(self, formatter: BaseFormatter, ofs: Optional[int]=None, sz: Optional[int]=None,
                  name: Optional[str]=None):
        """Convert sprite resource data to string."""

        data_size = 0
        for sprite in self.sprites:
            data_size += len(sprite.data)

        s = ""
        s += formatter.bytearray_begin.format(self.identifier, data_size) + "\n"

        idx = 0

        for sprite in self.sprites:
            bits_per_pixel = 2 if sprite.multicolor else 1
            s += formatter.comment_line() + "\n"
            if self.type_info: s += formatter.comment(f"Type:         {self.type_info}\n")
            if self.editor_info: s += formatter.comment(f"Editor:       {self.editor_info}\n")
            s += formatter.comment(f"Name:         {sprite.name}\n")
            s += formatter.comment(f"Palette:      {{{self.palette}}} (screen, multicolor 1, multicolor 2)\n")
            s += formatter.comment(f"Color:        {sprite.color}\n")
            s += formatter.comment(f"Multicolor:   {sprite.multicolor}\n")
            s += formatter.comment(f"Double X:     {sprite.double_x}\n")
            s += formatter.comment(f"Double Y:     {sprite.double_y}\n")
            s += formatter.comment(f"Overlay:      {sprite.overlay}\n")
            s += formatter.comment(f"Flags:        %{sprite.flags:08b} (MYXOCCCC: stored in data byte 64)\n")

            s += formatter.comment_line() + "\n"

            scale = 1 if sprite.multicolor else 0

            continued = (idx < len(self.sprites) - 1)

            if formatter.format == OutputFormat.ASM:
                s += sprite.identifier + "\n"

            s += formatter.binary(sprite.data, None, None, bits_per_pixel, scale, 3, continued)

            if formatter.format == OutputFormat.ASM:
                s += sprite.identifier + "_end\n"

            s += '\n'
            idx += 1

        s += formatter.bytearray_end.format(self.identifier, data_size) + '\n'
        s += formatter.byte_array_size(self.identifier, data_size)

        return s

class SpriteMateResource(SpriteResource):
    """Spritemate resource."""

    def __init__(self, filename: str, resource_type: ResourceType):
        super().__init__(filename, resource_type)

    def parse(self) -> Optional[CompileError]:
        """Parset resource data."""
        err = super().parse()
        if err: return err

        document = None

        try:
            document = json.loads(self.input)
        except:
            return CompileError(self, "could not parse sprite file")

        version = document['version']
        if not version: return CompileError(self, "sprite file has invalid version")

        colors = document['colors']
        if not colors: return CompileError(self, "sprite file is missing color data")

        sprites = document['sprites']
        if not sprites: return CompileError(self, "sprite file is missing sprite data")

        self.type_info = "SpriteMate Data"
        self.editor_info = "https://www.spritemate.com"

        self.palette = ""
        for color in colors:
            if len(self.palette) > 0: self.palette += ", "
            self.palette += color

        self.sprites = []
        idx = 0
        for sprite_info in sprites:

            sprite = Sprite()

            sprite.name = sprite_info['name']
            sprite.identifier = self.package.get_unique_id(self.filename, sprite.name)
            sprite.color = sprite_info['color']
            sprite.multicolor = sprite_info['multicolor']
            sprite.double_y = sprite_info['double_y']
            sprite.double_x = sprite_info['double_x']
            sprite.overlay = sprite_info['overlay']

            sprite.flags = sprite.color & 0x0f
            if sprite.multicolor: sprite.flags |= 0x80
            if sprite.double_y: sprite.flags |= 0x40
            if sprite.double_x: sprite.flags |= 0x20
            if sprite.overlay: sprite.flags |= 0x10

            sprite.data = bytearray()

            for row in sprite_info['pixels']:
                mask = 0
                bit = 0
                bit_size = 1
                if sprite.multicolor: bit_size = 2
                bit_end = len(row) + 1 - bit_size
                bit_count = 0

                while bit < bit_end:
                    pixel = row[bit]
                    mask = mask * 2 * bit_size

                    if sprite.multicolor:
                        if pixel & 0x1: mask += 2
                        if pixel & 0x2: mask += 1
                    else:
                        mask += pixel

                    bit += bit_size
                    bit_count += bit_size

                    if bit_count >= 8:
                        sprite.data.append(mask)
                        mask = 0
                        bit_count = 0

            sprite.data.append(sprite.flags)
            self.sprites.append(sprite)
            idx += 1

        return None

class SpritePadResource(SpriteResource):
    """Spritepad resource."""

    def __init__(self, filename: str, resource_type: ResourceType):
        super().__init__(filename, resource_type)

    def parse(self) -> Optional[CompileError]:
        """Parset resource data."""
        err = super().parse()
        if err: return err

        self.read_endianness('little')

        data_size = self.input_size
        if data_size < 3:
            return CompileError(self, "invalid spritepad file size")

        sprite_quantity = 0
        sprite_animation_quantity = 0
        sprite_overlay_distance = 0
        tile_quantity = 0
        tile_animation_quantity = 0
        tile_width = 0
        tile_height = 0
        tile_overlay_distance = 0

        format_version = 0
        flags = 0x0

        magic = chr(self.read_byte()) + chr(self.read_byte()) + chr(self.read_byte())
        if magic != "SPD":
            self.read_reset()
        else:
            format_version = self.read_byte()
            if format_version < 1 or format_version > 5:
                return CompileError(self, "unsupported spritepad file format version")

            flags = self.read_byte() if format_version >= 2 else 0x0

            if format_version >= 2:
                sprite_quantity = self.read_int(2)
                tile_quantity = self.read_int(2)

                if format_version >= 3:
                    sprite_animation_quantity = self.read_byte() + 1
                    tile_animation_quantity = self.read_byte() + 1
                else:
                    sprite_animation_quantity = self.read_int(2)

                #+ 1 if has_bit(flags, 2) else 0
                tile_width = self.read_byte()
                tile_height = self.read_byte()

                if format_version >= 4:
                    sprite_overlay_distance = self.read_int(2)
                    tile_overlay_distance = self.read_int(2)

            else:
                sprite_quantity = self.read_byte() + 1
                sprite_animation_quantity = self.read_byte() + 1

        col_background = self.read_byte() & 0xf
        col_multicolor1 = self.read_byte() & 0xf
        col_multicolor2 = self.read_byte() & 0xf
        self.palette = f"{col_background}, {col_multicolor1}, {col_multicolor2}"

        self.sprites = []

        while sprite_quantity == 0 or len(self.sprites) < sprite_quantity:
            if sprite_quantity == 0 and self.input_avail < 64: break

            idx = len(self.sprites)

            sprite = Sprite()

            sprite.name = f"sprite{idx}"
            sprite.identifier = self.package.get_unique_id(self.filename, sprite.name)

            sprite.data = self.read_bytearray(63)

            flags = self.read_byte()
            sprite.color = (flags & 0x0f)
            sprite.multicolor = (flags & 0x80) != 0
            sprite.double_y = (flags & 0x40) != 0
            sprite.double_x = (flags & 0x20) != 0
            sprite.overlay = (flags & 0x10) != 0

            sprite.flags = sprite.color & 0x0f
            if sprite.multicolor: sprite.flags |= 0x80
            if sprite.double_y: sprite.flags |= 0x40
            if sprite.double_x: sprite.flags |= 0x20
            if sprite.overlay: sprite.flags |= 0x10

            sprite.data.append(sprite.flags)

            self.sprites.append(sprite)

        version_label = f"Pro Version, Format {format_version}" if format_version > 0 else "Free Version"
        self.type_info = f"SpritePad Data ({version_label})"
        self.editor_info = "https://subchristsoftware.itch.io/spritepad-c64-pro"

        return None

class CharsetResource(Resource):
    """Charset resource."""

    def __init__(self, filename: str, resource_type: ResourceType):
        super().__init__(filename, resource_type)

    def parse(self) -> Optional[CompileError]:
        """Parset resource data."""
        err = super().parse()
        if err: return err
        return None

    def to_string(self, formatter: BaseFormatter, ofs: Optional[int]=None, sz: Optional[int]=None,
                  name: Optional[str]=None):
        """Convert charset resource data to string."""

        data_size = len(self.charset_data)

        if not self.charset_data: return ""

        num_chars = (data_size >> 3)
        if num_chars < 1: return ""

        s = ""

        s += formatter.comment_line() + "\n"
        if self.type_info: s += formatter.comment(f"Type:         {self.type_info}\n")
        if self.editor_info: s += formatter.comment(f"Editor:       {self.editor_info}\n")
        s += formatter.comment(f"Characters:   {num_chars}\n")
        s += formatter.comment(f"Size:         {data_size} bytes\n")
        s += formatter.comment(f"Palette:      {{{self.palette}}}\n")

        multicolor = True if self.display_mode == 1 or self.display_mode == 4 else False
        bits_per_pixel = 2 if multicolor else 1

        display_mode_info = None
        if   self.display_mode == 0: display_mode_info = "Text High Resolution"
        elif self.display_mode == 1: display_mode_info = "Text Multi-Color"
        elif self.display_mode == 2: display_mode_info = "Text Extended Color"
        elif self.display_mode == 3: display_mode_info = "Bitmap High Resolution"
        elif self.display_mode == 4: display_mode_info = "Bitmap Multi-Color"

        if display_mode_info: s += formatter.comment(f"Display Mode: {display_mode_info}\n")

        s += formatter.comment_line() + "\n"

        ######

        s += formatter.bytearray_begin.format(self.identifier, data_size) + "\n"

        scale = 1 if multicolor else 0

        for i in range(0, num_chars):
            continued = (i < num_chars - 1)
            s += formatter.binary(self.charset_data, i*8, 8, bits_per_pixel, scale, 1, continued)
            s += '\n'

        s += formatter.bytearray_end.format(self.identifier, data_size) + '\n'
        s += formatter.byte_array_size(self.identifier, data_size)

        ######

        if hasattr(self, 'charset_attribs') and self.charset_attribs:
            s += '\n'
            s += formatter.comment_line() + "\n"
            s += formatter.comment("Type:         Character Attributes (bit 0-3: material)\n")
            s += formatter.comment_line() + "\n"
            s += formatter.byte_array(self.identifier + "_attribs", self.charset_attribs)

        ######

        if hasattr(self, 'charset_colors') and self.charset_colors:
            s += '\n'
            s += formatter.comment_line() + "\n"

            color_type_info = "Color Matrix" if self.display_mode != 3 else "Screen Matrix"

            s += formatter.comment(f"Type:         Character Colors ({color_type_info})\n")
            s += formatter.comment_line() + "\n"
            s += formatter.byte_array(self.identifier + "_colors", self.charset_colors)

        ######

        if hasattr(self, 'map_data') and self.map_data:
            s += '\n'
            s += formatter.comment_line() + "\n"
            s += formatter.comment("Type:         Map Data\n")
            s += formatter.comment(f"Map Width:    {self.map_width}\n")
            s += formatter.comment(f"Map Height:   {self.map_height}\n")
            s += formatter.comment(f"Map Size:     {len(self.map_data)} bytes\n")
            s += formatter.comment_line() + "\n"
            s += formatter.byte_array(self.identifier + "_map", self.map_data)

        return s

class CharPadResource(CharsetResource):
    """Charpad resource."""

    def __init__(self, filename, resource_type: ResourceType):
        super().__init__(filename, resource_type)

    def next_block(self):
        """Read next block marker."""
        data = self.read_byte()
        if data != 0xda: return None
        data = self.read_byte()
        if (data & 0xf0) != 0xb0: return None
        return data & 0x0f

    def parse(self) -> Optional[CompileError]:
        """Parset resource data."""
        err = super().parse()
        if err: return err

        self.read_endianness('little')

        data_size = self.input_size
        if data_size < 3:
            return CompileError(self, "invalid charpad file size")

        magic = chr(self.read_byte()) + chr(self.read_byte()) + chr(self.read_byte())
        if magic != "CTM":
            return CompileError(self, "invalid charpad file")

        format_version = self.read_byte()
        if format_version < 7 or format_version > 8:
            return CompileError(self, "unsupported charpad file format version")

        if format_version >= 8:
            self.display_mode = self.read_byte()
            col_method = self.read_byte()
            flags = self.read_byte()

            col_background0 = self.read_byte() & 0xf
            col_background1 = self.read_byte() & 0xf
            col_background2 = self.read_byte() & 0xf
            col_background3 = self.read_byte() & 0xf

            col_matrixbase0 = self.read_byte() & 0xf
            col_matrixbase1 = self.read_byte() & 0xf
            col_matrixbase2 = self.read_byte() & 0xf

        else:

            col_background0 = self.read_byte() & 0xf
            col_background1 = self.read_byte() & 0xf
            col_background2 = self.read_byte() & 0xf
            col_background3 = self.read_byte() & 0xf
            col_globalcolor = self.read_byte() & 0xf

            col_method = self.read_byte()
            self.display_mode = self.read_byte()
            flags = self.read_byte()

        tiles_used = has_bit(flags, 0)
        self.palette = f"{col_background0}, {col_background1}, {col_background2}, {col_background3}"

        #### block

        block_idx = self.next_block()
        if block_idx is None: return None

        char_quantity = self.read_int(2) + 1
        if char_quantity < 1: return None

        self.charset_data = self.read_bytearray(char_quantity * 8)

        #### block

        block_idx = self.next_block()
        if block_idx is None: return None

        self.charset_attribs = self.read_bytearray(char_quantity)

        #### block

        if col_method == 2:

            block_idx = self.next_block()
            if block_idx is None: return None

            self.charset_colors = []

            for i in range(0, char_quantity):
                if self.display_mode != 3:
                    color_cmlo = self.read_byte()
                    self.charset_colors.append(color_cmlo)
                if self.display_mode == 3 or self.display_mode == 4:
                    color_smlo = self.read_byte()
                    color_smhi = self.read_byte()
                    self.charset_colors.append((color_smhi << 3) + color_smlo)

        #### block

        if tiles_used:

            block_idx = self.next_block()
            if block_idx is None: return None

            tile_quantity = self.read_int(2) + 1
            tile_width = self.read_byte()
            tile_height = self.read_byte()

            tile_data_size = tile_quantity * tile_width * tile_height * 2
            self.tileset_data = self.read_bytearray(tile_data_size)

            #### block

            if col_method == 1:

                block_idx = self.next_block()
                if block_idx is None: return None

                if format_version >= 8:
                    self.tileset_colors = []
                    for i in range(0, char_quantity):
                        if self.display_mode != 3:
                            color_cmlo = self.read_byte()
                            self.tileset_colors.append(color_cmlo)
                        if self.display_mode == 3 or self.display_mode == 4:
                            color_smlo = self.read_byte()
                            color_smhi = self.read_byte()
                            self.tileset_colors.append((color_smhi << 3) + color_smlo)
                else:
                    self.tileset_colors = self.read_bytearray(tile_quantity)

            #### block

            block_idx = self.next_block()
            if block_idx is None: return None

            self.tileset_tags = self.read_bytearray(tile_quantity)

            #### block

            block_idx = self.next_block()
            if block_idx is None: return None

            for i in range(0, tile_quantity):
                tile_name = self.read_cstr(32)
                if self.tileset_names is None: self.tileset_names = []
                self.tileset_names.append(tile_name)

        #### block

        block_idx = self.next_block()
        if block_idx is None: return None

        self.map_width = self.read_int(2)
        self.map_height = self.read_int(2)
        map_data_size = self.map_width * self.map_height * 2
        if map_data_size:
            self.map_data = self.read_bytearray(map_data_size)

        version_label = f"Pro Version, Format {format_version}" if format_version > 7 else "Free Version"
        self.type_info = f"CharPad Data ({version_label})"
        self.editor_info = "https://subchristsoftware.itch.io/charpad-c64-pro"

        return None


#############################################################################
# Resource Management
#############################################################################

class ResourcePackage:
    """Resource package."""

    def __init__(self):
        self.identifier: str = None
        self.resources: list[Resource] = []
        self.ids: set[str] = set()
        self.config = None

    def read_config(self, config_file: Optional[str]) -> Optional[CompileError]:
        if not config_file:
            return None

        data = None
        try:
            with open(config_file, "rb") as in_file:
                data = in_file.read()
        except:
            return CompileError(None, "could not read config file")

        try:
            config = json.loads(data)
            self.config = config
        except:
            return CompileError(None, "invalid config file")

        return None

    def get_config(self, name: str, default_value: Optional[str]):
        """Get configuration value."""

        config = self.config

        if not config: return default_value

        config_path = os.path.normpath(os.path.join(Constants.RESOURCE_CONFIG_ROOT, name))
        config_keys = config_path.split(os.path.sep)

        node = config

        for idx, config_key in enumerate(config_keys):
            if config_key in node:
                if idx == len(config_keys)-1:
                    config_value = node[config_key]
                    if isinstance(config_value, str) and len(config_value) == 0:
                        break
                    return config_value
                else:
                    node = node[config_key]
            else:
                break

        return default_value

    def set_name(self, filename: str):
        """Set resource package name."""
        if not filename: filename = "unnamed"
        self.identifier = self.get_unique_id(filename, None, "package")

    def is_empty(self):
        """Check if resource package is empty."""
        return len(self.resources) < 1

    def get_unique_id(self, name: str, label: Optional[str]=None, prefix: Optional[str]=None):
        """Generate unique identifier."""
        id_base = id_from_filename(name)
        if label: id_base += "_" + label
        if prefix: id_base = prefix + "_" + id_base

        id_count = 0
        identifier = None
        while True:
            identifier = id_base
            if id_count > 0: identifier += f"_{id_count}"
            if not identifier in self.ids:
                break
            id_count += 1

        self.ids.add(identifier)

        return identifier

    def add(self, resource: Resource):
        """Add resource to package."""
        resource.set_package(self)
        self.resources.append(resource)

    def to_string(self, formatter: BaseFormatter):
        """Convert resource data to string."""

        timestr = get_timestamp()

        lines = []
        lines.append(formatter.comment_line())
        lines.append(formatter.comment("Resource Data"))
        lines.append(formatter.comment(f"generated {timestr} - DO NOT EDIT"))
        lines.append(formatter.comment("clang-format off"))
        lines.append(formatter.comment_line())
        lines.append("\n")

        s = ""
        s += "\n".join(lines)
        s += formatter.begin_namespace(self.identifier)

        resources = self.resources
        i = 0
        for resource in resources:
            if i > 0: s += "\n"
            s += resource.to_string(formatter)
            i += 1

        lines = []
        lines.append("")

        s += "\n".join(lines)
        s += formatter.end_namespace(self.identifier)

        return s

    def compile(self) -> Optional[CompileError]:
        """Compile all resources."""
        for resource in self.resources:
            err = resource.compile()
            if err: return err

        return None

#############################################################################
# Resource Compiler
#############################################################################

class ResourceCompiler:
    """Resource compiler."""

    def __init__(self):
        self.resources = ResourcePackage()

    def compile(self, inputs: 'list[str]', output: Optional[str], formatter: BaseFormatter, config_file: Optional[str]) -> Optional[CompileError]:
        """Compile resources and generate output using given formatter."""

        resources = self.resources
        resources.set_name(output)

        err = resources.read_config(config_file)
        if err:
            return err

        for filename in inputs:
            resource = Resource.from_file(filename)
            if resource:
                resources.add(resource)

        err = resources.compile()
        if err:
            return err

        s = resources.to_string(formatter)

        self.write(output, s)

        return None

    def write(self, filename: Optional[str], content: str):
        """Write generated output to file or console."""

        if not filename:
            print(content)
            return

        try:
            os.makedirs(os.path.dirname(filename))
        except FileExistsError:
            pass

        with open(filename, "w") as text_file:
            text_file.write(content)

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
        opts, args = getopt.getopt(sys.argv[1:], "o:", ["format=", "config=", "help", "output="])
    except getopt.GetoptError:
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

    formatter = None
    if format_str == "cpp":
        formatter = CppFormatter(OutputFormatVariant.NONE)
    elif format_str == "cc":
        formatter = CFormatter(OutputFormatVariant.NONE)
    elif format_str == "acme":
        formatter = AsmFormatter(OutputFormatVariant.ACME)
    elif format_str == "kick":
        formatter = AsmFormatter(OutputFormatVariant.KICK)
    elif not format_str:
        formatter = BaseFormatter(OutputFormat.NONE)
    else:
        print("unsupported output format type: " + format_str)
        sys.exit(2)

    resource_compiler = ResourceCompiler()

    err = resource_compiler.compile(args, output, formatter, config_file)
    if err:
        print(err.to_string())
        sys.exit(1)

if __name__ == "__main__":
    main()
