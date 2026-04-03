/**
 * Media View
 * @module Web
 */

import { $ } from "./utilities.js";
import { Factory } from "./factory.js";
import { WebView } from "./webview.js";
import { SidFile } from "./sidfile.js";
import { MediaType } from "./mediafile.js";
import { CharsetDisplayMode, CharsetColorMethod } from "./charsetfile.js";
import { SpriteMediaFile } from "./spritefile.js";
import { Palette } from "./palette.js";

const MEDIA_VIEW_CLASSNAME = "view.media";
const DEFAULT_SCALE = 2;
const PADDING_Y = 24;

const C64_SPRITE_WIDTH = 24;
const C64_SPRITE_HEIGHT = 21;
const C64_CHAR_WIDTH = 8;
const C64_CHAR_HEIGHT = 8;

/**
 * Media view.
 */
class MediaView extends WebView {
    constructor(element, options) {
        super(element, options);
        this.media = null;
        this.error = null;
        this.canvas = null;
        if (null != element && element.tagName == "CANVAS") {
            this.canvas = element.getContext("2d");
        }

        this.enableWheelListener();
        this.setScale(DEFAULT_SCALE, 1, 16);
        this.metrics = {};
        this.palette = Palette.DEFAULT;
    }

    static createInstance(...args) {
        return new MediaView(...args);
    }

    renderProperties(m) {
        let html = "";

        // header
        html += "<span class='label'>" + m.get("type") + "</span>";
        html += "<h1>" + m.get("title", m.name) + "</h1>";

        const propertyTable = [];

        // fixed properties at the top
        propertyTable.push("author");
        propertyTable.push("released");

        // add the rest
        for (const property of m.properties.values()) {
            if (!property.special) {
                propertyTable.push(property.key);
            }
        }

        // render to table
        html += "<table class='propertytable'>";
        for (const key of propertyTable) {
            const property = m.entry(key);
            if (null == property) continue;
            html += "<tr>";
            html += "<td>" + property.label + ":</td>";
            html += "<td>" + property.value + "</td>";
            html += "</tr>";
        }
        html += "</table>";

        return html;
    }

    unpack() {
        this.error = null;

        const document = this.document;
        if (null == document) return;

        const name = document.name || "unnamed";
        const fileType = document.extension;
        const className = "media." + fileType;
        const data = document.data;

        if (null == this.media) {
            try {
                this.media = Factory.createInstance(className, name, data);
            } catch (_) {
                this.error = {
                    file: name,
                    size: data.length
                };

                return;
            }
        } else {
            this.media.update(name, data);
        }

        if (null != this.media) {
            try {
                this.media.unpack();
            } catch (_) {
                this.error = {
                    file: name,
                    message: "failed to unpack media data"
                };
            }
        }
    }

    show() {
        this.showProperties();
        this.showMedia();
    }

    showProperties() {
        const properties = $("idProperties");
        if (null != properties) {
            let html = "";
            if (this.error) {
                html += "<p>File: " + this.error.file + "</p>";
                if (this.error.message) {
                    html += "<p>Error: " + this.error.message + "</p>";
                } else if (this.error.size) {
                    html += "<p>Error: " + this.error.size + " bytes</p>";
                }
            } else if (this.media) {
                html = this.renderProperties(this.media);
            }

            properties.innerHTML = html;
        }
    }

    onScale() {
        this.showMedia();
    }

    resize(_width, _height) {
        this.showMedia();
    }

    getMetrics(multiColor) {
        const metrics = this.metrics;
        const displayMode = this.media.displayMode;
        const doubleWidth = (displayMode == CharsetDisplayMode.TextMultiColor || displayMode == CharsetDisplayMode.BitmapMultiColor);

        metrics.scale = this.scale;

        metrics.charPaddingX = 1;
        metrics.charPaddingY = 1;

        metrics.spritePaddingX = 4;
        metrics.spritePaddingY = 4;

        metrics.pixelPaddingX = (metrics.scale > 4) ? 1 : 0;
        metrics.pixelPaddingY = (metrics.scale > 4) ? 1 : 0;

        metrics.pixelWidth = metrics.scale;
        metrics.pixelWidthMulti = metrics.pixelWidth * 2;
        metrics.pixelHeight = metrics.scale;

        if (doubleWidth) {
            metrics.pixelWidth *= 2;
            metrics.charWidth = (C64_CHAR_WIDTH >> 1) * (metrics.pixelWidth + metrics.pixelPaddingX) - metrics.pixelPaddingX;
        } else {
            metrics.charWidth = C64_CHAR_WIDTH * (metrics.pixelWidth + metrics.pixelPaddingX) - metrics.pixelPaddingX;
        }

        metrics.charHeight = C64_CHAR_HEIGHT * (metrics.pixelHeight + metrics.pixelPaddingY) - metrics.pixelPaddingY;

        metrics.spriteWidth = C64_SPRITE_WIDTH * (metrics.pixelWidth + metrics.pixelPaddingX) - metrics.pixelPaddingX;
        metrics.spriteWidthMulti = (C64_SPRITE_WIDTH >> 1) * (metrics.pixelWidthMulti + metrics.pixelPaddingX) - metrics.pixelPaddingX;
        metrics.spriteHeight = C64_SPRITE_HEIGHT * (metrics.pixelHeight + metrics.pixelPaddingY) - metrics.pixelPaddingY;

        return metrics;
    }

