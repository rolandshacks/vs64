/**
 * Media View Provider
 * @module Views
 */

BIND(module);

const path = require('path');

const { AbstractViewProvider } = require('views/view');
const { Document } = require('views/document');

/**
 * Media View Provider
 * @extends AbstractViewProvider
 */
class MediaViewProvider extends AbstractViewProvider {
    /**
     * @param {vscode.ExtensionContext} context
     * @param {Object} options
     */
    constructor(context, options) {
        super(context, options);
    }

    async createDocument(uri, options) {

        const filePath = uri.fsPath;
        const ext = path.extname(filePath).toLowerCase();
        const isBinary = (ext != ".spm");

        return new Document(uri, options, null, isBinary);
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    MediaViewProvider: MediaViewProvider
};
