"""Resources."""

import os

from typing import Optional, Any
from datetime import datetime
import json

from .constants import Constants
from .formatter import FormatterFactory, BaseFormatter

class CompileError:
    """Compile errors."""

    def __init__(self, resource: 'Resource', error: str, _line_: Optional[int]=None, _column_: Optional[int]=None):
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
# Resource Element
#############################################################################

class ResourceElement:
    """Resource Element."""

    def __init__(self):
        self.name = None
        self.identifier = None

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
        elif ext == ".png":
            resource_type = ResourceType("bitmap", "png")
        elif ext == ".kla" or ext == ".koa":
            resource_type = ResourceType("bitmap", "koala")
        elif ext == ".wav":
            resource_type = ResourceType("music", "wave")
        else:
            resource_type = ResourceType()

        return resource_type

class ResourceFactoryBase:
    """Resource factory base."""

    def create_instance_from_file(self, filename: str):
        """Create resource type from file type."""
        resource_type = ResourceType.from_file(filename)
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
        self.meta = []

    def set_package(self, package: 'ResourcePackage'):
        """Attach resource package reference."""
        self.package = package

    def get_config(self, name: str, default_value: Any):
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

    def add_meta(self, key: str, value: int, bits: int = 8):
        """Store meta information as key/value/size tuple."""
        if not bits: bits = 8
        attribute = (key, value, bits)
        self.meta.append(attribute)

    def has_meta(self):
        return self.meta and len(self.meta) > 0

    def meta_to_string(self, formatter: BaseFormatter):
        if not self.meta or len(self.meta) == 0: return ""

        s = ""

        s += '\n'
        s += formatter.comment_line() + "\n"
        s += formatter.comment("Type:         Meta Data\n")
        s += formatter.comment_line() + "\n"

        for attribute in self.meta:
            s += formatter.constant(attribute[0], attribute[1], attribute[2])

        return s

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
        """Read configuration."""
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

    def get_config(self, name: str, default_value: Any):
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
            s += resource.meta_to_string(formatter)
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

    def compile(self, inputs: 'list[str]',
                output: Optional[str],
                factory: ResourceFactoryBase,
                format_str: Optional[str],
                config_file: Optional[str]) -> Optional[CompileError]:
        """Compile resources and generate output using given formatter."""

        try:
            formatter: BaseFormatter = FormatterFactory.create_instance(format_str)
        except TypeError as err:
            return err

        resources = self.resources
        resources.set_name(output)

        err = resources.read_config(config_file)
        if err:
            return err

        for filename in inputs:
            resource = factory.create_instance_from_file(filename)
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