    drawChar(idx, ofs_x, ofs_y, tileIndex=-1) {
        const media = this.media;
        const displayMode = media.displayMode;
        const colorMethod = media.colorMethod;
        const tiles = media.tiles;
        const ctx = this.canvas;

        if (idx < 0 || idx >= this.media.charsetSize) return;

        const palette = this.palette;
        const charData = media.charsetData[idx];
        const metrics = this.metrics;

        const colors = [media.colBackground, media.colForeground, 0, 0];

        // per-char or per-tile colors
        let charColor = null;
        if (CharsetColorMethod.ColorPerTile == colorMethod &&
            tileIndex != -1 &&
            null != tiles &&
            null != tiles.colors) {
            charColor = tiles.colors[tileIndex];
        } else if (CharsetColorMethod.ColorPerChar == colorMethod &&
                   null != media.charsetColors) {
            charColor = media.charsetColors[idx];
        }

        if (null != charColor) {
            switch (displayMode) {
                case CharsetDisplayMode.TextHighRes: {
                    colors[1] = charColor.colColorMatrixLow;
                    break;
                }
                case CharsetDisplayMode.BitmapHighRes: {
                    colors[0] = charColor.colScreenMatrixLow;
                    colors[1] = charColor.colScreenMatrixHigh;
                    break;
                }
                case CharsetDisplayMode.TextMultiColor: {
                    colors[1] = media.colMulti1&0x7;
                    colors[2] = media.colMulti2&0x7;
                    colors[3] = charColor.colColorMatrixLow&0x7;
                    break;
                }
                case CharsetDisplayMode.TextExtendedColor: {
                    colors[1] = charColor.colColorMatrixLow;
                    break;
                }
                case CharsetDisplayMode.BitmapMultiColor: {
                    colors[1] = charColor.colScreenMatrixHigh;
                    colors[2] = charColor.colScreenMatrixLow;
                    colors[3] = charColor.colColorMatrixLow;
                    break;
                }
                default: {
                    break;
                }
            }
        } else {
            if (colorMethod == CharsetColorMethod.ColorPerProject) {
                switch (displayMode) {
                    case CharsetDisplayMode.TextHighRes: {
                        colors[1] = media.colCmLo;
                        break;
                    }
                    case CharsetDisplayMode.TextMultiColor: {
                        colors[1] = media.colMulti1&0x7;
                        colors[2] = media.colMulti2&0x7;
                        colors[3] = media.colCmLo&0x7;
                        break;
                    }
                    case CharsetDisplayMode.TextExtendedColor: {
                        colors[1] = media.colCmLo;
                        break;
                    }
                    case CharsetDisplayMode.BitmapHighRes: {
                        colors[0] = media.colSmLo;
                        colors[1] = media.colSmHi;
                        break;
                    }
                    case CharsetDisplayMode.BitmapMultiColor: {
                        colors[1] = media.colSmHi;
                        colors[2] = media.colSmLo;
                        colors[3] = media.colCmLo;
                        break;
                    }
                    default: {
                        break;
                    }
                }
            }
        }

        /*
        } else {
            if (displayMode == CharsetDisplayMode.TextMultiColor || displayMode == CharsetDisplayMode.BitmapMultiColor) {
                charColor = {
                    colColorMatrixLow: media.colForeground,
                    colScreenMatrixLow: media.colMulti1,
                    colScreenMatrixHigh: media.colMulti2,
                };
            } else {
                charColor = {
                    colScreenMatrixHigh: media.colForeground,
                    colScreenMatrixLow: media.colBackground
                }
            };
        }
        */

        let y = ofs_y;

        for (let row=0; row<C64_CHAR_HEIGHT; row++) {
            let grid = (row & 0x1);

            let x = ofs_x;
            const data = charData[row];

            if (displayMode == CharsetDisplayMode.TextHighRes || displayMode == CharsetDisplayMode.BitmapHighRes || displayMode == CharsetDisplayMode.TextExtendedColor) {
                for (let column=7; column>=0; column--) {
                    const px = (data & (1<<column)) != 0 ? 1 : 0;
                    ctx.fillStyle = palette[colors[px]];
                    ctx.fillRect(x, y, metrics.pixelWidth, metrics.pixelHeight);
                    x += metrics.pixelWidth + metrics.pixelPaddingX;
                }
            } else if (displayMode == CharsetDisplayMode.TextMultiColor || displayMode == CharsetDisplayMode.BitmapMultiColor) {
                for (let column=6; column>=0; column-=2) {
                    let px = ((data & (3<<column)) >> column);
                    let rgb = palette[colors[px]];
                    ctx.fillStyle = rgb;
                    ctx.fillRect(x, y, metrics.pixelWidth, metrics.pixelHeight);
                    x += metrics.pixelWidth + metrics.pixelPaddingX;
                }
            } else if (displayMode == CharsetDisplayMode.TextExtendedColor) {
                // unsupported
            }

            y += metrics.pixelHeight + metrics.pixelPaddingY;
        }
    }

