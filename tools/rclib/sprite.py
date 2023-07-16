"""Sprite resource."""

from typing import Optional

import json

from .resource import Resource, ResourceElement, ResourceType, CompileError
from .formatter import BaseFormatter, OutputFormat

class Sprite(ResourceElement):
    """Sprite."""

    def __init__(self):
        super().__init__()
        self.palette = None
        self.flags = 0
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

        self.sprites = []
        self.type_info = None
        self.editor_info = None
        self.palette = None
        self.col_background = 0
        self.col_multi1 = 0
        self.col_multi2 = 0

    def parse(self) -> Optional[CompileError]:
        """Parset resource data."""
        err = super().parse()
        if err: return err

        return None

    def to_string(self,
                  formatter: BaseFormatter,
                  ofs: Optional[int]=None,
                  sz: Optional[int]=None,
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
            s += formatter.comment(f"Color:        {sprite.color}\n")
            s += formatter.comment(f"Palette:      {{{self.palette}}} (screen, multicolor 1, multicolor 2)\n")
            s += formatter.comment(f"Multicolor:   {sprite.multicolor}\n")
            s += formatter.comment(f"Double X:     {sprite.double_x}\n")
            s += formatter.comment(f"Double Y:     {sprite.double_y}\n")
            s += formatter.comment(f"Overlay:      {sprite.overlay}\n")
            s += formatter.comment(f"Flags:        %{sprite.flags:08b} (MYXOCCCC: stored in data byte 64)\n")

            s += formatter.comment_line() + "\n"

            scale = 1 if sprite.multicolor else 0

            continued = (idx < len(self.sprites) - 1)

            if formatter.format == OutputFormat.ASM:
                s += formatter.label(sprite.identifier) + "\n"

            s += formatter.binary(sprite.data, None, None, bits_per_pixel, scale, 3, continued)

            if formatter.format == OutputFormat.ASM:
                s += formatter.label(sprite.identifier + "_end") + "\n"

            s += '\n'
            idx += 1

        s += formatter.bytearray_end.format(self.identifier, data_size) + '\n'
        s += formatter.byte_array_size(self.identifier, data_size)

        """
        color_table = bytearray()
        flag_table = bytearray()
        for sprite in self.sprites:
            color_table.append(sprite.color)
            flag_table.append(sprite.flags)

        s += '\n'
        s += formatter.comment_line() + "\n"
        s += formatter.comment("Type:         Color Table\n")
        s += formatter.comment_line() + "\n"
        s += formatter.byte_array(self.identifier + "_color_table", color_table)

        s += '\n'
        s += formatter.comment_line() + "\n"
        s += formatter.comment("Type:         Flag Table\n")
        s += formatter.comment_line() + "\n"
        s += formatter.byte_array(self.identifier + "_flag_table", flag_table)
        """

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

        self.col_background = colors['0'] if len(colors) >= 1 else 0
        self.col_multi1 = colors['2'] if len(colors) >= 2 else 0
        self.col_multi1 = colors['3'] if len(colors) >= 3 else 0

        #### store meta data

        self.add_meta(self.identifier + "_sprite_count", len(sprites))
        self.add_meta(self.identifier + "_col_background", self.col_background)
        self.add_meta(self.identifier + "_col_multi1", self.col_multi1)
        self.add_meta(self.identifier + "_col_multi2", self.col_multi2)

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

        #sprite_animation_quantity = 0
        #sprite_overlay_distance = 0
        #tile_quantity = 0
        #tile_animation_quantity = 0
        #tile_width = 0
        #tile_height = 0
        #tile_overlay_distance = 0

        format_version = 0
        content_flags = 0x0

        magic = chr(self.read_byte()) + chr(self.read_byte()) + chr(self.read_byte())
        if magic != "SPD":
            self.read_reset()
        else:
            format_version = self.read_byte()
            if format_version < 1 or format_version > 5:
                return CompileError(self, "unsupported spritepad file format version")

            content_flags = self.read_byte() if format_version >= 2 else 0x0

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

        self.col_background = self.read_byte() & 0xf
        self.col_multi1 = self.read_byte() & 0xf
        self.col_multi2 = self.read_byte() & 0xf
        self.palette = f"{self.col_background}, {self.col_multi1}, {self.col_multi2}"

        self.add_meta(self.identifier + "_col_background", self.col_background)
        self.add_meta(self.identifier + "_col_multi1", self.col_multi1)
        self.add_meta(self.identifier + "_col_multi2", self.col_multi2)

        self.sprites = []

        while sprite_quantity == 0 or len(self.sprites) < sprite_quantity:
            if sprite_quantity == 0 and self.input_avail < 64: break

            idx = len(self.sprites)

            sprite = Sprite()

            sprite.name = f"sprite{idx}"
            sprite.identifier = self.package.get_unique_id(self.filename, sprite.name)

            sprite.data = self.read_bytearray(63)

            content_flags = self.read_byte()
            sprite.color = (content_flags & 0x0f)
            sprite.multicolor = (content_flags & 0x80) != 0
            sprite.double_y = (content_flags & 0x40) != 0
            sprite.double_x = (content_flags & 0x20) != 0
            sprite.overlay = (content_flags & 0x10) != 0

            sprite.flags = sprite.color & 0x0f
            if sprite.multicolor: sprite.flags |= 0x80
            if sprite.double_y: sprite.flags |= 0x40
            if sprite.double_x: sprite.flags |= 0x20
            if sprite.overlay: sprite.flags |= 0x10

            sprite.data.append(sprite.flags)

            self.sprites.append(sprite)

        self.add_meta(self.identifier + "_sprite_count", len(self.sprites))

        version_label = f"Pro Version, Format {format_version}" if format_version > 0 else "Free Version"
        self.type_info = f"SpritePad Data ({version_label})"
        self.editor_info = "https://subchristsoftware.itch.io/spritepad-c64-pro"


        return None
