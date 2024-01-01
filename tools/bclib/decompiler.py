"""Decompiler."""

import os

from typing import Optional

from .constants import Constants
from .common import CompileError, CompileOptions, CompileHelper

#############################################################################
# Basic De-Compiler
#############################################################################

class BasicDecompiler:
    """Basic decompiler."""

    def __init__(self, options: CompileOptions):
        """Constructor."""
        self.options = options

    def unpack(
        self,
        inputs: "list[str]",
        output: Optional[str],
    ) -> Optional[CompileError]:
        """Unpacking program files."""

        output_buffer = ""

        for filename in inputs:
            abs_filename = os.path.abspath(filename)
            err, data = self.unpack_file(abs_filename)
            if err: return err
            if data: output_buffer += data

        err = CompileHelper.write_textfile(output, output_buffer)
        if err: return err

        return None

    def unpack_file(self, filename: str) -> (Optional[CompileError], str):
        """Unpacking program file."""

        lower_case = True

        pretty = self.options.pretty

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

        space_char = ' '

        char_type_none = -1
        char_type_space = 0
        char_type_special = 1
        char_type_code = 2
        char_type_operator = 3

        while count > 0:

            if count < 2: break
            #next_line_addr = data[ofs] + (data[ofs+1]<<8)
            ofs += 2
            count -= 2

            if count < 2: break
            line_number = data[ofs] + (data[ofs+1]<<8)
            output_buffer += f"{line_number}"
            if not pretty: output_buffer += space_char
            ofs += 2
            count -= 2

            last_char_type = char_type_none

            while count > 0:
                b = data[ofs]&0xff
                ofs += 1
                count -= 1

                if b == 0: # end of line
                    output_buffer += "\n"
                    break

                elif b >= 0x80 or b in (100, 34, 58, 40, 41):

                    next_char_type = char_type_special

                    if b >= 0x80:
                        # BASIC tokens

                        token = tokens[b-0x80]

                        if b in (170, 171, 172, 173, 174, 177, 178, 179):
                            # operators +-*/()...
                            output_buffer += token
                            next_char_type = char_type_operator

                        else:
                            # command token
                            if pretty and last_char_type == char_type_none:
                                output_buffer += space_char

                            output_buffer += token.lower() if lower_case else token
                            if b == 0x8F: # REM
                                while count and (data[ofs]&0xff) != 0:
                                    output_buffer += self.from_petscii(data[ofs], lower_case)
                                    ofs += 1
                                    count -= 1

                    elif b == 100:
                        # TSB tokens

                        if count < 1: break
                        b2 = data[ofs]&0xff
                        ofs += 1
                        count -= 1

                        # map BASIC extension tokens (3c<-b3, 3d<-b2, 3e<-b1)
                        if b2 >= 0xb1 and b2 <= 0xb3: b2 ^= 0x8f
                        token = tcb_tokens[b2-1]

                        if pretty and last_char_type == char_type_none:
                            output_buffer += space_char

                        output_buffer += token.lower() if lower_case else token

                        # append '(' to 'AT' token
                        if b2 == 40:
                            output_buffer += "("
                            next_char_type = char_type_operator

                    elif b == 34: # '"'

                        if pretty and last_char_type != char_type_space and last_char_type != char_type_operator:
                            output_buffer += space_char

                        output_buffer += chr(b)
                        while count > 0 and (data[ofs]&0xff) != 34 and (data[ofs]&0xff) != 0:
                            output_buffer += self.from_petscii(data[ofs], lower_case)
                            ofs += 1
                            count -= 1
                        if count > 0 and (data[ofs]&0xff) == 34:
                            output_buffer += chr(data[ofs])
                            ofs += 1
                            count -= 1

                    elif b == 40 or b == 41: # '('
                        output_buffer += chr(b)
                        next_char_type = char_type_operator

                    elif b == 58: # ':'
                        if pretty and last_char_type != char_type_space:
                            output_buffer += space_char

                        output_buffer += chr(b)
                        next_char_type = char_type_none

                    last_char_type = next_char_type

                elif b == 32: # space
                    if not pretty or last_char_type != char_type_space:
                        output_buffer += space_char
                        last_char_type = char_type_space

                elif b in (61, 43, 45):
                    output_buffer += chr(b)
                    last_char_type = char_type_code

                else:
                    if pretty and last_char_type == char_type_none:
                        output_buffer += space_char

                    output_buffer += self.from_petscii(b, lower_case)
                    last_char_type = char_type_code

        return (None, output_buffer)

    def from_petscii(self, c, lower_case):
        """Convert PETSCII to text."""
        if c >= 65 and c <= 90 and lower_case:
            c += 32
        elif c >= 97 and c <= 122 and lower_case:
            c -= 32
        elif c >= 193 and c <= 218:
            c -= 128
        return chr(c)
