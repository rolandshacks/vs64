/**
 * Charset File
 * @module Web
 */

import { MediaFile, MediaType } from "./mediafile.js";
import { Factory } from "./factory.js";

const CTM_MEDIA_FILE_CLASSNAME = "media.ctm";

function hasBit(value, bit) {
    return (value & (1 << bit)) != 0x0;
}

const CharsetDisplayMode = {
    TextHighRes: 0,
    TextMultiColor: 1,
    TextExtendedColor: 2,
    BitmapHighRes: 3,
    BitmapMultiColor: 4
};

const CharsetColorMethod = {
    ColorPerProject: 0,
    ColorPerTile: 1,
    ColorPerChar: 2
};

CharsetDisplayMode.asString = function(mode) {
    return [
        "High-Res Text",
        "Multi-Color Text",
        "Extended Color Text",
        "High-Res Bitmap",
        "Multi-Color Bitmap"
    ][mode];
}

class CharsetMediaFile extends MediaFile {
    constructor(...args) {
        super(...args)
        this._mediaType = MediaType.CHARSET;

        this.displayMode = null;
        this.colorMethod = null;
        this.colBackground = null;
        this.colForeground = null;
        this.colMulti1 = null;
        this.colMulti2 = null;
        this.charsetSize = null;
        this.charsetData = null;
        this.charsetAttribs = null;
        this.charsetColors = null;
        this.mapWidth = 0;
        this.mapHeight = 0;
        this.mapDataSize = 0;
        this.mapData = null;
    }

    static createInstance(...args) {
        return new CharsetMediaFile(...args);
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
            throw("invalid charpad file size");
        }

        const magic = reader.readChars(3);
        if (magic != "CTM") {
            throw("invalid file magic bytes: " + magic);
        }

        const m = this;

        m.set("Type", "CharPad File", null, true);

        const version = reader.readByte();
        let fileInfo = "Size: " + fileSize + " bytes, Version: " + version;
        if (version < 7 || version > 9) {
            fileInfo += " (unsupported)";
        }
        m.set("File", fileInfo);

        let flags = 0;
        let displayMode = 0;
        let colMethod = CharsetColorMethod.ColorPerProject;
        let colForeground = 0;
        let colBackground = 0;
        let colMulti1 = 0;
        let colMulti2 = 0;
        let colGlobal = 0;

        let colCmLo = 0;
        let colSmLo = 0;
        let colSmHi = 0;

        if (version >= 8) {
            displayMode = reader.readByte();
            colMethod = reader.readByte();
            flags = reader.readByte();

            if (version >= 9) {
                reader.skip(5);
            }

            colBackground = reader.readByte()&0xf;
            colMulti1 = reader.readByte()&0xf;
            colMulti2 = reader.readByte()&0xf;
            colForeground = reader.readByte()&0xf;

            colCmLo = reader.readByte()&0xf;
            colSmLo = reader.readByte()&0xf;
            colSmHi = reader.readByte()&0xf;

        } else if (version == 7) {

            colBackground = reader.readByte()&0xf;
            colMulti1 = reader.readByte()&0xf;
            colMulti2 = reader.readByte()&0xf;
            colForeground = reader.readByte()&0xf;

            colGlobal = reader.readByte()&0xf;

            colMethod = reader.readByte();
            displayMode = reader.readByte();
            flags = reader.readByte();
        }

        m.set("Display Mode", CharsetDisplayMode.asString(displayMode));

        const tilesUsed = hasBit(flags, 0);

        let blockIdx = m.nextBlock();
        if (null == blockIdx) return;

        const charsetSize = reader.readInt(2) + 1;
        m.set("Character Count", charsetSize + (tilesUsed ? " (has tiles)" : ""));

        if (charsetSize < 1) return;

        let charsetData = [];
        for (let i=0; i<charsetSize; i++) {
            const charData = reader.readBytes(8);
            charsetData.push(charData);
        }

        blockIdx = m.nextBlock();
        if (null == blockIdx) return;

        const charsetAttribs = reader.readBytes(charsetSize);