    drawSprite(sprite, ofs_x, ofs_y, displayMode) {
        const media = this.media;
        const ctx = this.canvas;

        const palette = this.palette;
        const spriteData = sprite.data;
        const metrics = this.metrics;

        let charColor = null;

        let y = ofs_y;

        let dataOfs = 0;
        for (let row=0; row<C64_SPRITE_HEIGHT; row++) {
            let grid = (row & 0x1);

            let x = ofs_x;

            // 3 bytes per row
            const data = (spriteData[dataOfs]<<16) + (spriteData[dataOfs+1]<<8) + (spriteData[dataOfs+2]);
            dataOfs += 3;

            if (!sprite.multiColor) {
                for (let column=23; column>=0; column--) {
                    const px = (data & (1<<column)) != 0 ? 1 : 0;
                    ctx.fillStyle = (px != 0) ? palette[sprite.color] : palette[media.colBackground];
                    ctx.fillRect(x, y, metrics.pixelWidth, metrics.pixelHeight);
                    x += metrics.pixelWidth + metrics.pixelPaddingX;
                }
            } else {

                for (let column=22; column>=0; column-=2) {
                    let px = ((data & (3<<column)) >> column);

                    let rgb = null;
                    if (px == 0x3) rgb = palette[media.colMulti2];
                    else if (px == 0x1) rgb = palette[media.colMulti1];
                    else if (px == 0x2) rgb = palette[sprite.color];
                    else rgb = palette[media.colBackground];

                    //ctx.fillStyle = (px != 0) ? palette[sprite.color] : palette[media.colBackground];
                    if (null != rgb) {
                        ctx.fillStyle = rgb;
                        ctx.fillRect(x, y, metrics.pixelWidth*2, metrics.pixelHeight);
                    }

                    x += metrics.pixelWidth*2 + metrics.pixelPaddingX;
                }
            }

            y += metrics.pixelHeight + metrics.pixelPaddingY;
        }
    }

    showMedia() {
        if (null == this.media) return;

        switch (this.media.mediaType) {
            case MediaType.CHARSET: {
                this.showCharset();
                break;
            }
            case MediaType.SPRITES: {
                this.showSprites();
                break;
            }
            default : {
                break;
            }
        }
    }

    showSprites() {
        const media = this.media;
        if (null == media) return;
        if (null == media.sprites) return;

        const count = media.spriteCount;
        if (count < 1) return;

        const ctx = this.canvas;
        const viewSize = this.getViewSize();
        const metrics = this.getMetrics();

        let contentCols = Math.trunc((viewSize.x - 1) / (metrics.spriteWidth + metrics.spritePaddingX));
        let contentRows = Math.trunc((count + contentCols - 1) / contentCols);

        let spritesetDisplayWidth = contentCols * (metrics.spriteWidth + metrics.spritePaddingX) - metrics.spritePaddingX;
        let spritesetDisplayHeight = contentRows * (metrics.spriteHeight + metrics.spritePaddingY) - metrics.spritePaddingY;

        const canvasWidth = Math.max(viewSize.x, spritesetDisplayWidth);
        const canvasHeight = spritesetDisplayHeight;

        // resize canvas
        this.element.width = canvasWidth + 1;
        this.element.height = canvasHeight + 1;

        const palette = this.palette;

        // start at 0/0

        let start_x = 0
        let ofs_x = start_x;
        let ofs_y = 0;

        // draw sprite set

        for (let i=0; i<count; i++) {
            const sprite = media.sprites[i];
            this.drawSprite(sprite, ofs_x, ofs_y, 0);
            ofs_x += metrics.spriteWidth + metrics.spritePaddingX;
            if (ofs_x + metrics.spriteWidth > spritesetDisplayWidth) {
                ofs_x = start_x;
                ofs_y += metrics.spriteHeight + metrics.spritePaddingY;
            }
        }

        if (ofs_x > start_x) {
            ofs_x = start_x;
            ofs_y += metrics.spriteHeight + metrics.spritePaddingY;
        }

    }

