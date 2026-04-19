/**
 * Media Renderer
 * @module Web
 */

import { Factory } from "./factory.js";

// renderer class identifiers
const UNKNOWN_MEDIA_RENDERER_CLASSNAME = "render.media.unknown";
//const SPRITES_MEDIA_RENDERER_CLASSNAME = "render.media.sprites";
//const SID_MEDIA_RENDERER_CLASSNAME = "render.media.sid";
//const DISK_MEDIA_RENDERER_CLASSNAME = "render.media.disk";
//const TAPE_MEDIA_RENDERER_CLASSNAME = "render.media.tape";

// renderer constants
/*
const DEFAULT_SCALE = 2;
const MIN_SCALE = 1;
const MAX_SCALE = 8;
const GRID_ENABLE_ZOOM_LEVEL = 4;
const PADDING_Y = 24;
const C64_SPRITE_WIDTH = 24;
const C64_SPRITE_HEIGHT = 21;
const C64_CHAR_WIDTH = 8;
const C64_CHAR_HEIGHT = 8;
const DEVICE_PIXEL_RATIO_OFFSET = 0.50; // add before round up to integer pixel scale
const ENABLE_SID_ANALYZER = false;
*/

/**
 * Media renderer context.
 */
class MediaRendererContext {
    constructor(view) {
        this.view = view;
        this.ui = view.ui;
        this.ctx = view.ui.content.ctx;
        this.metrics = view.getMetrics();
        this.palette = view.getPalette();
        this.viewsize = view.getScaledViewSize();
        this.style = view.getStyle();
    }
}

/**
 * Media renderer.
 */
class MediaRenderer {
    constructor() {
        this.view = null;
        this.context = null;
        this.media = null;
    }

    static createInstance(...args) {
        return new MediaRenderer(...args);
    }

    create(view) {
        this.view = view;
    }

    destroy() {
        this.view = null;
        this.context = null;
    }

    begin(context, media) {
        this.context = context;
        this.media = media;
    }

    render() {
    }

    end() {
        this.context = null;
        this.media = null;
    }

    getContext() {
        return this.context;
    }

    getMedia() {
        return this.media;
    }

}

MediaRenderer.ClassName = UNKNOWN_MEDIA_RENDERER_CLASSNAME;

Factory.register(MediaRenderer);

export {
    MediaRenderer as MediaRenderer,
    MediaRendererContext as MediaRendererContext
};
