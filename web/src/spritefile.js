/**
 * Sprite File
 * @module Web
 */

import { MediaFile, MediaType } from "./mediafile.js";
import { Factory } from "./factory.js";

const SPD_MEDIA_FILE_CLASSNAME = "media.spd";
const SPM_MEDIA_FILE_CLASSNAME = "media.spm";

function hasBit(value, bit) {
    return (value & (1 << bit)) != 0x0;
}

class SpriteMediaFile extends MediaFile {
    constructor(...args) {
        super(...args)
        this._mediaType = MediaType.SPRITES;

        this.hasTiles = false;
        this.hasSpriteAnimations = false;
        this.hasTileAnimations = false;

        this.spriteCount = 0;
        this.tileCount = 0;
        this.spriteAnimationCount = 0;
        this.tileAnimationCount = 0;
        this.tileWidth = 0;
        this.tileHeight = 0;

        this.colBackground = 0;
        this.colMulti1 = 0;
        this.colMulti2 = 0;

        this.spriteOverlayDistance = 0;
        this.tileOverlayDistance = 0;

        this.sprites = null;
    }
}

class SpritePadMediaFile extends SpriteMediaFile {
    constructor(...args) {
        super(...args)
    }

    static createInstance(...args) {
        return new SpritePadMediaFile(...args);
    }

    nextBlock(self) {
        const reader = this.getReader();
        let data = reader.readByte();
        if (data != 0xda) return null;
        data = reader.readByte();
        if ((data & 0xf0) != 0xb0) return null
        return data & 0x0f;
    }

    unpack() {
        const reader = this.getReader();

        const fileSize = reader.avail;
        if (fileSize < 3) {
            throw("invalid spritepad file size");
        }

        const magic = reader.readChars(3);
        if (magic != "SPD") {
            throw("invalid file magic bytes: " + magic);
        }

        const m = this;

        m.set("Type", "SpritePad File", null, true);

        const version = reader.readByte();

        let fileInfo = "Size: " + fileSize + " bytes, Version: " + version;

        if (version < 1 || version > 5) {
            fileInfo += " (unsupported)";
        }
        m.set("File", fileInfo);

        const contentFlags = version >= 2 ? reader.readByte() : 0x0;

        this.hasTiles = hasBit(contentFlags, 0);
        this.hasSpriteAnimations = hasBit(contentFlags, 1);
        this.hasTileAnimations = hasBit(contentFlags, 2);

        this.spriteCount = 0;
        this.tileCount = 0;
        this.spriteAnimationCount = 0;
        this.tileAnimationCount = 0;
        this.tileWidth = 0;
        this.tileHeight = 0;

        if (version >= 2) {
            this.spriteCount = reader.readInt(2);
            this.tileCount = reader.readInt(2);

            if (version >= 3) {
                this.spriteAnimationCount = reader.readByte() + this.hasSpriteAnimations ? 1 : 0;
                this.tileAnimationCount = reader.readByte() + this.hasTileAnimations ? 1 : 0;
            } else {
                this.spriteAnimationCount = reader.readInt(2);
            }

            this.tileWidth = reader.readByte();
            this.tileHeight = reader.readByte();
        } else {
            this.spriteCount = reader.readByte() + 1;
            this.spriteAnimationCount = reader.readByte() + 1;
        }

        this.colBackground = reader.readByte() & 0xf;
        this.colMulti1 = reader.readByte() & 0xf;
        this.colMulti2 = reader.readByte() & 0xf;

        this.spriteOverlayDistance = 0;
        this.tileOverlayDistance = 0;
        if (version >= 4) {
            this.spriteOverlayDistance = reader.readInt(2);
            this.tileOverlayDistance = reader.readInt(2);
        }

        m.set("Sprites", "Count: " + this.spriteCount + ", Animations: " + this.spriteAnimationCount + ", Overlay Distance: " + this.spriteOverlayDistance);
        if (this.tileCount > 0) {
            m.set("Tiles", "Count: " + this.tileCount + ", Animations: " + this.tileAnimationCount + ", Overlay Distance: " + this.tileOverlayDistance);
        } else {
            m.set("Tiles", "none");
        }
        m.set("Colors", "Background: " + this.colBackground + ", Multi1: " + this.colMulti1 + ", Multi2: " + this.colMulti2);

        this.sprites = [];

        while (this.spriteCount == 0 || this.sprites.length < this.spriteCount) {
            if (this.spriteCount == 0 && reader.avail < 64) break;

            const idx = this.sprites.length;

            const sprite = {};

            sprite.index = idx;
            sprite.name = "sprite" + idx;
            sprite.data = reader.readBytes(63);

            const contentFlags = reader.readByte();
            sprite.color = contentFlags & 0x0f;
            sprite.multiColor = (contentFlags & 0x80) != 0;
            sprite.doubleY = (contentFlags & 0x40) != 0;
            sprite.doubleX = (contentFlags & 0x20) != 0;
            sprite.overlay = (contentFlags & 0x10) != 0;

            sprite.flags = sprite.color & 0xf;
            if (sprite.multiColor) sprite.flags |= 0x80;
            if (sprite.doubleY) sprite.flags |= 0x40;
            if (sprite.doubleX) sprite.flags |= 0x20;
            if (sprite.overlay) sprite.flags |= 0x10;

            this.sprites.push(sprite);
        }
    }

}

