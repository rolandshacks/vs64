"""Bitmap resource."""

from typing import Optional
from pypng import png

from .resource import Resource, ResourceType, CompileError
from .formatter import BaseFormatter

from .constants import Constants

DITHERING_THRESHOLD = 0         # min error value to start diffusion
DEBUG_SAVE_TO_PNG = False       # render data to png file like C64 would do for debugging

"""Predefined C64 reference palette."""
c64_palette = [
    0x000000, # Black
    0xffffff, # White
    0x8A323D, # Red
    0x67BFB3, # Cyan
    0x8D36A1, # Purple
    0x4BA648, # Green
    0x322DAB, # Blue
    0xCDD256, # Yellow
    0x8E501A, # Orange
    0x523D01, # Brown
    0xBC636E, # Light Red
    0x4E4E4E, # Dark Grey
    0x767676, # Medium Grey
    0x8EE98B, # Light Green
    0x6B66E4, # Light Blue
    0xA3A3A3  # Light Grey
]

"""Global color table."""
color_table = []

def split_rgb(rgb):
    """Split rgb integer into color components."""
    r = (int) ((rgb>>16)&0xff)
    g = (int) ((rgb>>8)&0xff)
    b = (int) (rgb&0xff)
    return r,g,b

def build_color_table():
    """Create color table from given palette."""
    for rgb in c64_palette:
        r,g,b = split_rgb(rgb)
        color_table.append( [ r, g, b ] )

def color_distance(r1, g1, b1, r2, g2, b2) -> float:
    """Calculate euclidian distance between rgb."""
    diff_red = r2 - r1
    diff_green = g2 - g1
    diff_blue = b2 - b1
    distance = 0.3 * diff_red*diff_red + 0.59 * diff_green * diff_green + 0.11 * diff_blue * diff_blue
    # please notice: not returning sqrt(distance) because absolute value is not relevant
    return distance

def map_to_color_table(r, g, b, colors=None):
    """Map rgb value to color table index."""
    if not colors:
        if not color_table or len(color_table) == 0:
            build_color_table()
        colors = color_table

    idx = 0
    min_idx = 0
    min_distance = -1
    for col in colors:
        distance = color_distance(col[0], col[1], col[2], r, g, b)
        if min_distance == -1 or distance < min_distance:
            min_distance = distance
            min_idx = idx
        idx += 1

    return min_idx

