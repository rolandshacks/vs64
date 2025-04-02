//
// Debug Helper
//

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
const logger = new Logger("DebugHelper");

//-----------------------------------------------------------------------------------------------//
// Debug Helper
//-----------------------------------------------------------------------------------------------//
class DebugHelper {
    static parseAddressString(str) {

        if (null == str) return null;

        str = str.trim();
        if (str == "") return null;

        let value = 0x0;

        if (str.charAt(0) == "$") {
            value = parseInt(str.substr(1), 16);
        } else if (str.substr(0, 2) == "0x") {
            value = parseInt(str.substr(2), 16);
        } else {
            value = parseInt(str);
        }

        if (isNaN(value)) return null;

        return value;
    }

    static showCode(filename, line) {

        logger.trace("show code " + filename + ":" + line);

        vscode.workspace.openTextDocument(filename)
        .then(textDocument => {
            let documentLine = textDocument.lineAt(line-1);
            if (null != documentLine) {
                vscode.window.showTextDocument(textDocument)
                .then(textEditor => {
                    textEditor.revealRange(documentLine.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
                })
                .catch((_err_) => {
                    logger.error("failed to show text document " + filename + ", line " + line);
                });
            }
        })
        .catch((_err_) => {
            logger.error("failed to open text document " + filename + ", line " + line);
        });
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugHelper: DebugHelper
}
