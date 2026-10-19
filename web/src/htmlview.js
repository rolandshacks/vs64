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
        const html = (document != null) ? document.html : undefined;
        this.ui.content.innerHTML = (html != null) ? html : "<p>Content unavailable.</p>";
    }
}

HtmlView.ClassName = HTML_VIEW_CLASSNAME;

Factory.register(HtmlView);

export {
    HtmlView as HtmlView
};