class Bitmap:
    """Bitmap class."""
    def __init__(self, width, height, bits_per_pixel):
        self.width = width
        self.height = height
        self.bits_per_pixel = bits_per_pixel
        self.bytes_per_pixel = (int) ((self.bits_per_pixel + 7) / 8)
        self.bytes_per_line = self.width * self.bytes_per_pixel
        self.size = self.height * self.bytes_per_line
        self.background_color = 0

    @staticmethod
    def clone(bitmap):
        """"Clone bitmap."""

        bmp = Bitmap(bitmap.width, bitmap.height, bitmap.bits_per_pixel)
        bmp.background_color = bitmap.background_color

        if bitmap.pixels:
            bmp.pixels = bitmap.pixels.copy()

        return bmp


    def create_mapping_table(self, png_palette):
        """Create mapping from image palette to c64 palette."""
        palette_mapping_table = []
        for palette_entry in png_palette:
            pixel = map_to_color_table(palette_entry[0], palette_entry[1], palette_entry[2])
            palette_mapping_table.append(pixel)

        return palette_mapping_table

    def get_pixel(self, x, y):
        """Get pixel from bitmap."""
        if x < 0 or x >= self.width or y < 0 or y >= self.height:
            if self.bytes_per_pixel == 1:
                return 0
            elif self.bytes_per_pixel == 2:
                return [ 0, 0 ]
            elif self.bytes_per_pixel == 3:
                return [ 0, 0, 0 ]
            elif self.bytes_per_pixel == 4:
                return [ 0, 0, 0, 0 ]

        ofs = y * self.bytes_per_line + x * self.bytes_per_pixel

        if self.bytes_per_pixel == 1:
            return self.pixels[ofs]
        elif self.bytes_per_pixel == 2:
            return [ self.pixels[ofs+0], self.pixels[ofs+1] ]
        elif self.bytes_per_pixel == 3:
            return [ self.pixels[ofs+0], self.pixels[ofs+1], self.pixels[ofs+2] ]
        elif self.bytes_per_pixel == 4:
            return [ self.pixels[ofs+0], self.pixels[ofs+1], self.pixels[ofs+2], self.pixels[ofs+3] ]

        return 0

    def set_pixel(self, x, y, pixel):
        if x < 0 or x >= self.width or y < 0 or y >= self.height:
            return

        ofs = y * self.bytes_per_line + x * self.bytes_per_pixel

        if self.bytes_per_pixel == 1:
            self.pixels[ofs] = pixel
        elif self.bytes_per_pixel == 2:
            self.pixels[ofs+0] = pixel[0]
            self.pixels[ofs+1] = pixel[1]
        elif self.bytes_per_pixel == 3:
            self.pixels[ofs+0] = pixel[0]
            self.pixels[ofs+1] = pixel[1]
            self.pixels[ofs+2] = pixel[2]
        elif self.bytes_per_pixel == 4:
            self.pixels[ofs+0] = pixel[0]
            self.pixels[ofs+1] = pixel[1]
            self.pixels[ofs+2] = pixel[2]
            self.pixels[ofs+3] = pixel[3]

    def create_from_png(self, png_data, png_info, dither=False):
        """Create bitmap from existing png data."""

        png_width = png_info["size"][0]
        png_height = png_info["size"][1]
        png_bytes_per_pixel = png_info["planes"]
        png_bits_per_pixel = (int) (png_bytes_per_pixel * 8)
        #png_has_alpha = png_info["alpha"]
        png_palette = None
        if "palette" in png_info:
            png_palette = png_info["palette"]

        if self.bits_per_pixel >= 24:
            # create 24-bit RGB color bitmap

            pixels = bytearray()

            for y in range(0, self.height):
                src_y = (int)((y * png_height) / self.height)
                row = png_data[src_y]
                for x in range(0, self.width):
                    src_x = (int)((x * png_width) / self.width)
                    ofs = src_x * png_bytes_per_pixel

                    if png_palette:
                        index = row[ofs]
                        pixel = png_palette[index]

                    else:
                        if png_bits_per_pixel >= 24:
                            pixel = [ row[ofs+0], row[ofs+1], row[ofs+2] ]
                        elif 8 == png_bits_per_pixel:
                            val = row[ofs]
                            pixel = [ val, val, val ]
                        elif 1 == png_bits_per_pixel:
                            val = 0xff if row[ofs] != 0 else 0x0
                            pixel = [ val, val, val ]

                    pixels.append(pixel[0])
                    pixels.append(pixel[1])
                    pixels.append(pixel[2])
                    if self.bits_per_pixel == 32: pixels.append(0xff)

            self.pixels = pixels

        else:
            # create 4-bit/16-color bitmap

            if not dither:

                pixels = bytearray()

                palette_mapping_table = self.create_mapping_table(png_palette) if png_palette else []
                global_counters = dict()

                for y in range(0, self.height):
                    src_y = (int)((y * png_height) / self.height)
                    row = png_data[src_y]
                    for x in range(0, self.width):
                        src_x = (int)((x * png_width) / self.width)
                        ofs = src_x * png_bytes_per_pixel

                        pixel = 0x0

                        if png_palette:
                            index = row[ofs]
                            if index < 0 or index >= len(palette_mapping_table): index = 0
                            pixel = palette_mapping_table[index]

                        else:
                            if png_bits_per_pixel >= 24:
                                pixel = map_to_color_table(row[ofs+0], row[ofs+1], row[ofs+2])
                            elif 8 == png_bits_per_pixel or 4 == png_bits_per_pixel or 2 == png_bits_per_pixel:
                                pixel = row[ofs] & 0x0f
                            elif 1 == png_bits_per_pixel:
                                pixel = 1 if row[ofs] >= 128 else 0

                        pixels.append(pixel)

                        count = global_counters.get(pixel)
                        if count is None: count = 0
                        global_counters[pixel] = count + 1

                sorted_global_counters = sorted(global_counters.items(), key=lambda x:x[1], reverse=True)
                sorted_global_colors = dict(sorted_global_counters)
                global_indexes = list(sorted_global_colors.keys())
                self.background_color = global_indexes[0] if len(global_indexes) > 0 else 0

                self.pixels = pixels

            else:
                rgb_bitmap = Bitmap(self.width, self.height, 24)
                rgb_bitmap.create_from_png(png_data, png_info, False)
                rgb_bitmap.dither()
                self.create_from_rgb(rgb_bitmap.pixels)

    def create_from_rgb(self, rgb_data):
        """Create bitmap from existing png data."""

        rgb_bytes_per_pixel = 3
        rgb_bits_per_pixel = (int) (rgb_bytes_per_pixel * 8)
        rgb_bytes_per_line = self.width * rgb_bytes_per_pixel

        pixels = bytearray()

        # convert 24-bit to 4-bit/16-color bitmap

        global_counters = dict()

        for y in range(0, self.height):
            line_ofs = y * rgb_bytes_per_line

            for x in range(0, self.width):
                ofs = line_ofs + x * rgb_bytes_per_pixel
                pixel = 0x0

                if rgb_bits_per_pixel >= 24:
                    pixel = map_to_color_table(rgb_data[ofs+0], rgb_data[ofs+1], rgb_data[ofs+2])
                elif 8 == rgb_bits_per_pixel or 4 == rgb_bits_per_pixel or 2 == rgb_bits_per_pixel:
                    pixel = rgb_data[ofs] & 0x0f
                elif 1 == rgb_bits_per_pixel:
                    pixel = 1 if rgb_data[ofs] >= 128 else 0

                pixels.append(pixel)

                count = global_counters.get(pixel)
                if count is None: count = 0
                global_counters[pixel] = count + 1

            sorted_global_counters = sorted(global_counters.items(), key=lambda x:x[1], reverse=True)
            sorted_global_colors = dict(sorted_global_counters)
            global_indexes = list(sorted_global_colors.keys())
            self.background_color = global_indexes[0] if len(global_indexes) > 0 else 0

        self.pixels = pixels

    def dither(self):
        """Perform dithering."""
        if self.bits_per_pixel != 24: return

        for y in range(0, self.height):
            for x in range(0, self.width):
                old_pixel = self.get_pixel(x, y)
                best_match_idx = map_to_color_table(old_pixel[0], old_pixel[1], old_pixel[2])
                new_pixel = color_table[best_match_idx]

                self.set_pixel(x, y, new_pixel)

                e = [
                    (old_pixel[0] - new_pixel[0]),
                    (old_pixel[1] - new_pixel[1]),
                    (old_pixel[2] - new_pixel[2])
                ]

                if DITHERING_THRESHOLD > 1:
                    if abs(e[0] < DITHERING_THRESHOLD): e[0] = 0
                    if abs(e[1] < DITHERING_THRESHOLD): e[1] = 0
                    if abs(e[2] < DITHERING_THRESHOLD): e[2] = 0

                self.adjust_pixel(x+1, y  , e, 7.0/16.0)
                self.adjust_pixel(x-1, y+1, e, 3.0/16.0)
                self.adjust_pixel(x  , y+1, e, 5.0/16.0)
                self.adjust_pixel(x+1, y+1, e, 1.0/16.0)

    def adjust_pixel(self, x, y, e, ratio):
        """Adjust pixel in bitmap memory."""
        if self.bits_per_pixel != 24: return
        if x < 0 or x >= self.width or y < 0 or y >= self.height: return

        ofs = y * self.bytes_per_line + x * self.bytes_per_pixel

        bleed_factor = 1.0

        ratio *= bleed_factor

        self.pixels[ofs+0] = add_b(self.pixels[ofs+0], e[0] * ratio)
        self.pixels[ofs+1] = add_b(self.pixels[ofs+1], e[1] * ratio)
        self.pixels[ofs+2] = add_b(self.pixels[ofs+2], e[2] * ratio)


