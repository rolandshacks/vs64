//
// Sprite components
//

class Bitmap {
    constructor(width, height, bitsPerPixel) {
        this._bitsPerPixel = bitsPerPixel||2;
        this._width = width||(24 / this._bitsPerPixel);
        this._height = height||21;
        this._bytesPerLine = this._width * this._bitsPerPixel / 8;
        this._size = this._bytesPerLine * this._height;
        this._data = new Uint8Array(this._size);
    }

    get width() { return this._width; }
    get height() { return this._height; }
    get bitsPerPixel() { return this._bitsPerPixel; }
    get bytesPerLine() { return this._bytesPerLine; }
    get size() { return this._size; }
    get data() { return this._data; }
    get pixelSize() { return this._pixelSize; }

    setPixelData(data) {
        for (let i=0; i<this._size; i++) {
            this._data[i] = data[i]&0xff;
        }
    }

    clear() {
        for (let i=0; i<this._size; i++) {
            this._data[i] = 0x0;
        }
    }

    getPixel(x, y) {

        if (!this.isInside(x, y)) return null;

        const byteOfs = (y * this._bytesPerLine) + Math.floor((x * this._bitsPerPixel / 8));
        const bitOfs = (x * this._bitsPerPixel) % 8;

        const byteValue = this._data[byteOfs]&0xff;

        let col = 0x0;

        if ((byteValue & (1 << (7-bitOfs))) != 0x0) {
            col |= 0x1;
        }

        if (this.bitsPerPixel == 2) {
            if ((byteValue & (1 << (6-bitOfs))) != 0x0) {
                col |= 0x2;
            }
        }

        return col;
    }

    isInside(x, y) {
        if (x < 0 || x >= this._width) return false;
        if (y < 0 || y >= this._height) return false;
        return true;
    }

    setPixel(x, y, color) {
        if (!this.isInside(x, y)) return;

        const byteOfs = (y * this._bytesPerLine) + Math.floor((x * this._bitsPerPixel / 8));
        const bitOfs = (x * this._bitsPerPixel) % 8;

        let byteValue = this._data[byteOfs]&0xff;

        if ((color & 0x1) != 0x0) {
            byteValue |= (1 << (7-bitOfs));
        } else {
            byteValue &= ~(1 << (7-bitOfs));
        }

        if (this.bitsPerPixel == 2 && ((color & 0x2) != 0x0)) {
            byteValue |= (1 << (6-bitOfs));
        } else {
            byteValue &= ~(1 << (6-bitOfs));
        }

        this._data[byteOfs] = byteValue & 0xff;

    }

    #posToRef(x, y) {
        return (y * this.width + x);
    }

    fill(x, y, color, fillAll) {
        const refColor = this.getPixel(x, y);
        if (refColor == null || color == refColor) return;

        if (fillAll) {

            for (let py=0; py<this.height; py++) {
                for (let px=0; px<this.width; px++) {
                    const pixelColor = this.getPixel(px, py);
                    if (pixelColor == null || pixelColor != refColor) continue;
                    this.setPixel(px, py, color);
                }
            }

        } else {

            const queue = [];
            const visited = new Set();

            const start = { x: x, y: y, ref: this.#posToRef(x, y) };
            visited.add(start.ref);
            queue.push(start);

            while (queue.length > 0) {
                const pixel = queue.shift();

                this.setPixel(pixel.x, pixel.y, color);

                const nextPixels = [];
                if (pixel.x > 0) {
                    nextPixels.push({ x: pixel.x-1, y: pixel.y, ref: this.#posToRef(pixel.x-1, pixel.y) });
                }

                if (pixel.x + 1 < this.width) {
                    nextPixels.push({ x: pixel.x+1, y: pixel.y, ref: this.#posToRef(pixel.x+1, pixel.y) });
                }

                if (pixel.y > 0) {
                    nextPixels.push({ x: pixel.x, y: pixel.y-1, ref: this.#posToRef(pixel.x, pixel.y-1) });
                }

                if (pixel.y + 1 < this.height) {
                    nextPixels.push({ x: pixel.x, y: pixel.y+1, ref: this.#posToRef(pixel.x, pixel.y+1) });
                }

                for (const nextPixel of nextPixels) {
                    if (visited.has(nextPixel.ref)) continue;
                    const pixelColor = this.getPixel(nextPixel.x, nextPixel.y);
                    if (pixelColor == null || pixelColor != refColor) continue;
                    visited.add(nextPixel.ref);
                    queue.push(nextPixel);
                }

            }
        }

    }
}

class Sprite extends Bitmap {
    constructor(width, height, bitsPerPixel) {
        super(width, height, bitsPerPixel);

        this._colors = [ 1, 2, 3 ];
        this._pixelSize = { x: this._bitsPerPixel, y: 1 };
    }

    get color() { return this._colors[0]; }
    get multiColor1() { return this._colors[1]; }
    get multiColor2() { return this._colors[2]; }

}
