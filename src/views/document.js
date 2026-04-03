/**
 * Document
 * @module Views
 */

BIND(module);

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const { Constants } = require('settings/settings');


/**
 * Custom Document.
 * @implements {vscode.CustomDocument}
 */
class Document {

    /**
     * Create document.
     * @param {vscode.Uri} uri - Uri of the document to create.
     * @param {*} options - Additional options.
     */
	constructor(uri, options, decodeFn, isBinary) {
        this._name = null;
		this._uri = uri;
		this._options = options;
		this._data = null;
        this._html = null;
        this._json = null;
        this._str = null;
        this._mimeType = null;
        this._listeners = new Map();
        this._decodeFn = decodeFn;
        this._isBinary = isBinary || false;

		const filePath = this._uri.fsPath;
        const instance = this;

		try {
            const watcher = fs.watchFile(filePath, (_curr_, _prev_) => {
                instance.handleChange();
            });
            this._watcher = watcher;
		} catch (_e) {
			//logger.error("failed to setup document file watcher: " + e);
		}
	}

    /**
     * Getter for document options.
     *@type {*}
     */
	get options() { return this._options; }

    /**
     * Getter for document name.
     *@type {string}
     */
	get name() {
        if (null == this._uri) return null;
        if (null != this._name) return this._name;

        const uriPath = this._uri.path;

        const pos = uriPath.lastIndexOf('/');
        this._name = (pos >= 0) ? uriPath.substring(pos+1) : uriPath;

        return this._name;
    }

    /**
     * Getter for document uri.
     *@type {vscode.Uri}
     */
	get uri() { return this._uri; }

    /**
     * Getter for document data.
     * @type {*}
     */
	get data() { return this._data; }

    /**
     * Getter for html representation of data.
     * @type {*}
     */
	get html() { return this._html; }

    /**
     * Getter for json representation of document.
     * @type {*}
     */
	get json() { return this._json; }

    /**
     * Getter for text representation of document.
     * @type {*}
     */
	get text() { return this._text; }

    /**
     * Getter for document mime type.
     * @type {string}
     */
	get mimeType() { return this._mimeType; }

    setHtml(html) { this._html = html; this._mimeType ||= "text/html"; }
    setJson(json) { this._json = json; this._mimeType ||= "application/json"; }
    setText(text) { this._text = text; this._mimeType ||= "text/plain"; }
    setData(data) { this._data = data; }

    /**
     * Init variables.
     */
    #init() {
        this._data = null;
        this._html = null;
        this._json = null;
        this._text = null;
        this._mimeType = null;
    }

    /**
     * Dispose document.
     */
	dispose() {
		if (this._watcher) {
			const filepath = this._uri.fsPath;
            fs.unwatchFile(filepath);
			this._watcher = null;
		}
	}

    /**
     * Load document data.
     */
    async load() {

        const uri = this._uri;

        if (this._isBinary) {
            this._data = await this.#readBinaryFile(uri);
        } else {
            this._text = await this.#readTextFile(uri);
        }

        if (this._decodeFn) {
            // custom decoder function
            this._decodeFn(this);
        }
    }

    /**
     * Read text file from file system
     * @param {vscode.Uri} uri - Uri of the file to read.
     */
    async #readTextFile(uri) {
        const textDocument = await vscode.workspace.openTextDocument(uri);
        return textDocument.getText();
    }

    /**
     * Read binary file from file system
     * @param {vscode.Uri} uri - Uri of the file to read.
     */
    async #readBinaryFile(uri) {
        return await vscode.workspace.fs.readFile(uri);
    }

    /**
     * Handle document change.
     */
    async handleChange() {

        this.#init();

        const uri = this._uri;
		if (uri.scheme !== 'untitled') {
            try {
                await this.load();
            } catch (_err_) { ; }
		}

        const instance = this;
        const listeners = this._listeners.values();
        for (const listener of listeners) {
            listener(instance);
        }
    }

    /**
     * Change event handler.
     * @param {*} instance
     * @param {*} listener
     */
    onChange(instance, listener) {
        if (listener) {
            this._listeners.set(instance, listener);
        } else {
            this._listeners.delete(instance);
        }
    }

}

/**
 * Binary Document.
 * @extends {Document}
 */
class BinaryDocument extends Document {
    /**
     * Create document.
     * @param {vscode.Uri} uri - Uri of the document to create.
     * @param {*} options - Additional options.
     */
	constructor(uri, options, decodeFn) {
        super(uri, options, decodeFn, true);
    }
}


//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Document: Document,
    BinaryDocument: BinaryDocument
};
