"""Wave resources."""

from typing import Optional

import math

from .resource import Resource, ResourceType, CompileError
from .formatter import BaseFormatter

from .constants import Constants

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

    def db_to_linear(self, db):
        """Convert dB to linear value."""
        return math.pow(10.0, db / 20.0)

    def linear_to_db(self, lin):
         """Convert linear value to dB."""
         if lin <= 0.0: return -99999.99999
         return 20.0 * math.log10(lin)

    def parse(self) -> Optional[CompileError]:
        """Parset resource data."""
        err = super().parse()
        if err: return err

        default_target_loudness_db = -9.5 # dB

        target_sample_rate = self.get_config('sampleFrequency', Constants.DEFAULT_SAMPLE_FREQUENCY)
        target_bits_per_sample = self.get_config('sampleBits', Constants.DEFAULT_SAMPLE_BITS)

        target_loudness_db = self.get_config('sampleLoudness', default_target_loudness_db)
        target_loudness = self.db_to_linear(target_loudness_db)

        target_normalization_max_factor = self.get_config('sampleNormalizationMax', 15.0)

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
        loudness_rms_count = 0
        loudness_rms_slice = sample_rate * 0.15 # 150ms slices
        loudness_rms_list = []

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
            loudness_rms_count += 1
            if loudness_rms_slice > 0 and loudness_rms_count >= loudness_rms_slice:
                loudness_rms_list.append(loudness_rms / loudness_rms_count)
                loudness_rms = 0.0
                loudness_rms_count = 0

            logical_data.append(s)

            if len(logical_data) >= target_max_output_size:
                break

            sample_ofs += sample_step


        if loudness_rms_count > 64:
            # store remainders
            loudness_rms_list.append(loudness_rms / loudness_rms_count)

        loudness_rms_list.sort(reverse=True)

        loudness_rms = 0.0
        loudness_rms_part = 0.25
        loudness_rms_part_percent = int(loudness_rms_part * 100.0)
        loudness_rms_relevant = min(len(loudness_rms_list), max(1, int(len(loudness_rms_list) * loudness_rms_part)))
        for idx in range(0, loudness_rms_relevant):
            loudness_rms += loudness_rms_list[idx]

        if loudness_rms_relevant > 0: loudness_rms /= loudness_rms_relevant
        if loudness_rms > 0.0: loudness_rms = math.sqrt(loudness_rms)

        if target_normalization_max_factor:
            normalization_factor = min(target_normalization_max_factor, target_loudness / max(0.005, loudness_rms))
        else:
            normalization_factor = target_loudness / max(0.005, loudness_rms)

        loudness_rms_db = self.linear_to_db(loudness_rms)

        target_loudness_db = self.linear_to_db(target_loudness)

        print(f"{loudness_rms_part_percent}% peak RMS loudness of source PCM data: {loudness_rms:0.2f} / {loudness_rms_db:0.4f}dB")
        print(f"normalization factor: {normalization_factor:0.2f}, target RMS loudness: {target_loudness_db:0.4f}dB")

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

        self.add_meta(self.identifier + "_sample_bits", self.sample_bits)
        self.add_meta(self.identifier + "_sample_rate", self.sample_rate, 'i16')

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
        s += formatter.comment(f"Data size:        {self.sample_count} bytes ({formatter.format_hexnumber(self.sample_count)})\n")
        s += formatter.comment_line() + "\n"

        s += formatter.byte_array(self.identifier, self.sample_data, 0, self.sample_count)

        return s


def clamp(value, min_value, max_value):
    """Clamp value"""
    return max(min_value, min(value, max_value))
