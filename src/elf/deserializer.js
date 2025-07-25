//
// Elf Deserializer
//


//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { ElfConstants, DwarfFormCodes } = require('elf/types');

//-----------------------------------------------------------------------------------------------//
// ElfDeserializer
//-----------------------------------------------------------------------------------------------//

class ElfDeserializer {
    constructor(data, ofs, params) {
        this._data = data;
        this._params = params || {};
        this._format = ElfConstants.FormatElf32;
        this._ofs = ofs || 0;
        this._length = data.length;
        this._msb = false;
    }

    get buffer() {
        return this._data;
    }

    get ofs() {
        return this._ofs;
    }

    get length() {
        return this._length;
    }

    get format() {
        return this._format;
    }

    setFormat(elfFormat) {
        this._format = elfFormat;
    }

    reset() {
        this._ofs = 0;
    }

    setOffset(ofs) {
        if (ofs < 0 || ofs > this._length) {
            throw("index out of bounds");
        }
        this._ofs = ofs;
    }

    skip(step) {
        step ||= 1;
        this.assertAvailable(step);
        this._ofs += step;
    }

    #inc(step) {
        this._ofs += (step ? step : 1);
    }

    setLsb() {
        this._msb = false;
    }

    setMsb() {
        this._msb = true;
    }

    assertAvailable(numBytes) {
        numBytes ||= 1;
        if (this._ofs + numBytes > this._length) {
            throw("index beyond end of data");
        }
    }

    eof(bytesAhead) {
        bytesAhead ||= 0
        return (this._ofs + bytesAhead > this._length);
    }

    readOffs() {
        return this.#readFormatDependent();
    }

    readAddr() {
        return this.#readFormatDependent();
    }

    readSize() {
        return this.#readFormatDependent();
    }

    #readFormatDependent() {
        return (this._format == ElfConstants.FormatElf64) ?
            this.read64() : this.read32();
    }

    readRaw(sz) {
        this.assertAvailable(sz);

        const data = this._data;
        const ofs = this._ofs;
        const v = data.subarray(ofs, ofs+sz);
        this.#inc(sz);

        return v;
    }

    read128() {
        return this.readRaw(16);
    }

    read64() {
        this.assertAvailable(8);

        const _data_ = this._data;
        const _ofs_ = this._ofs;

        const a = this.read32();
        const b = this.read32();

        let v;

        if (this._msb) {
            v = (a << 32) | b;
        } else {
            v = (b << 32) | a;
        }

        //(this._msb) ? data.readBigInt64BE(ofs) : data.readBigInt64LE(ofs);
        //this.#inc(8);

        return v;
    }

    read32() {
        this.assertAvailable(4);

        const data = this._data;
        const ofs = this._ofs;
        const v = (this._msb) ? data.readUInt32BE(ofs) : data.readUInt32LE(ofs);
        this.#inc(4);

        return v;
    }

    read16() {
        this.assertAvailable(2);

        const data = this._data;
        const ofs = this._ofs;
        const v = (this._msb) ?
        data.readUInt16BE(ofs) : data.readUInt16LE(ofs);
        this.#inc(2);

        return v;
    }

    read8() {
        this.assertAvailable();

        const data = this._data;
        const ofs = this._ofs;
        const v = (data[ofs]&0xff);
        this.#inc(1);

        return v;
    }

    read8s() {
        let v = this.read8();
        if (v >= 128) v -= 256;
        return v;
    }

    read(size) {
        size ||= 1;

        this.assertAvailable();

        if (1 == size) return this.read8();
        if (2 == size) return this.read16();
        if (4 == size) return this.read32();
        if (8 == size) return this.read64();
        if (16 == size) return this.read128();

        return this.readRaw(size);
    }

    readDwarfUnitHeader() {
        const unitHeader = {};

        let initialLengthField = this.read32();

        // dynamic support for 32bit and 64bit
        if (initialLengthField == 0xffffffff) {
            unitHeader.format = ElfConstants.FormatElf64;
            unitHeader.unitLength = this.read64();
        } else {
            unitHeader.format = ElfConstants.FormatElf32;
            if (initialLengthField < 0xfffffff0) {
                unitHeader.unitLength = initialLengthField;
            } else {
                unitHeader.unitLength = 0; // invalid
            }
        }

        unitHeader.startOfs = this._ofs;
        unitHeader.endOfs = unitHeader.startOfs + unitHeader.unitLength;

        unitHeader.version = this.read16();

        return unitHeader;
    }

    #readNext() {
        if (this.eof(1)) return null;
        const c = this._data[this._ofs]&0xff;
        this.#inc();
        return c;
    }

    readCString() {

        let s = "";

        for (;;) {
            const c = this.#readNext();
            if (c == null || c == '\0') break;
            s += String.fromCharCode(c);
        }

        return s;
    }

    /*
        Unsigned LEB128 (ULEB128) numbers are encoded as follows: start at the low
        order end of an unsigned integer and chop it into 7-bit chunks. Place each chunk
        into the low order 7 bits of a byte. Typically, several of the high order bytes will
        be zero; discard them. Emit the remaining bytes in a stream, starting with the
        low order byte; set the high order bit on each byte except the last emitted byte.
        The high bit of zero on the last byte indicates to the decoder that it has
        encountered the last byte.
        The integer zero is a special case, consisting of a single zero byte.
    */

    readLEB128() {

        this.assertAvailable();

        let result = 0;
        let shift = 0;
        let byte = 0;
        while (true) {
            byte = this.#readNext();
            if (null == byte) return 0;
            result |= (byte & 0x7f) << shift;
            shift += 7;
            if ((0x80 & byte) === 0) break;
        }

        if (shift < 32 && (byte & 0x40) !== 0) {
            result |= (~0 << shift);
        }

        return result;
    }

    readULEB128() {

        this.assertAvailable();

        let result = 0;
        let shift = 0;
        let byte = 0;
        while (true) {
            byte = this.#readNext();
            if (null == byte) return 0;
            result |= (byte & 0x7f) << shift;
            if ((0x80 & byte) === 0) break;
            shift += 7;
        }

        return result;
    }

    peek(ofs, size) {
        if (ofs != null || size != null) {
            const oldOfs = this._ofs;
            this._ofs += ofs;
            const v = this.read(size);
            this._ofs = oldOfs;
            return v;
        } else {
            if (this._ofs < 0 || this._ofs >= this._length) return null;
            return this._data[this._ofs]&0xff;
        }
    }

    peekAbs(pos, size) {
        const oldOfs = this._ofs;
        this._ofs = pos;
        const v = this.read(size);
        this._ofs = oldOfs;
        return v;
    }

    #deref(fn, ref) {
        if (!ref || !fn) return ref;
        return fn(ref);
    }

    #getArchSize() {
        return (this._format == ElfConstants.FormatElf64) ? 8 : 4;
    }

    readAttribute(formCode, params) {

        let byteSize = null;

        if (!params) params = this._params;

        switch (formCode) {

            case DwarfFormCodes.Block:
            case DwarfFormCodes.ExprLoc:
                byteSize = this.readULEB128();
                break;

            case DwarfFormCodes.Block1:
                byteSize = this.read8();
                break;

            case DwarfFormCodes.Block2:
                byteSize = this.read16();
                break;

            case DwarfFormCodes.Block4:
                byteSize = this.read32();
                break;

            case DwarfFormCodes.Address:
            case DwarfFormCodes.RefAddr:
                byteSize = params.addressSize || this.#getArchSize();
                break;

            case DwarfFormCodes.Flag:
            case DwarfFormCodes.Data1:
            case DwarfFormCodes.Ref1:
            case DwarfFormCodes.StrX1:
            case DwarfFormCodes.AddrX1:
                byteSize = 1;
                break;

            case DwarfFormCodes.Data2:
            case DwarfFormCodes.Ref2:
            case DwarfFormCodes.StrX2:
            case DwarfFormCodes.AddrX2:
                byteSize = 2;
                break;

            case DwarfFormCodes.StrX3:
                byteSize = 3;
                break;

            case DwarfFormCodes.Data4:
            case DwarfFormCodes.Ref4:
            case DwarfFormCodes.RefSup4:
            case DwarfFormCodes.StrX4:
            case DwarfFormCodes.AddrX4:
                byteSize = 4;
                break;

            case DwarfFormCodes.StrP:
            case DwarfFormCodes.LineStringRef:
            case DwarfFormCodes.SecOffset:
            case DwarfFormCodes.StrpSup:
                byteSize = this.#getArchSize();
                break;

            case DwarfFormCodes.Data8:
            case DwarfFormCodes.Ref8:
            case DwarfFormCodes.RefSig8:
            case DwarfFormCodes.RefSup8:
                byteSize = 8;
                break;

            case DwarfFormCodes.Data16:
                byteSize = 16;
                break;

            case DwarfFormCodes.FlagPresent:
                byteSize = 0;
                break;

            case DwarfFormCodes.ImplicitConst:
                // The implicit value is stored in the abbreviation
                // as a SLEB128, and there is no data in debug info.
                byteSize = 0;
                break;

            default:
                break;
        }

        let value = null;
        let ref = null;
        let ofs = null;
        let refIsAddr = false;
        let refIsRange = false;
        let refIsLoc = false;

        if (byteSize == null) {

            switch (formCode) {

                case DwarfFormCodes.String:
                    value = this.readCString();
                    break;

                case DwarfFormCodes.SData:
                    value = this.readLEB128();
                    break;

                case DwarfFormCodes.UData:
                case DwarfFormCodes.RefUdata:
                case DwarfFormCodes.Indirect:
                    value = this.readULEB128();
                    break;

                case DwarfFormCodes.StrX:
                    ofs = this.readULEB128();
                    break;

                case DwarfFormCodes.AddrX:
                    ref = this.readULEB128();
                    refIsAddr = true;
                    break;

                case DwarfFormCodes.LocListX:
                    ref = this.readULEB128();
                    refIsLoc = true;
                    break;

                case DwarfFormCodes.RngListX:
                    ref = this.readULEB128();
                    refIsRange = true;
                    break;

                default:
                    throw("unhandled form code");
            }

        } else if (byteSize == 0) {

            switch (formCode) {
                case DwarfFormCodes.FlagPresent:
                    value = true;
                    break;

                case DwarfFormCodes.ImplicitConst:
                    break;

                case DwarfFormCodes.ExprLoc:
                    // 0 bytes valid?
                    break;

                default:
                    throw("unhandled form code");
            }

        } else {
            switch (formCode) {
                case DwarfFormCodes.StrX1:
                case DwarfFormCodes.StrX2:
                case DwarfFormCodes.StrX3:
                case DwarfFormCodes.StrX4:
                    ofs = this.read(byteSize);
                    break;

                case DwarfFormCodes.StrP:
                case DwarfFormCodes.LineStringRef:
                case DwarfFormCodes.StrpSup:
                    ref = this.read(byteSize);
                    break;

                case DwarfFormCodes.SecOffset:
                    value = this.read(byteSize);
                    break;

                case DwarfFormCodes.Data1:
                case DwarfFormCodes.Data2:
                case DwarfFormCodes.Data4:
                case DwarfFormCodes.Data8:
                case DwarfFormCodes.Data16:
                case DwarfFormCodes.Block1:
                case DwarfFormCodes.Block2:
                case DwarfFormCodes.Block4:
                case DwarfFormCodes.Block:
                case DwarfFormCodes.ExprLoc:
                    value = this.readRaw(byteSize);
                    break;

                default:
                    value = this.read(byteSize);
                    break;
            }
        }

        if (value == null && params) {

            if (ofs != null) {
                if (params.stringOffsetTable) {
                    ref = params.stringOffsetTable.get(ofs);
                } else {
                    throw("unresolved offset");
                }
            }

            if (ref != null) {
                if (refIsAddr) {
                    if (params.addressTable) value = params.addressTable.get(ref);
                } else if (refIsRange) {
                    if (params.rangeTable) value = params.rangeTable.get(ref);
                } else if (refIsLoc) {
                    if (params.locationTable) value = params.locationTable.get(ref);
                } else if (params.stringTable) {
                    value = params.stringTable.get(ref);
                } else {
                    throw("unresolved reference");
                }
            }
        }

        return value;

    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    ElfDeserializer: ElfDeserializer
};
