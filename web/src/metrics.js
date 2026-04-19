/**
 * Metrics
 * @module Web
 */

import {
    CharsetDisplayMode
} from "./media.js";

const DEFAULT_SCALE = 2;
const MIN_SCALE = 1;
const MAX_SCALE = 8;

const GRID_ENABLE_ZOOM_LEVEL = 4;
const C64_SPRITE_WIDTH = 24;
const C64_SPRITE_HEIGHT = 21;
const C64_CHAR_WIDTH = 8;
const C64_CHAR_HEIGHT = 8;
const DEVICE_PIXEL_RATIO_OFFSET = 0.50; // add before round up to integer pixel scale
const PADDING_Y = 24;

class Metrics {
    constructor() {
    }

    update(view, media) {
        const metrics = this;

        const displayMode = media.displayMode;
        const doubleWidth = (displayMode == CharsetDisplayMode.TextMultiColor || displayMode == CharsetDisplayMode.BitmapMultiColor);

        let containerPaddingStyle = parseInt(getComputedStyle(document.querySelector(':root')).getPropertyValue("--container-paddding"), 10);
        metrics.containerPadding = isNaN(containerPaddingStyle) ? 0 : containerPaddingStyle;

        metrics.devicePixelRatio = window.devicePixelRatio || 1;
        const pixelScaleFactor = Math.floor(Math.max(1, metrics.devicePixelRatio + DEVICE_PIXEL_RATIO_OFFSET));

        metrics.scale = view.scale;

        metrics.charPaddingX = 1;
        metrics.charPaddingY = 1;

        metrics.spritePaddingX = 4;
        metrics.spritePaddingY = 4;

        metrics.gridEnabled = (metrics.scale >= GRID_ENABLE_ZOOM_LEVEL);

        metrics.pixelPaddingX = metrics.gridEnabled ? 1 : 0;
        metrics.pixelPaddingY = metrics.gridEnabled ? 1 : 0;

        metrics.pixelWidth = metrics.scale * pixelScaleFactor;
        metrics.pixelWidthMulti = metrics.pixelWidth * 2;
        metrics.pixelHeight = metrics.scale * pixelScaleFactor;

        metrics.scrollbarSize = view.options.scrollbarSize;

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

        metrics.trackWidth = 32 * pixelScaleFactor;
        metrics.trackHeight = 32 * pixelScaleFactor;
        metrics.trackPaddingX = 1;
        metrics.trackPaddingY = 1;

        return metrics;
    }
}

Metrics.DEFAULT_SCALE = DEFAULT_SCALE;
Metrics.MIN_SCALE = MIN_SCALE;
Metrics.MAX_SCALE = MAX_SCALE;
Metrics.GRID_ENABLE_ZOOM_LEVEL = GRID_ENABLE_ZOOM_LEVEL;
Metrics.C64_SPRITE_WIDTH = C64_SPRITE_WIDTH;
Metrics.C64_SPRITE_HEIGHT = C64_SPRITE_HEIGHT;
Metrics.C64_CHAR_WIDTH = C64_CHAR_WIDTH;
Metrics.C64_CHAR_HEIGHT = C64_CHAR_HEIGHT;
Metrics.DEVICE_PIXEL_RATIO_OFFSET = DEVICE_PIXEL_RATIO_OFFSET;
Metrics.PADDING_Y = PADDING_Y;

export {
    Metrics as Metrics
};