def add_b(a, b):
    """Add byte values with clamping."""
    c = (int) (a + b)
    if c < 0: return 0
    if c > 255: return 255
    return c

class BitmapResource(Resource):
    """Bitmap resource."""

    def __init__(self, filename: str, resource_type: ResourceType):
        super().__init__(filename, resource_type)

    def parse(self) -> Optional[CompileError]:
        """Parset resource data."""
        err = super().parse()
        if err: return err

        self.width = 0
        self.height = 0
        self.bits_per_pixel = 0
        self.background_color = 0

        self.bitmap = None
        self.screen = None
        self.colors = None

        if self.resource_type.equals("bitmap.koala"):
            err = self.parse_koala()
        else:
            err = self.parse_png()
        if err: return err

        self.add_meta(self.identifier + "_width", self.width, 'i16')
        self.add_meta(self.identifier + "_height", self.height, 'i16')
        self.add_meta(self.identifier + "_bits_per_pixel", 2)
        self.add_meta(self.identifier + "_bits_per_color", 4)
        self.add_meta(self.identifier + "_col_background", self.background_color)

        return None


    def parse_koala(self)  -> Optional[CompileError]:
        """Parse Koala image format."""

        if self.input_size < 10003:
            return CompileError(self, "invalid koala file size")

        self.read_endianness('little')

        load_address = self.read_int(2)

        bitmap_buffer = self.read_bytearray(8000)
        screen_buffer = self.read_bytearray(1000)
        color_buffer = self.read_bytearray(1000)
        background_color = self.read_byte()

        self.width = 160
        self.height = 200
        self.bits_per_pixel = 2
        self.background_color = background_color

        self.bitmap = bitmap_buffer
        self.screen = screen_buffer
        self.colors = color_buffer

        return None

    def parse_png(self) -> Optional[CompileError]:
        """"Parse PNG image."""

        if self.input_size < 1:
            return CompileError(self, "invalid png file size")

        r = png.Reader(bytes = self.input)
        width, height, row_iterator, info = r.read()

        png_data = []
        for row in row_iterator:
            png_data.append(row)

        dithering_enabled = self.get_config('bitmapDithering', Constants.BITMAP_DITHERING_ENABLED)

        self.width = self.get_config('bitmapWidth', width)
        self.height = self.get_config('bitmapHeight', height)

        bitmap = Bitmap(self.width, self.height, 2)
        bitmap.create_from_png(png_data, info, dithering_enabled)

        # mapping image in blocks of 8x8 pixels

        bitmap_buffer = []      # 2-bit per pixel (00:bg, 01:s1, 02:s2, 03:c)
        screen_buffer = []
        color_buffer = []

        block_height = 8
        block_width = 4

        for y in range(0, bitmap.height+1-block_height, block_height):
            for x in range(0, bitmap.width+1-block_width, block_width):

                counters = dict()

                pixel_block = []

                for u in range(0, block_height):
                    for v in range(0, block_width):
                        pixel = bitmap.get_pixel(x + v, y + u) & 0x0f
                        pixel_block.append(pixel)
                        if pixel != bitmap.background_color:
                            count = counters.get(pixel)
                            if count is None: count = 0
                            counters[pixel] = count + 1

                sorted_counters = sorted(counters.items(), key=lambda x:x[1], reverse=True)
                sorted_block_colors = dict(sorted_counters)
                indexes = list(sorted_block_colors.keys())

                block_color_table = []

                # store 4bit palette index to color buffer

                col0 = bitmap.background_color
                col1 = indexes[0] if len(indexes) > 0 else col0
                col2 = indexes[1] if len(indexes) > 1 else col1
                col3 = indexes[2] if len(indexes) > 2 else col2

                # lookup table inside 8x8 block
                block_color_table = [
                    color_table[col0], color_table[col1], color_table[col2], color_table[col3]
                ]

                # store 4-bit nibbles to screen and color RAM
                screen_buffer.append(((col1 & 0x0f) << 4) + (col2 & 0x0f))
                color_buffer.append(col3 & 0x0f)

                # store 2-bit color index to bitmap buffer
                byte = 0x0
                bitcount = 0
                pixel_index = 0

                for pixel in pixel_block:
                    pixel_index += 1
                    rgb = color_table[pixel]
                    index = map_to_color_table(rgb[0], rgb[1], rgb[2], block_color_table)

                    byte <<= 2
                    byte |= (index & 0x03)
                    bitcount += 2

                    if bitcount >= 8 or pixel_index >= len(pixel_block):
                        bitmap_buffer.append(byte)
                        bitcount = 0
                        byte = 0x0

        self.bits_per_pixel = 2
        self.background_color = bitmap.background_color

        self.bitmap = bitmap_buffer
        self.screen = screen_buffer
        self.colors = color_buffer

        return None

    def to_string(self, formatter: BaseFormatter,
                  ofs: Optional[int]=None,
                  sz: Optional[int]=None,
                  _name_: Optional[str]=None):
        """Convert resource data to string."""

        if DEBUG_SAVE_TO_PNG: self.to_png()

        s = ""
        s += formatter.comment_line() + "\n"
        s += formatter.comment("Type:             Bitmap Data\n")
        s += formatter.comment(f"Width:            {self.width} px\n")
        s += formatter.comment(f"Height:           {self.height} px\n")
        s += formatter.comment("Depth:            2 bits per pixel, 4 bits per color\n")
        s += formatter.comment(f"Background color: {self.background_color}\n")
        s += formatter.comment(f"Bitmap data size: {len(self.bitmap)} bytes ({formatter.format_hexnumber(len(self.bitmap))})\n")
        s += formatter.comment(f"Screen data size: {len(self.screen)} bytes ({formatter.format_hexnumber(len(self.screen))})\n")
        s += formatter.comment(f"Color data size:  {len(self.colors)} bytes ({formatter.format_hexnumber(len(self.colors))})\n")
        s += formatter.comment_line() + "\n"

        s +=  formatter.byte_array(self.identifier + "_pixels", self.bitmap, 0, len(self.bitmap))

        s += "\n"
        s += formatter.comment_line() + "\n"
        s += formatter.comment("Type:             Screen Data\n")
        s += formatter.comment_line() + "\n"

        s +=  formatter.byte_array(self.identifier + "_screen", self.screen, 0, len(self.screen))

        s += "\n"
        s += formatter.comment_line() + "\n"
        s += formatter.comment("Type:             Color Data\n")
        s += formatter.comment_line() + "\n"

        s +=  formatter.byte_array(self.identifier + "_colors", self.colors, 0, len(self.colors))

        return s

    def to_png(self):
        """Export resource data to PNG bitmap."""

        bg = self.background_color

        if not color_table:
            build_color_table()

        bg_col = color_table[bg]

        rows = []

        ofs = 0

        width_factor = 1

        bits_per_pixel = 24
        bytes_per_pixel = (int) (bits_per_pixel / 8)
        bytes_per_line = (int) (self.width * bytes_per_pixel) * width_factor
        blocks_per_line = (int) (self.width / 4)
        bytes_per_block_line = blocks_per_line * 8

        for y in range(0, self.height):
            row = [ 0x0 ] * bytes_per_line
            rows.append(row)

        for y in range(0, self.height):
            row = rows[y]

            block_y = (int) (y / 8)

            line_ofs = block_y * bytes_per_block_line
            col_line_ofs = block_y * blocks_per_line
            screen_line_ofs = block_y * blocks_per_line

            x = 0

            for block in range(0, blocks_per_line):

                ofs = line_ofs + block * 8 + (y % 8)
                byte = self.bitmap[ofs]

                pixels = [
                    (byte & 0b11000000) >> 6,
                    (byte & 0b00110000) >> 4,
                    (byte & 0b00001100) >> 2,
                    (byte & 0b00000011)
                ]

                screen_ofs = screen_line_ofs + block
                col_ofs = col_line_ofs + block

                col1 = (self.screen[screen_ofs] & 0xf0) >> 4
                col2 = (self.screen[screen_ofs] & 0x0f)
                col3 = self.colors[col_ofs] & 0x0f

                block_colors = [
                     bg_col,
                     color_table[col1],
                     color_table[col2],
                     color_table[col3]
                ]

                for pixel in pixels:
                    col = block_colors[pixel]

                    for i in range(0, width_factor):
                        row[x+0] = (col[0])
                        row[x+1] = (col[1])
                        row[x+2] = (col[2])
                        x += bytes_per_pixel

        f = open('rc_debug.png', 'wb')
        w = png.Writer(self.width * width_factor, self.height, planes=24, greyscale=False)
        w.write(f, rows)
        f.close()
