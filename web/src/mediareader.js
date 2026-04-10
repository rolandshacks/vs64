/**
 * Media Reader
 * @module Web
 */

class MediaReader {
    constructor(data) {
        this.data = data;
        this.sz = data.length;
        this.ofs = 0;
        this.avail = this.sz;
        this.littleEndian = true;
    }

    get size() { return this.sz; }

    set_pos(pos) {
        this.ofs = pos;
        this.avail = this.sz - this.ofs;
    }

    reset() {
        this.set_pos(0);
    }

    skip(numBytes) {
        if (numBytes < 1 || numBytes > this.avail) return;
        this.ofs += numBytes;
        this.avail -= numBytes;
    }

    readByte() {
        if (this.avail < 1) return -1;
        const value = this.data[this.ofs];
        this.ofs += 1;
        this.avail -= 1;
        return value;
    }

    readByteAt(pos) {
        if (pos < 0 || pos >= this.sz) return -1;
        return this.data[pos];
    }

    readInt(numBytes) {
        if (numBytes > this.avail) return -1;
        if (numBytes < 1) return 0;

        let count = numBytes;
        let ofs = this.ofs;
        if (this.littleEndian) ofs += count - 1;

        let value = 0;

        while (count > 0) {
            if (this.littleEndian) {
                value = (value << 8) + this.data[ofs];
                ofs--;
            } else {
                value = (value << 8) + this.data[ofs];
                ofs++;
            }
            count--;
        }

        this.ofs += numBytes;
        this.avail -= numBytes;

        return value;
    }

    readBytes(numBytes) {
        if (numBytes > this.avail) return null;
        const bytes = this.data.slice(this.ofs, this.ofs + numBytes);
        this.ofs += numBytes;
        this.avail -= numBytes;
        return bytes;
    }

    readChars(numChars, zeroTerminated) {
        if (numChars > this.avail) return "";

        let s = "";

        while (numChars > 0 && this.avail > 0) {
            const c = this.data[this.ofs];
            this.ofs++;
            this.avail--;
            numChars--;
            if (zeroTerminated && c == '0') break;
            s += String.fromCharCode(c);
        }

        return s;
    }

}

export {
    MediaReader as MediaReader
};
