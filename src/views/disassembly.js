/**
 * Disassembly View Provider
 * @module Views
 */

BIND(module);

const { AbstractViewProvider } = require('views/view');
const { BinaryDocument } = require('views/document');

const { Disassembler } = require('disassembler/disassembler');

function decode(document) {
    if (null == document) return null;

    const data = document.data;
    if (null == data) return null;

    const settings = document.options.settings;

    const options = {
        lower_case: (settings.basicCharset == 2)
    };

    const disassembler = new Disassembler(options);
    const html = disassembler.disassemble(data);

    document.setHtml(html);
}

/**
 * Disassembly View Provider
 * @extends AbstractViewProvider
 */
class DisassemblyViewProvider extends AbstractViewProvider {
    /**
     * @param {vscode.ExtensionContext} context
     * @param {Object} options
     */
    constructor(context, options) {
        super(context, options);
    }

    async createDocument(uri, options) {
        return new BinaryDocument(uri, options, (document) => {
            decode(document);
        });
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DisassemblyViewProvider: DisassemblyViewProvider
};
