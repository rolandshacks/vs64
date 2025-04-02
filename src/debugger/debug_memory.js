//
// Debug Memory
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

//const { Logger } = require('utilities/logger');
//const logger = new Logger("DebugMemory");

//-----------------------------------------------------------------------------------------------//
// Buffered Memory
//-----------------------------------------------------------------------------------------------//

class BufferedMemory {
    constructor(emu) {
        this._emu = emu;
        this._start_addr = null;
        this._end_addr = null;
        this._length = 0;
        this._buffer = null;

        this._dirty_start = null;
        this._dirty_end = null;
    }

    static async alloc(emu, start_addr, end_addr) {
        let bufferedMemory = new BufferedMemory(emu);
        await bufferedMemory.read(start_addr, end_addr);
        return bufferedMemory;
    }

    get dirty() {
        return (this._dirty_start != null);
    }

    get empty() {
        return (null == this._buffer || null == this._start_addr || null == this._end_addr || this._length < 1);
    }

    get start() { return this._start_addr; }
    get end() { return this._end_addr; }
    get length() { return this._length; }
    get buffer() { return this._buffer; }

    free() {
        this._start_addr = null;
        this._end_addr = null;
        this._length = 0;
        this._buffer = null;
    }

    toSlice(startAddress, size) {
        if (this.empty) return null;
        return this._buffer.subarray(startAddress, startAddress + size);
    }

    async read(start_addr, end_addr) {
        if (null == this._emu) return null;

        start_addr = start_addr || 0x0;
        end_addr = end_addr || 0xffff;

        this._buffer = await this._emu.readMemory(start_addr, end_addr);

        this._start_addr = start_addr;
        this._end_addr = end_addr;
        this._length = end_addr - start_addr + 1;

        return this._buffer;
    }

    async write(start_addr, end_addr) {
        if (null == this._emu || this.empty) return;

        if (null == start_addr) {
            // neither start nor end given - write everything
            start_addr = this._start_addr;
            if (null == end_addr) end_addr = this._end_addr;
        }

        if (null == end_addr) {
            // just start given, write single byte
            end_addr = start_addr;
        }

        const slice = this.toSlice(start_addr, end_addr + 1 - start_addr);

        await this._emu.writeMemory(start_addr, end_addr, slice);
    }

    async flush() {
        if (null == this._dirty_start || null == this._dirty_end) {
            // not dirty
            return;
        }

        await this.write(this._dirty_start, this._dirty_end);

        this._dirty_start = null;
        this._dirty_end = null;
    }

    getByte(addr) {
        return this._buffer[addr];
    }

    getBit(addr, bit) {
        const mask = (1<<bit);
        return (this.getByte(addr) & mask) != 0x0 ? 1 : 0;
    }

    getNibble(addr, high) {
        const b = this.getByte(addr);
        return high ? ((b & 0xf0) >> 4) : (b & 0xf);
    }

    setByte(addr, value) {
        this._buffer[addr] = value & 0xff;
        this._touch(addr);
    }

    setBit(addr, bit, value) {
        const mask = (1<<bit)&0xff;
        let b = this._buffer[addr];
        if (value) {
            b |= mask;
        } else {
            b &= ~mask;
        }
        this.setByte(addr, b);
    }

    setNibble(addr, high, value) {
        let b = this._buffer[addr];
        if (high) {
            b = ((value & 0x0f) << 4) | (b & 0xf);
        } else {
            b = (value & 0xf) | (b & 0xf0);
        }
        this.setByte(addr, b);
    }

    _touch(start_addr, end_addr) {
        if (null == end_addr) end_addr = start_addr;
        if (null == this._dirty_start || start_addr < this._dirty_start) {
            this._dirty_start = start_addr;
        }
        if (null == this._dirty_end || end_addr > this._dirty_end) {
            this._dirty_end = end_addr;
        }
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    BufferedMemory: BufferedMemory
}
