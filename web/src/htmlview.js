/**
 * Html View
 * @module Web
 */

import { Factory } from "./factory.js";
import { WebView, $$ } from "./webview.js";

const HTML_VIEW_CLASSNAME = "view.html";

/**
 * Html view.
 */
class HtmlView extends WebView {
    constructor(app) {
        super(app);
        this.ui.content = $$("idContent");
    }

    static createInstance(...args) {
        return new HtmlView(...args);
    }

    onDocument(document) {
        console.log("onDocument");
        if (document.html) {
            this.ui.content.innerHTML = document.html;
        }
    }
}

HtmlView.ClassName = HTML_VIEW_CLASSNAME;

Factory.register(HtmlView);

export {
    HtmlView as HtmlView
};
