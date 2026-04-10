/**
 * Web application
 * @module Web
 */

/* global window, document, acquireVsCodeApi */

const vscode = (typeof acquireVsCodeApi !== "undefined") ? acquireVsCodeApi() : null;

import { UI } from "./ui.js";
import { WebDocument } from "./document.js";
import { Factory } from "./factory.js";
import { WebView } from "./webview.js";
import { HtmlView } from "./htmlview.js";
import { MediaView } from "./mediaview.js";

/**
 * Abstract application.
 */
class AbstractApplication {
    constructor(config) {
        this._name = config.name;
        this._viewClassId = config.viewclass;
        this._view = null;
        this._activated = false;
        this._document = null;
        this._options = {};
        this._config = config;

        this.registerEventHandlers();
    }

    get name() { return this._name; }
    get viewClassId() { return this._viewClassId; }
    get view() { return this._view; }
    get document() { return this._document; }
    get activated() { return this._activated; }
    get options() { return this._options; }
    get config() { return this._config; }

    registerEventHandlers() {
        const instance = this;

        window.onload = function() {
            instance.activate();
        };

        window.onresize = function() {
            if (instance.activated) {
                instance.resize(window.innerWidth, window.innerHeight);
            }
        }
    }

    activate() {
        const instance = this;

        UI.init();

        this.getScrollbarSize();
        this._activated = true;

        window.addEventListener('message', async e => { instance.onMessage(e.data); });

        this.postMessage({ type: 'ready' });
    }

    async onMessage(message) {
        if (null != message) {
            const type = message.type;
            if (type == 'init') {
                this.createView();
                this.setContent(message);
            } else if (type == 'update') {
                this.setContent(message);
            } else if (type == 'command') {
                if (message.command && message.command.length > 0) {
                    const command = message.command.toLowerCase();
                    this.dispatchCommand(command, message);
                }
            }
        }
    }

    dispatchCommand(_command_, _message_) {}

    postMessage(message) {
        if (null == vscode) return;
        vscode.postMessage(message);
    }

    createView() {
        if (null != this._view) return;

        const app = this;

        const view = Factory.createInstance(
            this.viewClassId,
            app,
        );

        if (null != view) {
            view.create();
            this._view = view;
        }
    }

    getScrollbarSize() {
        const options = this._options;
        if (!options.scrollbarSize) {
            const temporaryElement = document.createElement("div");
            temporaryElement.style.cssText = "overflow:scroll; visibility:hidden; position:absolute;";
            document.body.appendChild(temporaryElement);
            options.scrollbarSize = {
                width: temporaryElement.offsetWidth - temporaryElement.clientWidth,
                height: temporaryElement.offsetHeight - temporaryElement.clientHeight
            };
            temporaryElement.remove();
        }
        return options.scrollbarSize;
    }

    /**
     * Resize content div to parent
     */
    resizeToParent() {
        const element = this.element;
        if (null != element) {
            const scrollbarSize = this.getScrollbarSize();
            element.style.width = (Math.floor(window.innerWidth) - scrollbarSize.width - 1)+"px";
            element.style.height = (Math.floor(window.innerHeight) - 1)+"px";
        }
    }

    /**
     * Handle element resize
     * @param {*} width
     * @param {*} height
     */
    resize(width, height) {
        const view = this.view;
        if (null != view) {
            view.resize(width, height);
        }
    }

    /**
     * Set content.
     * @param {*} content
     * @returns
     */
    setContent(content) {
        this._document = WebDocument.fromRaw(content);
        this.update();
    }

    /**
     * Update view data
     */
    update() {
        const view = this._view;
        if (null != view) {
            view.setDocument(this.document);
        }
    }
}

/**
 * Application.
 */
class Application extends AbstractApplication {
    constructor(config) {
        super(config);
        Application._instance = this;
    }
    static get instance() { return Application._instance; }
}

Application._instance = null;

export {
    Application
};
