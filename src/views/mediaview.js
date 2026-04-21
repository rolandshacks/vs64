/**
 * Media View Provider
 * @module Views
 */

BIND(module);

const { AbstractViewProvider } = require('views/view');
const { BinaryDocument } = require('views/document');

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
        return new BinaryDocument(uri, options);
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    MediaViewProvider: MediaViewProvider
};
