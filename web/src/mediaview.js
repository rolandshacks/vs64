/**
 * Media View
 * @module Web
 */

import { Factory } from "./factory.js";
import { WebView, $, $$ } from "./webview.js";
import { MediaRendererContext } from "./mediarenderer.js"
import { Metrics } from "./metrics.js";
import { Timer } from "./timer.js";
import { Palette } from "./imports.js";

import {
    MediaType,
    SidMediaFile,
    TapeMediaFile,
    DiskMediaFile,
    SpriteMediaFile,
    CharsetMediaFile
} from "./media.js";

Factory.register(SidMediaFile);
Factory.register(DiskMediaFile);
Factory.register(SpriteMediaFile);
Factory.register(CharsetMediaFile);
Factory.register(TapeMediaFile);

import {} from "./charsetrenderer.js";
import {} from "./spriterenderer.js";
import {} from "./diskrenderer.js";
import {} from "./taperenderer.js";

const MEDIA_VIEW_CLASSNAME = "view.media";


//const PADDING_Y = 24;
//const ENABLE_SID_ANALYZER = false;

/**
 * Media view.
 */
class MediaView extends WebView {
    constructor(app, ...args) {
        super(app, ...args);

        this.renderer = null;

        this.asyncRenderTimer = new Timer();

        this.media = null;
        this.samples = null;
        this.error = null;

        this.metrics = new Metrics();
        this.palette = Palette.DEFAULT;

        let min_scale = Metrics.MIN_SCALE;
        let max_scale = Metrics.MAX_SCALE;

        this.style = {
            foregroundColor: window.getComputedStyle(document.body, null).getPropertyValue('color'),
            backgroundColor: window.getComputedStyle(document.body, null).getPropertyValue('background-color'),
            buttonForeground: getComputedStyle(document.body).getPropertyValue("--vscode-button-foreground"),
            buttonBackground: getComputedStyle(document.body).getPropertyValue("--vscode-button-background")
        };

        {
            const instance = this;
            const ui = instance.ui;

            {
                ui.toggleContent = $$("idToggleContent");

                ui.content = $$("idContent");
                ui.content.enableWheelListener((position, delta) => {
                    instance.handleWheel(position, delta);
                });

                ui.header = $$("idHeader");
                ui.properties = $$("idProperties");

                ui.slider = $$("idSliderScale");
                if (ui.slider) {

                    if (ui.slider.min != null) min_scale = parseInt(ui.slider.min);
                    if (ui.slider.max != null) max_scale = parseInt(ui.slider.max);

                    ui.slider.onchange = (v) => {
                        const value = parseInt(v.srcElement.value);
                        ui.lock();
                        instance.setScale(value, null, null, true);
                        ui.unlock();
                    };
                }

                ui.c64text = $$("idC64Text");
                ui.c64textbox = $$("idC64TextBox");
            }
        }

        this.setScale(Metrics.DEFAULT_SCALE, min_scale, max_scale);
    }

    static createInstance(...args) {
        return new MediaView(...args);
    }

    renderProperties(m) {
        let html = "";

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

    onDocument(_document) {
        this.asyncShowMediaAbort();

        if (this.media) {
            this.onMedia(this.media);
        }
    }

    onMedia(media) {
        if (null == this.renderer) {

            const mediaClass = MediaType.classFromType(media.mediaType);
            const rendererClass = "render." + mediaClass;

            try {
                this.renderer = Factory.createInstance(rendererClass);
            } catch (_) {
                /*
                this.error = {
                    message: "failed to instantiate renderer: " + rendererClass
                };
                return;
                */
            }
        } else {
            if (null != this.renderer.destroy) {
                this.renderer.destroy();
            }
        }

        if (null != this.renderer) {
            if (null != this.renderer.create) {
                this.renderer.create(this);
            }
        }

        if (this.ui) {
            this.ui.slider.visible = (
                null != this.renderer &&
                media.mediaType != MediaType.SID &&
                media.mediaType != MediaType.DISK &&
                media.mediaType != MediaType.TAPE
            );
        }
    }

    unpack() {
        this.error = null;

        const document = this.document;
        if (null == document) return;

        const name = document.name || "unnamed";
        const data = (document.text != null) ? document.text : document.data;

        if (null == this.media) {
            try {
                const className = MediaType.classFromExtension(document.extension);
                this.media = Factory.createInstance(className, name, data);
                this.media.setMediaClass(className);
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
        this.ui.toggleContent.visible = (!this.error);
        this.showProperties();
        this.asyncShowMedia();
    }

    showBadge(text) {
        const badge = $("idBadge");
        if (badge) {
            badge.innerText = text;
        }
    }

    showProperties() {
        const header = this.ui.header;
        const properties = this.ui.properties;

        if (this.error) {
            this.showBadge("No data.");

            let title = "";
            title += "<h1>" + this.error.file + "</h1>";
            if (this.error.message) {
                title += "<p>" + this.error.message + "</p>";
            } else if (this.error.size) {
                title += "<p>" + this.error.size + " bytes</p>";
            }

            header.innerHTML = title;
            properties.innerHTML = "";

        } else if (this.media) {
            const m = this.media;
            this.showBadge(m.get("type"));
            const title = "<h1>" + m.get("title", m.name) + "</h1>";
            header.innerHTML = title;
            const html = this.renderProperties(this.media);
            properties.innerHTML = html;
        }
    }

    asyncShowMedia() {
        this.asyncShowMediaAbort();

        const instance = this;
        this.asyncRenderTimer.once(() => {
            instance.showMedia();
        }, 0);
    }

    asyncShowMediaAbort() {
        this.asyncRenderTimer.stop();
    }

    showMedia() {
        if (null == this.media) return;
        if (null == this.renderer) return;

        const renderContext = new MediaRendererContext(this);
        this.metrics.update(this, this.media);
        this.renderer.begin(renderContext, this.media);
        this.renderer.render();
        this.renderer.end();
    }

    onScale() {
        if (null != this._scale && !this.ui.locked) {
            this.ui.slider.value = this._scale;
        }
        this.asyncShowMedia();
    }

    resize(_width, _height) {
        this.asyncShowMedia();
    }

    getPalette() {
        return this.palette;
    }

    getStyle() {
        return this.style;
    }

    getMetrics() {
        return this.metrics;
    }

}

MediaView.ClassName = MEDIA_VIEW_CLASSNAME;

Factory.register(MediaView);

export {
    MediaView as MediaView
};
