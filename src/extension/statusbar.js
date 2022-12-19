//
// Status Bar Item
//

const path = require('path');
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

const logger = new Logger("Tasks");

//-----------------------------------------------------------------------------------------------//
// Status Bar Item
//-----------------------------------------------------------------------------------------------//

class StatusBarItem {
    constructor(commandId) {
        this._commandId = commandId;
        this._item = null;
        this._timeout = null;

        this.#create();
    }

    get item() { return this._item; }

    #create() {
        const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
        item.command = this._commandId;
        this._item = item;
    }

    set(text) {
        this.clearTimeout();

        const item = this._item;
        item.text = text;

        if (!text) {
            item.hide();
            return;
        }

        item.show();

        const thisInstance = this;
        setTimeout(() => {
            thisInstance.hide();
        }, 3000);
    }

    hide() {
        clearTimeout();
        const item = this._item;
        item.hide();
    }

    clearTimeout() {
        if (this._timeout) {
            clearTimeout(this._timeout);
            this._timeout = null;
        }
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    StatusBarItem: StatusBarItem
};
