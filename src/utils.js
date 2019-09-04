//
// Utilities
//

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const vscode = require('vscode');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

var Constants = require('src/constants');

//-----------------------------------------------------------------------------------------------//
// Utilities
//-----------------------------------------------------------------------------------------------//

var Utils = {

    ZEROS: "0000000000000000000000000000000000000000",

    fmt: function(n, digits, rightFill) {
        if (rightFill) {
            return (n + Utils.ZEROS).substr(0, digits);
        } else {
            return (Utils.ZEROS + n).substr(-digits);
        }
    },
    
    log: function(txt) {

        if (true != Constants.DebugLoggingEnabled) {
            return;
        }

        var d = new Date();
        var timestamp = "" + Utils.fmt(d.getHours(),2) + ":" +Utils.fmt(d.getMinutes(), 2) + ":" + Utils.fmt(d.getSeconds(), 2) + "." + Utils.fmt(d.getMilliseconds(), 3);

        console.log(timestamp + " " + txt);
    },

    debuggerLog: function(message) {
	    vscode.debug.activeDebugConsole.appendLine(message);
    },

    mkdirRecursive: function(dirname) {

        if (null == dirname || dirname == "") {
            return false;
        }

        if (fs.existsSync(dirname)) {
            return true;
        }

        var parentDir = path.dirname(dirname);
        if (parentDir.toLowerCase() == dirname.toLowerCase()) {
            return false;
        }

        if (!fs.existsSync(parentDir)) {
            if (false == Utils.mkdirRecursive(parentDir)) {
                return false;
            }
        }

        try {
            fs.mkdirSync(dirname);
        } catch (error) {
            return false;
        }

        return true;
    },

    compareFileTime: function(fileA, fileB) {

        var existsA = fs.existsSync(fileA);
        var existsB = fs.existsSync(fileB);

        if (!existsB && !existsA) {
            return 0;
        }

        if (!existsB) {
            return -1;
        }

        if (!existsA) {
            return 1;
        }

        var statsA = fs.statSync(fileA);
        var statsB = fs.statSync(fileB);

        var timeA = new Date(statsA.mtime).getTime();
        var timeB = new Date(statsB.mtime).getTime();

        if (timeA > timeB) {
            return -1;
        } else if (timeA < timeB) {
            return 1;
        } else {
            return 0;
        }
    },

    changeExtension: function(filename, extension) {
        var pos = filename.lastIndexOf('.');
        if (pos < 0) {
            return filename + extension||"";
        }

        return filename.substr(0, pos) + extension||"";
    },

    getCurrentAsmFile: function() {
        let editor = vscode.window.activeTextEditor;
        if (null == editor || null == editor.document) {
            return null;
        }

        if (editor.document.languageId !== Constants.AssemblerLanguageId) {
            return null;
        }

        return editor.document.fileName;
    },

    getOutputFilename: function(filename, extension) {

        var fileDir = path.dirname(filename);
        if (null != vscode.workspace.rootPath) {

            var workspacePath = vscode.workspace.rootPath;
            var outDir = path.join(workspacePath, Constants.OutputDirectory);
            var relFilePath = path.relative(workspacePath, fileDir);
            var basename = path.basename(filename, path.extname(filename));
            var outputFilename = path.join(outDir, relFilePath, basename + "." + extension);
            return outputFilename;
    
        } else {

            // in case no folder is open, put output file next to source file
            var outDir = path.dirname(filename);
            var basename = path.basename(filename, path.extname(filename));
            var outputFilename = path.join(outDir, basename + "." + extension);
            return outputFilename;

        }

    },

    findFile: function(baseDir, filename) {
        if (!fs.existsSync(baseDir)) {
            return null;
        }

        var elements = fs.readdirSync(baseDir);
        for (var i=0, element; (element=elements[i]); i++) {
            var filePath = path.join(baseDir, element);
            var stat = fs.lstatSync(filePath);
            if (stat.isDirectory()) {
                return Utils.findFile(filePath, filename);
            } else if (filename == element) {
                return filePath;
            }
        }
    },

    getAbsoluteFilename: function(filename) {
        if(filename && !path.isAbsolute(filename) && null != vscode.workspace.rootPath) {
            return path.resolve(vscode.workspace.rootPath, filename);
        } else {
            return filename;
        }
    }
};

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = Utils;
