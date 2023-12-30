//
// Disassembler Content Provider
//

const fs = require('fs');
const vscode = require('vscode');
//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger } = require('utilities/logger');
const { Disassembler } = require('disassembler/disassembler');

const logger = new Logger("DisassemblerView");

//-----------------------------------------------------------------------------------------------//
// Helper
//-----------------------------------------------------------------------------------------------//

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

//-----------------------------------------------------------------------------------------------//
// Disassembly File
//-----------------------------------------------------------------------------------------------//

class DisassemblyDocument {

	static async create(uri, settings) {
		return new DisassemblyDocument(uri, settings);
	}

	constructor(uri, settings) {
		logger.debug("create disassembly document");
		this._uri = uri;
		this._settings = settings;
		this._html = null;
        this._listeners = new Map();

		const path = this._uri.fsPath;
        const instance = this;

		try {
            const watcher = fs.watchFile(path, (_curr_, _prev_) => {
                instance.handleChange();
            });
            this._watcher = watcher;
		} catch (e) {
			logger.error("failed to setup document file watcher: " + e);
		}
	}

    async load() {
        const uri = this._uri;

		if (uri.scheme === 'untitled') {
			this._html = null;
            return;
		}

		const binary = new Uint8Array(await vscode.workspace.fs.readFile(uri));
		const settings = this._settings;

		const options = {
			lower_case: (settings.basicCharset == 2)
		};

		const disassembler = new Disassembler(options);
		this._html = disassembler.disassemble(binary);
    }

	dispose() { // inherited from CustomDocument
		logger.debug("dispose disassembly document");
		if (this._watcher) {
			const path = this._uri.fsPath;
            fs.unwatchFile(path);
			this._watcher = null;
		}
	}

    async handleChange() {
        await this.load();
        const instance = this;
        const listeners = this._listeners.values();
        for (const listener of listeners) {
            listener(instance);
        }
    }

    onChange(instance, listener) {
        if (listener) {
            this._listeners.set(instance, listener);
        } else {
            this._listeners.delete(instance);
        }
    }

	get uri() { return this._uri; }
	get viewType() { return "vs64.prg"; }
	get html() { return this._html; }

}

//-----------------------------------------------------------------------------------------------//
// Disassembler
//-----------------------------------------------------------------------------------------------//

class DisassemblerView {
    constructor(context, settings) {
		logger.trace("create instance");
        this._context = context;
		this._settings = settings;
		this._webviewPanel = null;
    }

    async openCustomDocument(uri, _openContext_, _cancellationToken_) {
		logger.trace("open custom document");
		const document = await DisassemblyDocument.create(uri, this._settings);
        await document.load();
		return document;
    }

	async resolveCustomDocument(document, _cancellationToken_) {
		logger.trace("resolve custom document");
		return document;
	}

    async resolveCustomEditor(document, webviewPanel, _cancellationToken_) {
		logger.trace("resolve custom editor");

		const instance = this;
		this._webviewPanel = webviewPanel;

        webviewPanel.webview.options = { enableScripts: true, };
		webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

        document.onChange(instance, (doc) => {
            instance.updateWebview(doc);
        });

        webviewPanel.onDidDispose(() => {
            document.onChange(instance, null);
        });

		const view = webviewPanel.webview;

        // Receive message from the webview.
        view.onDidReceiveMessage(e => {
            if (e.type == 'ready') {
				if (document.uri.scheme === 'untitled') {
					view.postMessage({
						type: 'init',
						untitled: true
					});
				} else {
					//const editable = vscode.workspace.fs.isWritableFileSystem(document.uri.scheme);
					view.postMessage({
						type: 'init',
						html: document.html
					});
				}

            }
        });

    }

	updateWebview(document) {
		logger.trace("updateWebview");
		const webviewPanel = this._webviewPanel;
		const view = webviewPanel.webview;
		view.postMessage({
			type: 'update',
			html: document.html
		});
	}

    getHtmlForWebview(webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'disassembly.js'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'vscode.css'));
		const styleDisassUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'disassembly.css'));

		const nonce = getNonce();

		return /* html */`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleVSCodeUri}" rel="stylesheet" />
				<link href="${styleDisassUri}" rel="stylesheet" />
				<title>Disassembly</title>
			</head>
			<body>
				<div id="idContent"></div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DisassemblerView: DisassemblerView
};
