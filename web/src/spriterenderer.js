/**
 * Sprites Renderer
 * @module Web
 */

import { Factory } from "./factory.js";
import { MediaRenderer } from "./mediarenderer.js";
import { Metrics } from "./metrics.js";

// renderer class identifiers
const SPRITES_MEDIA_RENDERER_CLASSNAME = "render.media.sprites";

class SpriteMediaRenderer extends MediaRenderer {
    constructor(...args) {
        super(...args);
    }

    static createInstance(...args) {
        return new SpriteMediaRenderer(...args);
    }

    render() {
        const context = this.getContext();
        if (null == context) return;
        const ui = context.ui;
        const viewSize = context.viewsize;
        const metrics = context.metrics;

        const media = this.getMedia();
        if (null == media) return;

        if (null == media.sprites) return;
        const count = media.spriteCount;
        if (count < 1) return;

        const viewSizeX = viewSize.x - metrics.containerPadding * 2;

        let contentCols = Math.trunc(viewSizeX / (metrics.spriteWidth + metrics.spritePaddingX));
        let contentRows = Math.trunc((count + contentCols - 1) / contentCols);

        let spritesetDisplayWidth = contentCols * (metrics.spriteWidth + metrics.spritePaddingX) - metrics.spritePaddingX;
        let spritesetDisplayHeight = contentRows * (metrics.spriteHeight + metrics.spritePaddingY) - metrics.spritePaddingY;

        const canvasWidth = Math.max(viewSizeX, spritesetDisplayWidth);
        const canvasHeight = spritesetDisplayHeight;

        // resize canvas
        ui.content.style.width = (canvasWidth / metrics.devicePixelRatio) + "px";
        ui.content.style.height = (canvasHeight / metrics.devicePixelRatio) + "px";
        ui.content.width = canvasWidth;
        ui.content.height = canvasHeight;

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

    drawSprite(sprite, ofs_x, ofs_y) {

        const context = this.getContext();
        const ctx = context.ctx;
        const palette = context.palette;
        const metrics = context.metrics;

        const media = this.media;
        const spriteData = sprite.data;

        let y = ofs_y;

        let dataOfs = 0;
        for (let row=0; row<Metrics.C64_SPRITE_HEIGHT; row++) {
            //let grid = (row & 0x1);

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
}

SpriteMediaRenderer.ClassName = SPRITES_MEDIA_RENDERER_CLASSNAME;

Factory.register(SpriteMediaRenderer);

export {
    SpriteMediaRenderer as SpriteMediaRenderer
};
