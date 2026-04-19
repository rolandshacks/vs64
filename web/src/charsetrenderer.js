/**
 * Charset Renderer
 * @module Web
 */

import { Factory } from "./factory.js";
import { CharsetColorMethod, CharsetDisplayMode } from "./media.js";
import { MediaRenderer } from "./mediarenderer.js";
import { Metrics } from "./metrics.js";

// renderer class identifiers
const CHARSET_MEDIA_RENDERER_CLASSNAME = "render.media.charset";

class CharsetMediaRenderer extends MediaRenderer {
    constructor(...args) {
        super(...args);
    }

    static createInstance(...args) {
        return new CharsetMediaRenderer(...args);
    }

    render() {
        const context = this.getContext();
        if (null == context) return;
        const ui = context.ui;
        const ctx = context.ctx;
        const viewSize = context.viewsize;
        const metrics = context.metrics;
        const palette = context.palette;

        const media = this.getMedia();
        if (null == media) return;

        if (null == media.charsetData) return;
        const count = media.charsetSize;
        if (count < 1) return;

        let mapDisplayWidth = 0;
        let mapDisplayHeight = 0;

        if (null != media.mapData && media.mapDataSize > 0) {
            const rep_x = (null != media.tiles) ? media.tiles.width : 1;
            const rep_y = (null != media.tiles) ? media.tiles.height : 1;

            mapDisplayWidth = media.mapWidth * rep_x * (metrics.charWidth + metrics.pixelPaddingX) - metrics.pixelPaddingX;
            mapDisplayHeight = media.mapHeight * rep_y * (metrics.charHeight + metrics.pixelPaddingY) - metrics.pixelPaddingY;
        }

        let viewSizeX = Math.max(viewSize.x - metrics.containerPadding * 2, mapDisplayWidth);

        let contentCols = Math.trunc((viewSizeX) / (metrics.charWidth + metrics.charPaddingX));
        let contentRows = Math.trunc((count + contentCols - 1) / contentCols);

        let charsetDisplayWidth = contentCols * (metrics.charWidth + metrics.charPaddingX) - metrics.charPaddingX;
        let charsetDisplayHeight = contentRows * (metrics.charHeight + metrics.charPaddingY) - metrics.charPaddingY;

        const canvasWidth = Math.max(charsetDisplayWidth, mapDisplayWidth);
        const canvasHeight = charsetDisplayHeight + Metrics.PADDING_Y + mapDisplayHeight;

        // resize canvas
        ui.content.style.width = (canvasWidth / metrics.devicePixelRatio) + "px";
        ui.content.style.height = (canvasHeight / metrics.devicePixelRatio) + "px";
        ui.content.width = canvasWidth;
        ui.content.height = canvasHeight;

        // start at 0/0

        let start_x = 0
        let ofs_x = 0;
        let ofs_y = 0;

        // draw map

        if (null != media.mapData) {
            start_x = Math.max(0, Math.trunc((Math.min(canvasWidth, viewSizeX) - mapDisplayWidth) / 2));
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

            ofs_y += Metrics.PADDING_Y;
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

    drawChar(idx, ofs_x, ofs_y, tileIndex=-1) {
        const context = this.getContext();
        const ctx = context.ctx;
        const palette = context.palette;
        const metrics = context.metrics;

        const media = this.getMedia();

        const displayMode = media.displayMode;
        const colorMethod = media.colorMethod;
        const tiles = media.tiles;

        if (idx < 0 || idx >= media.charsetSize) return;

        const charData = media.charsetData[idx];

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

        let y = ofs_y;

        for (let row=0; row<Metrics.C64_CHAR_HEIGHT; row++) {
            //let grid = (row & 0x1);

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

}

CharsetMediaRenderer.ClassName = CHARSET_MEDIA_RENDERER_CLASSNAME;

Factory.register(CharsetMediaRenderer);

export {
    CharsetMediaRenderer as CharsetMediaRenderer
};
