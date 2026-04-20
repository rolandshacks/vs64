//
// Assembler Language
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const vscode = require("vscode");

//-----------------------------------------------------------------------------------------------//
// Formatter for Turbo Macro Pro Assembler Files
//-----------------------------------------------------------------------------------------------//
class TmpFormatter {
    
    constructor() {        
    }

    format(document) {
        const edits = [];

        // For now only ensure code lines are indented correctly
        for (let i = 0; i < document.lineCount; i++) {
            const line = document.lineAt(i);

            const originalText = line.text;
            let formattedLine = originalText.trim();

            if (formattedLine.startsWith(';')) {
                // do not change comment line
                formattedLine = originalText;
            } else if (originalText.startsWith(' ') || originalText.startsWith('\t')) {
                formattedLine = '        ' + formattedLine;
            } else {
                // do not change labeled line
                formattedLine = originalText;
            }

            const range = new vscode.Range(line.range.start, line.range.end);
            edits.push(vscode.TextEdit.replace(range, formattedLine));
        }
        
        return edits;        
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    TmpFormatter: TmpFormatter
}
