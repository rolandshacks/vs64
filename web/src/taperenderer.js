/**
 * Tape Renderer
 * @module Web
 */

import { Factory } from "./factory.js";
import { MediaRenderer } from "./mediarenderer.js";
import { File } from "./media.js";

// renderer class identifiers
const TAPE_MEDIA_RENDERER_CLASSNAME = "render.media.tape";

class TapeMediaRenderer extends MediaRenderer {
    constructor(...args) {
        super(...args);
    }

    static createInstance(...args) {
        return new TapeMediaRenderer(...args);
    }

    render() {
        const context = this.getContext();
        if (null == context) return;
        const ui = context.ui;

        const media = this.getMedia();
        if (null == media) return;

        if (null == media.tape) return;
        const tape = media.tape;
        const dir = tape.directory;

        if (null != ui.c64text) {
            let s = "";

            s += "\"" + (tape.name + "                ").substring(0, 16) + "\"    " + tape.version + "\n";

            if (dir.length > 0) {
                for (const entry of dir) {
                    if (entry.type != File.TYPE_DEL) {
                        s += tapeFileToString(entry) + "\n";
                    }
                }
            } else {
                s += "EMPTY\n";
            }

            ui.c64text.innerText = s;
            ui.c64textbox.visible = true;
        }
    }
}

function tapeFileToString(f) {
    const name = ("\"" + f.name + "\"                ").substring(0, 18);
    const sz = (f.size + "      ").substring(0, 6);
    return sz + name + f.typeName;
}

TapeMediaRenderer.ClassName = TAPE_MEDIA_RENDERER_CLASSNAME;

Factory.register(TapeMediaRenderer);

export {
    TapeMediaRenderer as TapeMediaRenderer
};