SpritePadMediaFile.ClassName = SPD_MEDIA_FILE_CLASSNAME;

Factory.register(SpritePadMediaFile);

class SpriteMateMediaFile extends SpriteMediaFile {
    constructor(...args) {
        super(...args)
    }

    static createInstance(...args) {
        return new SpriteMateMediaFile(...args);
    }

    unpack() {
        console.log("Sprite Mate!");

        const data = this._data;
        const json = JSON.parse(data);

        const fileSize = data.length;
        const version = json.version;

        const m = this;

        m.set("Type", "SpriteMate File", null, true);

        let fileInfo = "Size: " + fileSize + " bytes, Version: " + version;
        m.set("File", fileInfo);

        if (null != json.colors) {
            this.colBackground = json.colors['0'] & 0xf;
            this.colMulti1 = json.colors['2'] & 0xf;
            this.colMulti2 = json.colors['3'] & 0xf;
        }

        this.spriteCount = (null != json.sprites) ? json.sprites.length : 0;
        m.set("Sprites", "Count: " + this.spriteCount);

        m.set("Colors", "Background: " + this.colBackground + ", Multi1: " + this.colMulti1 + ", Multi2: " + this.colMulti2);

        this.sprites = [];

        for (let idx=0; idx<this.spriteCount; idx++) {
            const s = json.sprites[idx];

            const sprite = {};

            sprite.index = idx;
            sprite.name = s.name;
            sprite.data = new Uint8Array(64);

            sprite.color = s.color & 0x0f;
            sprite.multiColor = s.multicolor;
            sprite.doubleY = s.double_y;
            sprite.doubleX = s.double_x;
            sprite.overlay = s.overlay;

            sprite.flags = sprite.color & 0xf;
            if (sprite.multiColor) sprite.flags |= 0x80;
            if (sprite.doubleY) sprite.flags |= 0x40;
            if (sprite.doubleX) sprite.flags |= 0x20;
            if (sprite.overlay) sprite.flags |= 0x10;

            if (null != s.pixels && s.pixels.length == 21) {
                let ofs = 0;
                for (const row of s.pixels) {
                    let mask = 0;
                    let bit = 0;
                    let bit_size = (sprite.multiColor) ? 2 : 1;
                    let bit_end = row.length + 1 - bit_size;
                    let bit_count = 0;

                    while (bit < bit_end) {
                        const pixel = row[bit];
                        mask = mask * 2 * bit_size;

                        if (sprite.multiColor) {
                            if (pixel & 0x1) mask += 2;
                            if (pixel & 0x2) mask += 1;
                        } else {
                            mask += pixel;
                        }

                        bit += bit_size;
                        bit_count += bit_size;

                        if (bit_count >= 8) {
                            sprite.data[ofs++] = (mask & 0xff);
                            mask = 0;
                            bit_count = 0;
                        }
                    }
                }

                sprite.data[ofs++] = (sprite.flags & 0xff);
                this.sprites.push(sprite);
            }
        }

    }

}

SpriteMateMediaFile.ClassName = SPM_MEDIA_FILE_CLASSNAME;

Factory.register(SpriteMateMediaFile);

export {
    SpritePadMediaFile as SpritePadMediaFile,
    SpriteMateMediaFile as SpriteMateMediaFile
};
