//
// Vscode Mockup
//

class Uri {
    constructor() {
    }

    static file(fsPath) {
        const uri = new Uri();
        uri.scheme == "file";
        uri.fsPath = fsPath;
        uri.path = fsPath;
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Uri: Uri
}