    showCharset() {
        const media = this.media;
        if (null == media) return;
        if (null == media.charsetData) return;

        const count = media.charsetSize;
        if (count < 1) return;

        const ctx = this.canvas;
        const viewSize = this.getViewSize();
        const metrics = this.getMetrics();

        const displayMode = media.displayMode;

        let mapDisplayWidth = 0;
        let mapDisplayHeight = 0;

        if (null != media.mapData && media.mapDataSize > 0) {
            const rep_x = (null != media.tiles) ? media.tiles.width : 1;
            const rep_y = (null != media.tiles) ? media.tiles.height : 1;

            mapDisplayWidth = media.mapWidth * rep_x * (metrics.charWidth + metrics.pixelPaddingX) - metrics.pixelPaddingX;
            mapDisplayHeight = media.mapHeight * rep_y * (metrics.charHeight + metrics.pixelPaddingY) - metrics.pixelPaddingY;
        }

        let viewSizeX = Math.max(viewSize.x, mapDisplayWidth);

        let contentCols = Math.trunc((viewSizeX - 1) / (metrics.charWidth + metrics.charPaddingX));
        let contentRows = Math.trunc((count + contentCols - 1) / contentCols);

        let charsetDisplayWidth = contentCols * (metrics.charWidth + metrics.charPaddingX) - metrics.charPaddingX;
        let charsetDisplayHeight = contentRows * (metrics.charHeight + metrics.charPaddingY) - metrics.charPaddingY;

        const canvasWidth = Math.max(charsetDisplayWidth, mapDisplayWidth);
        const canvasHeight = charsetDisplayHeight + PADDING_Y + mapDisplayHeight;

        // resize canvas
        this.element.width = canvasWidth + 1;
        this.element.height = canvasHeight + 1;

        const palette = this.palette;

        // start at 0/0

        let start_x = 0
        let ofs_x = 0;
        let ofs_y = 0;

        // draw map

        if (null != media.mapData) {
            start_x = Math.max(0, Math.trunc((viewSizeX - mapDisplayWidth) / 2));
            ofs_x = start_x;

            ctx.fillStyle = palette[media.colBackground];
            ctx.fillRect(ofs_x, ofs_y, mapDisplayWidth, mapDisplayHeight);

            let x_rep = 1;
            let y_rep = 1;

            const tiles = media.tiles;

            if (null != tiles) {
                x_rep = tiles.width;
                y_rep = tiles.height;
            }

            for (let my=0; my<media.mapHeight; my++) {
                ofs_x = start_x;
                for (let mx=0; mx<media.mapWidth; mx++) {
                    const idx = (my * media.mapWidth + mx) * 2;
                    const m = media.mapData[idx] + media.mapData[idx+1] * 256;

                    if (null != tiles) {
                        if (m >= 0 && m < media.tileCount) {
                            const tileDataSize = tiles.numCells * 2;
                            const tileDataOfs = m * tileDataSize;

                            let ofs_ty = ofs_y;

                            for (let ty=0; ty<tiles.height; ty++) {
                                let ofs_tx = ofs_x;
                                for (let tx=0; tx<tiles.width; tx++) {
                                    const ofs_t = tileDataOfs + (ty * tiles.width + tx) * 2;
                                    const c = tiles.data[ofs_t] + tiles.data[ofs_t+1] * 256;
                                    if (c >= 0 && c < media.charsetSize) {
                                        this.drawChar(c, ofs_tx, ofs_ty, m);
                                    }

                                    ofs_tx += metrics.charWidth + metrics.pixelPaddingX;
                                }

                                ofs_ty += metrics.charHeight + metrics.pixelPaddingY;
                            }
                        }

                    } else {
                        if (m >= 0 && m < media.charsetSize) {
                            this.drawChar(m, ofs_x, ofs_y);
                        }
                    }

                    ofs_x += metrics.charWidth * x_rep + metrics.pixelPaddingX;
                }

                ofs_y += metrics.charHeight * y_rep + metrics.pixelPaddingY;
            }

            ofs_y += PADDING_Y;
        }

        // draw charset

        start_x = 0
        ofs_x = start_x;

        for (let i=0; i<count; i++) {
            this.drawChar(i, ofs_x, ofs_y);
            ofs_x += metrics.charWidth + metrics.charPaddingX;
            if (ofs_x > charsetDisplayWidth) {
                ofs_x = start_x;
                ofs_y += metrics.charHeight + metrics.charPaddingY;
            }
        }

        if (ofs_x > start_x) {
            ofs_x = start_x;
            ofs_y += metrics.charHeight + metrics.charPaddingY;
        }

    }

}

MediaView.ClassName = MEDIA_VIEW_CLASSNAME;

Factory.register(MediaView);

export {
    MediaView as MediaView,
    Palette as Palette
};
