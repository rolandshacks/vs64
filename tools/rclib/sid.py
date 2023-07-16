"""SID music resource."""

from typing import Optional

from .resource import Resource, ResourceType, CompileError
from .formatter import BaseFormatter

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

        self.add_meta(self.identifier + "_load_address", self.load_address, 'x16')
        self.add_meta(self.identifier + "_init_address", self.init_address, 'x16')
        self.add_meta(self.identifier + "_play_address", self.play_address, 'x16')
        self.add_meta(self.identifier + "_num_songs", self.num_songs, 'i16')
        self.add_meta(self.identifier + "_start_song", self.start_song)

        return None

    def to_string(self, formatter: BaseFormatter,
                  ofs: Optional[int]=None,
                  sz: Optional[int]=None,
                  _name_: Optional[str]=None):
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
