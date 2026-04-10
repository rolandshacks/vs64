/**
 * Web Document
 * @module Web
 */

/**
 * WebDocument.
 */
class WebDocument {
    constructor() {}

    static fromRaw(content) {
        const document = new WebDocument();
        document.setRaw(content);
        return document;
    }

    clear() {
        this.uri = null;
        this.name = null;
        this.extension = null;
        this.data = null;
        this.html = null;
        this.json = null;
        this.text = null;
        this.mimeType = null;
    }

    setRaw(content) {
        if (null == content) {
            this.clear();
            return;
        }

        this.name = content.name;
        this.uri = content.uri;

        if (null != this.name) {
            const pos = this.name.lastIndexOf('.');
            this.extension = (pos >= 0) ? this.name.substring(pos + 1).toLowerCase() : "";
        } else {
            this.extension = null;
        }

        if (null != content.data) {
            if (content.data.type == "Buffer") {
                this.data = content.data.data;
            } else {
                this.data = content.data;
            }
        } else {
            this.data = null;
        }

        this.html = content.html;
        this.json = content.json;
        this.text = content.text;
        this.mimeType = content.mimeType;
    }

    setHtml(html) {
        this.html = html;
        if (null != html && null == this.mimeType) {
            this.mimeType = "text/html";
        }
    }

    setJson(json) {
        this.json = json;
        if (null != json && null == this.mimeType) {
            this.mimeType = "application/json";
        }
    }

    setText(text) {
        this.text = text;
        if (null != text && null == this.mimeType) {
            this.mimeType = "text/plain";
        }
    }

}

export {
    WebDocument as WebDocument
};
