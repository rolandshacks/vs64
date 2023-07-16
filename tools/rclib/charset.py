"""Charset resource."""

from typing import Optional

from .resource import Resource, ResourceType, CompileError, has_bit
from .formatter import BaseFormatter

class CharsetResource(Resource):
    """Charset resource."""

    def __init__(self, filename: str, resource_type: ResourceType):
        super().__init__(filename, resource_type)

        self.charset_data = None
        self.type_info = None
        self.editor_info = None
        self.display_mode = None
        self.charset_attribs = None
        self.charset_colors = None
        self.map_data = None
        self.map_width = None
        self.map_height = None
        self.col_background = None
        self.col_multi1 = None
        self.col_multi2 = None
        self.foreground = None
        self.col_method = 0

    def parse(self) -> Optional[CompileError]:
        """Parset resource data."""
        err = super().parse()
        if err: return err
        return None

    def to_string(self,
                  formatter: BaseFormatter,
                  ofs: Optional[int]=None,
                  sz: Optional[int]=None,
                  _name_: Optional[str]=None):
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

        palette = f"bg={self.col_background}, mc1={self.col_multi1}, mc2={self.col_multi2}, fg={self.col_foreground}"
        s += formatter.comment(f"Palette:      {{{palette}}}\n")

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
            self.col_method = self.read_byte()
            flags = self.read_byte()

            self.col_background = self.read_byte() & 0xf
            self.col_multi1 = self.read_byte() & 0xf
            self.col_multi2 = self.read_byte() & 0xf
            self.col_foreground = self.read_byte() & 0xf

            col_matrixbase0 = self.read_byte() & 0xf
            col_matrixbase1 = self.read_byte() & 0xf
            col_matrixbase2 = self.read_byte() & 0xf

        else:

            self.col_background = self.read_byte() & 0xf
            self.col_multi1 = self.read_byte() & 0xf
            self.col_multi2 = self.read_byte() & 0xf
            self.col_foreground = self.read_byte() & 0xf
            col_globalcolor = self.read_byte() & 0xf

            self.col_method = self.read_byte()
            self.display_mode = self.read_byte()
            flags = self.read_byte()

        tiles_used = has_bit(flags, 0)

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

        if self.col_method == 2:

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

            if self.col_method == 1:

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

        #### store meta data

        num_chars = len(self.charset_data) >> 3

        self.add_meta(self.identifier + "_char_count", num_chars)
        self.add_meta(self.identifier + "_display_mode", self.display_mode)
        self.add_meta(self.identifier + "_col_background", self.col_background)
        self.add_meta(self.identifier + "_col_multi1", self.col_multi1)
        self.add_meta(self.identifier + "_col_multi2", self.col_multi2)
        self.add_meta(self.identifier + "_col_foreground", self.col_foreground)
        self.add_meta(self.identifier + "_col_method", self.col_method)
        self.add_meta(self.identifier + "_map_width", self.map_width, 'i16')
        self.add_meta(self.identifier + "_map_height", self.map_height, 'i16')

        return None