        let charsetColors = null;

        if (colMethod == CharsetColorMethod.ColorPerChar) {

            blockIdx = m.nextBlock();
            if (null == blockIdx) return;

            charsetColors = [];

            for (let i=0; i<charsetSize; i++) {
                let col = {};

                if (displayMode != CharsetDisplayMode.BitmapHighRes) {
                    col.colColorMatrixLow = reader.readByte() & 0xf;
                }

                if (displayMode == CharsetDisplayMode.BitmapHighRes || displayMode == CharsetDisplayMode.BitmapMultiColor) {
                    col.colScreenMatrixLow = reader.readByte() & 0xf;
                    col.colScreenMatrixHigh = reader.readByte() & 0xf;
                }

                charsetColors.push(col);
            }
        }

        this.displayMode = displayMode;
        this.colorMethod = colMethod;
        this.colBackground = colBackground;
        this.colForeground = colForeground;
        this.colMulti1 = colMulti1;
        this.colMulti2 = colMulti2;
        this.colCmLo = colCmLo;
        this.colSmLo = colSmLo;
        this.colSmHi = colSmHi;

        this.charsetSize = charsetSize;
        this.charsetData = charsetData;
        this.charsetAttribs = charsetAttribs;
        this.charsetColors = charsetColors;

        this.tileCount = 0;
        this.tiles = null;

        if (tilesUsed) {
            blockIdx = m.nextBlock();
            if (null == blockIdx) return;

            this.tileCount = reader.readInt(2) + 1;

            this.tiles = {};
            const tiles = this.tiles;

            tiles.width = reader.readByte();
            tiles.height = reader.readByte();
            tiles.numCells = tiles.width * tiles.height;
            tiles.size = this.tileCount * tiles.numCells * 2;
            tiles.data = reader.readBytes(tiles.size); // 16bit per cell
            tiles.colors = null;
            tiles.names = [];

            if (colMethod == CharsetColorMethod.ColorPerTile) {
                // tile set colors

                blockIdx = m.nextBlock();
                if (null == blockIdx) return;

                tiles.colors = [];
                for (let t=0; t<this.tileCount; t++) {
                    const col = {};
                    if (displayMode != CharsetDisplayMode.BitmapHighRes) {
                        col.colColorMatrixLow = reader.readByte() & 0xf;
                    }
                    if (displayMode == CharsetDisplayMode.BitmapHighRes || displayMode == CharsetDisplayMode.BitmapMultiColor) {
                        col.colScreenMatrixLow = reader.readByte() & 0xf;
                        col.colScreenMatrixHigh = reader.readByte() & 0xf;
                    }
                    tiles.colors.push(col);
                }
            }

            {
                // tile set tags
                blockIdx = m.nextBlock();
                if (null == blockIdx) return;
                tiles.tags = reader.readBytes(this.tileCount);
            }

            {
                // tile set names
                blockIdx = m.nextBlock();
                if (null == blockIdx) return;

                for (let t=0; t<this.tileCount; t++) {
                    const tilesetName = reader.readChars(32, true);
                    tiles.names.push(tilesetName);
                }
            }
        }

        blockIdx = m.nextBlock();
        if (null == blockIdx) return;

        this.mapWidth = reader.readInt(2);
        this.mapHeight = reader.readInt(2);
        this.mapDataSize = this.mapWidth * this.mapHeight * 2;
        this.mapData = null;
        if (this.mapDataSize > 0) {
            this.mapData = reader.readBytes(this.mapDataSize);
        }

        if (null != this.mapData) {
            m.set("Map", this.mapWidth + "x" + this.mapHeight + ", Size: " + this.mapDataSize + " bytes");
        }

    }
}

CharsetMediaFile.ClassName = CTM_MEDIA_FILE_CLASSNAME;

Factory.register(CharsetMediaFile);

export {
    CharsetMediaFile as CharsetMediaFile,
    CharsetDisplayMode as CharsetDisplayMode,
    CharsetColorMethod as CharsetColorMethod
};
