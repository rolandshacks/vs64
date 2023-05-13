//
// Task Provider
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
const { Constants } = require('settings/settings');
const { Logger } = require('utilities/logger');

const logger = new Logger("Tasks");

//-----------------------------------------------------------------------------------------------//
// Task Provider
//-----------------------------------------------------------------------------------------------//

const TASK_PROVIDER_TYPE = "vs64";

function addStyle(txt, ...styles) {
    const args = arguments.slice(1);
    if (args.length < 1) return;
    let str = "";
    for (const arg of args) {
        str += "\x1b[" + arg + "m";
    }
    str += txt + "\x1b[0m";
}

class TaskTerminal {
    constructor(definition, settings, builder) {
        this._definition = definition;
        this._settings = settings;
        this._builder = builder;

        this._writeEmitter = new vscode.EventEmitter();
        this.onDidWrite = this._writeEmitter.event;

        this._closeEmitter = new vscode.EventEmitter();
        this.onDidClose = this._closeEmitter.event;
    }

    open() {
        this.doBuild();
    }

    close() {
    }

    write(plainText) {

        if (arguments.length < 2) {
            this._writeEmitter.fire(plainText);
            return;
        }

        let styledText = "";
        for (let i=1; i<arguments.length; i++) {
            styledText += "\x1b[" + arguments[i] + "m";
        }

        styledText += plainText + "\x1b[0m";
        this._writeEmitter.fire(styledText);
    }

    done() {
        this._closeEmitter.fire(0);
    }

    doBuild() {
        const thisInstance = this;
        const definition = this._definition;
        return this._builder(definition.action, definition.folder, thisInstance);
    }

}

class TaskProvider {

    constructor(settings, builder) {
        this._settings = settings;
        this._tasks = null;
        this._projectConfigName = this._settings.projectFile||Constants.ProjectConfigFile;
        this._builder = builder;
    }

    invalidate() {
        if (this._tasks) {
            this._tasks = null;
        }
    }

    provideTasks() {
        if (!this._tasks) {
            this._tasks = this.getTasks();
        }
        return this._tasks;
    }

    resolveTask(task) {
        const definition = task.definition;
        const type = definition.type;
        if (type != TASK_PROVIDER_TYPE) return null;
        return this.getTask(definition);
    }

    getTasks() {

        const tasks = [];

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length == 0) {
            return tasks;
        }

        const actions = ["build", "rebuild", "clean"];

        for (const workspaceFolder of workspaceFolders) {

            for (const action of actions) {

                const definition = {
                    type: TASK_PROVIDER_TYPE,
                    action: action,
                    folder: workspaceFolder
                };

                const task = this.getTask(definition);
                if (task) tasks.push(this.getTask(definition));
            }
        }

        return tasks;
    }

    getTask(definition) {

        if (!definition.folder) {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length == 0) {
                return null;
            }
            definition.folder = workspaceFolders[0]; // use default folder
        }

        const folderString = definition.folder.uri.fsPath;
        if (!folderString) {
            return null;
        }

        const projectConfigName = this._projectConfigName;
        const projectFile = path.join(folderString, projectConfigName);
        if (!fs.existsSync(projectFile)) {
            return null;
        }

        const instance = this;

        const task = new vscode.Task(
            definition,
            definition.folder,
            definition.action,
            definition.type,
            new vscode.CustomExecution(
                (definition) => {
                    return new TaskTerminal(definition, instance._settings, instance._builder);
                }
            ),
            ["$builder"]
        );

        task.group = vscode.TaskGroup.Build;

        return task;

    }

}

TaskProvider.Type = TASK_PROVIDER_TYPE;

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    TaskProvider: TaskProvider
};
