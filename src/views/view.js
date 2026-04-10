/**
 * View Provider
 * @module Views
 */

BIND(module);

const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

const { Logger } = require('utilities/logger');
const { Document } = require('views/document');

const logger = new Logger("AbstractViewProvider");

/**
 * Abstract view provider.
 * @implements vscode.CustomReadonlyEditorProvider
 */
class AbstractViewProvider {
    /**
     * @param {vscode.ExtensionContext} context
     * @param {Object} options
     */
    constructor(context, options) {
        this._context = context;
		this._options = options;
        this._activeView = null;
    }

    get activeView() { return this._activeView; }

    async createDocument(uri, options) {
        return Document.create(uri, options);
    }

    /**
     * Create a new document for a given resource.
     * @param {vscode.Uri} uri - Uri of the document to open.
     * @param {vscode.CustomDocumentOpenContext} openContext - Additional information about the opening custom document.
     * @param {vscode.CancellationToken} cancellationToken - A cancellation token that indicates the result is no longer needed.
     * @returns The custom document.
     */
    async openCustomDocument(uri, _openContext_, cancellationToken) {
        if (cancellationToken && cancellationToken.isCancellationRequested) return null;
		const document = await this.createDocument(uri, this._options);
        await document.load();
		return document;
    }

    /**
     * Resolve a custom editor for a given resource.
     * @param {*} document - Document for the resource being resolved.
     * @param {vscode.WebviewPanel} webviewPanel - The webview panel used to display the editor UI for this resource.
     * @param {vscode.CancellationToken} cancellationToken - A cancellation token that indicates the result is no longer needed.
     */
    async resolveCustomEditor(document, webviewPanel, cancellationToken) {

        if (cancellationToken && cancellationToken.isCancellationRequested) return;

		const instance = this;

        const doc = document;
		const view = webviewPanel.webview;

        view.options = {
            enableScripts: true
        };

		view.html = this.#getHtml(view);

        doc.onChange(instance, (doc) => {
            instance.#updateView(doc, view);
        });

        webviewPanel.onDidChangeViewState((event) => {
            if (event && event.webviewPanel) {
                instance.#updateViewState(doc, view, event.webviewPanel.active);
            }
        })

        webviewPanel.onDidDispose(() => {
            instance.#disposeView(doc, view);
            doc.onChange(instance, null);
        });

        this._activeView = view;

        // Receive message from the webview.
        view.onDidReceiveMessage(e => {
            if (e.type == 'ready') {
				if (doc.uri.scheme === 'untitled') {
					view.postMessage({
						type: 'init',
						untitled: true
					});
				} else {
					//const editable = vscode.workspace.fs.isWritableFileSystem(document.uri.scheme);
                    const msg = instance.#createMessage("init", doc);
					view.postMessage(msg);
				}
            }
        });
    }

    /**
     * Notify view to update.
     * @param {*} document - Document containing view data.
     * @param {*} view - View.
     */
	#updateView(document, view) {
        if (null == document || null == view) return;
		view.postMessage(this.#createMessage("update", document));
	}

    /**
     * Notify view to update.
     * @param {*} document - Document containing view data.
     * @param {*} view - View.
     * @param {bool} active - Flag is active or not.
     */
    #updateViewState(document, view, active) {
        if (active) {
            this._activeView = view;
        } else {
            if (this._activeView == view) this._activeView = null;
        }
    }

    /**
     * Handle view disposal.
     * @param {*} document - Document containing view data.
     * @param {*} view - View.
     */
    #disposeView(document, view) {
        if (this._activeView == view) this._activeView = null;
    }

    /**
     * Create message object
     * @param {string} type - Message type ('init' or 'update').
     * @param {Document} document - A document.
     * @returns {Object} Returns a message object to be sent to a web view.
     */
    #createMessage(type, document) {
        const message = {
            type: type,
            name: document.name,
            uri: document.uri,
            data: document.data,
            html: document.html,
            json: document.json,
            text: document.text,
            mimeType: document.mimeType
        };

        if (document.html) {
            if (null == document.mimeType || document.mimeType == "") {
                message.mimeType = "text/html";
            }
        } else if (document.json) {
            if (null == document.mimeType || document.mimeType == "") {
                message.mimeType = "application/json";
            }
        } else if (document.text) {
            if (null == document.mimeType || document.mimeType == "") {
                message.mimeType = "text/plain";
            }
        }

        return message;
    }

    /**
     * Get resource data from extension code.
     * @param {string} filename
     * @returns {Object}
     */
    #loadResourceFile(filename) {
        const absFilename = path.resolve(this._context.extensionPath, 'web', filename);

        let data = null;

        try {
            data = fs.readFileSync(absFilename, 'utf8');
        } catch(_e) {
            logger.error("failed to load web resource: \"" + absFilename + "\"");
            return null;
        }

        return data;
    }

    /**
     * Resolve macros in string content file.
     * @param {string} template - Content template.
     * @param {Object} dict - Java object with key / values.
     * @returns {string} - Resolved content.
     */
    #resolveMacros(template, dict) {
        if (null == template || template.length < 1) return template;

        const resolved = template.replaceAll(/\$\{\s*\b([a-zA-Z_][a-zA-Z0-9_]*)\b\s*\}/g, (match, capture) => {
            if (!capture) return "?";

            const value = dict[capture];
            if (null == value) return "${undefined:" + capture + "}";
            return value;
        });

        return resolved;
    }

    /**
     * Get nonce with random characters.
     * @returns {string}
     */
    #getNonce() {
        const nonceChars = AbstractViewProvider.NONCE_CHARS;
        let text = '';
        for (let i = 0; i < 32; i++) {
            text += nonceChars.charAt(Math.floor(Math.random() * nonceChars.length));
        }
        return text;
    }

    /**
     * Render html.
     * @returns {string}
     */
    #getHtml(webview) {
        const options = this._options;

        const name = (options && options.name) ? options.name : "unnamed";
        const title = (options && options.title) ? options.title : name;
        const indexFile = (options && options.index) ? options.index : name + ".html";
        const nonce = this.#getNonce();
        const dist = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'dist'));

        const dict = {
            NAME: name,
            TITLE: title,
            INDEX: indexFile,
            NONCE: nonce,
            CSP_SOURCE: webview.cspSource,
            RES: webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'web')),
            SRC: webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'web', 'src')),
            MODULES: webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'node_modules')),
            EXT: webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri)),
            DIST: dist,
            BUNDLEIMPORT: 'import { main } from "' + dist + '/web.js";',
            BUNDLEENTRY: 'main(config);',
            TESTSTYLE: ''
        };

        const html = this.#resolveMacros(this.#loadResourceFile(indexFile), dict);

        return html;
	}
}

AbstractViewProvider.NONCE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    AbstractViewProvider: AbstractViewProvider
};
