/**
 * Sprite File
 * @module Web
 */

import { MediaFile, MediaType } from "./mediafile.js";
import { Factory } from "./factory.js";

const SPD_MEDIA_FILE_CLASSNAME = "media.spd";

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

        this.sprites = null;
    }

    static createInstance(...args) {
        return new SpriteMediaFile(...args);
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

SpriteMediaFile.ClassName = SPD_MEDIA_FILE_CLASSNAME;

Factory.register(SpriteMediaFile);

export {
    SpriteMediaFile as SpriteMediaFile
};
