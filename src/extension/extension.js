//
// VS64 Extension
//

const path = require('path');
const fs = require('fs');
const vscode = require('vscode');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "..");
global.BIND = function(_module) {
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger } = require('utilities/logger');
const { Constants, AnsiColors, Settings } = require('settings/settings');
const { Project } = require('project/project');
const { VscodeUtils } = require('utilities/vscode_utils');
const { DebugContext } = require('debugger/debug_context');
const { Build, BuildResult } = require('builder/builder');
const { DiagnosticProvider } = require('extension/diagnostic_provider');
const { TaskProvider } = require('extension/task_provider');
const { StatusBarItem } = require('extension/statusbar');
const { DisassemblerView } = require('extension/disassembler_view');

const logger = new Logger("Extension");

//-----------------------------------------------------------------------------------------------//
// Extension
//-----------------------------------------------------------------------------------------------//

class Extension {

    /**
     * @param {vscode.ExtensionContext} extensionContext
     */
    constructor(extensionContext) {
        this._extensionContext = extensionContext;
        this._debugContext = null;
        this._outputChannel = null;
        this._settings = new Settings();
        this._project = new Project(this._settings);
        this._builder = null;
        this._taskProvider = null;
        this._buildTimer = null;
        this._statusBarItem = null;
    }

    get settings() {
        return this._settings;
    }

    get project() {
        return this._project;
    }

    hasWorkspace() {
        return (null != vscode.workspace.rootPath);
    }

    activate() {

        const thisInstance = this;
        const extensionContext = this._extensionContext;
        const subscriptions =  extensionContext.subscriptions;

        const workspaceRoot = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : null;
	    if (!workspaceRoot) {
		    return;
    	}

        { // create output channel
            this._outputChannel = vscode.window.createOutputChannel("VS64");
        }

        { // load settings
            this.updateSettings();

            let disposable = vscode.workspace.onDidChangeConfiguration(function(e) {
                thisInstance.updateSettings();
            });

            subscriptions.push(disposable);
        }

        { // load project
            this.updateProject();
        }

        { // create diagnostic provider
            this._diagnostics = new DiagnosticProvider(this);
        }

        { // create status bar item

            this._statusBarItem = new StatusBarItem("vs64.showStatus");
            subscriptions.push(this._statusBarItem.obj);
        }

        // listen do document save
        vscode.workspace.onDidSaveTextDocument((document) => {

            if (!document || null == vscode.window.activeTextEditor) return;
            if (!this._project.isValid()) return;

            const fileName = path.basename(document.fileName);
            if (fileName != Constants.ProjectConfigFile &&
                document.languageId !== Constants.AssemblerLanguageId &&
                document.languageId !== Constants.CLanguageId) {
                return;
            }

            thisInstance.onSave(document);
        });

        // register "show welcome" command
        {
            subscriptions.push(vscode.commands.registerCommand("vs64.showWelcome", function() {
                thisInstance.showWelcome(true);
            }));
        }

        // register "show settings" command
        {
            subscriptions.push(vscode.commands.registerCommand("vs64.showSettings", function(filter) {
                thisInstance.showSettings(filter, true);
            }));
        }

        // register "create project" commands
        {
            subscriptions.push(vscode.commands.registerCommand("vs64.createProjectAsm", function() {
                thisInstance.onCommandCreateProject("asm");
            }));
            subscriptions.push(vscode.commands.registerCommand("vs64.createProjectC", function() {
                thisInstance.onCommandCreateProject("c");
            }));
            subscriptions.push(vscode.commands.registerCommand("vs64.createProjectCpp", function() {
                thisInstance.onCommandCreateProject("cpp");
            }));
        }

        // register task provider
        this._taskProvider = vscode.tasks.registerTaskProvider(
            TaskProvider.Type,
            new TaskProvider(
                this._settings,
                workspaceRoot,
                (action, folder, terminal) => {
                    return thisInstance.executeBuildTask(action, folder, terminal);
                }
            )
        );

        // register disassembler editors / views
        {
            const editorProvider = new DisassemblerView(extensionContext);
            subscriptions.push(vscode.window.registerCustomEditorProvider(
                "vs64.prg",
                editorProvider,
                {
                    webviewOptions: {
                        enableFindWidget: true,
                        retainContextWhenHidden: false
                    }
                })
            );
        }

        if (this.hasWorkspace()) {

            if (this._settings.autoBuild) {
                this.triggerBuild();
            }

            vscode.window.onDidChangeActiveTextEditor(function(textEditor) {
                thisInstance.onDidChangeActiveTextEditor(textEditor);
            });

            // start debugger adapter
            {
                this._debugContext = new DebugContext(this);
                this._debugContext.start();
            }

            vscode.debug.onDidStartDebugSession((debugSession) => {
                thisInstance.showStatus("Debugging started");
            });

            vscode.debug.onDidTerminateDebugSession((debugSession) => {
                thisInstance.showStatus("Debugging terminated");
            });

            vscode.debug.onDidChangeBreakpoints((breakpointChange) => {
                thisInstance.showStatus("Changed breakpoints");
            });

        }

        this.showWelcome();

    }

    showWelcome(forced) {
        const settings = this._settings;
        if (!settings) return;

        if (!forced && !settings.showWelcome) return;

        const workspaceConfig = vscode.workspace.getConfiguration();
        settings.disableWelcome(workspaceConfig);

        const extensionId = this._extensionContext.extension.id;

        let openToSide = (vscode.window.tabGroups.activeTabGroup.activeTab != null);

        vscode.commands.executeCommand(
            "workbench.action.openWalkthrough",
            { category: extensionId + "#" + "vs64", step: "welcome" },
            openToSide
        );
    }

    showSettings(filter, forced) {
        const settings = this._settings;
        if (!settings) return;
        let openToSide = (vscode.window.tabGroups.activeTabGroup.activeTab != null);

        const queryString = "vs64" + (filter ? "."+filter : "");

        vscode.commands.executeCommand(
            "workbench.action.openSettings",
            queryString,
            openToSide
        );
    }

    updateSettings() {
        const workspaceConfig = vscode.workspace.getConfiguration();
        const settings = this._settings;
        settings.update(workspaceConfig);
    }

    onDidChangeActiveTextEditor(textEditor) {
    }

    onCommandCreateProject(templateName) {

        this.cancelBuild();

        const extensionContext = this._extensionContext;

        const templateFolder = path.join(extensionContext.extensionPath, "resources", "templates", templateName);

        const workspaceRoot = (vscode.workspace.workspaceFolders && (vscode.workspace.workspaceFolders.length > 0))
		? vscode.workspace.workspaceFolders[0].uri.fsPath : null;
	    if (!workspaceRoot) {
		    return;
    	}

        const destFolder = workspaceRoot;

        this.copy(templateFolder, destFolder);

        if (this._settings.autoBuild) {
            this.triggerBuild();
        } else {
            this.updateProject();
        }

    }

    updateProject() {
        const settings = this._settings;
        const projectFile = VscodeUtils.getAbsoluteFilename(settings.projectFile||Constants.ProjectConfigFile);
        const project = this._project;

        try {
            project.fromFileIfChanged(projectFile);
        } catch (err) {
            logger.error(err);
            const txt = projectFile + " : Error : " + err;
            const channel = this._outputChannel;
            if (channel) {
                channel.appendLine(txt);
                channel.show();
            }
        }
    }

    update() {
    }

    showStatus(txt) {
        const statusBarItem = this._statusBarItem;
        if (!statusBarItem) return;

        logger.trace("status: " + txt);
        statusBarItem.set(txt);
    }

    onSave(document) {
        if (!this.hasWorkspace()) return;
        if (this._settings.autoBuild) {
            this.triggerBuild();
        }
    }

    clearDiagnostics() {
        this._diagnostics.clear();
    }

    updateDiagnostics(procInfo) {
        this._diagnostics.update(procInfo);
    }

    deactivate() {
        if (null != this._debugContext) {
            this._debugContext.stop();
            this._debugContext = null;
        }
    }

    isBuildRequired() {
        return true;
    }

    cancelBuild() {
        if (this._buildTimer) {
            clearTimeout(this._buildTimer);
            this._buildTimer = null;
        }
    }

    triggerBuild() {

        this.cancelBuild();
        this.updateProject();

        if (!this._project.isValid()) {
            return;
        }

        const instance = this;

        this._buildTimer = setTimeout(() => {
            this._buildTimer = null;
            instance.triggerBuildTask();
        }, Constants.AutoBuildDelayMs);

    }

    async triggerBuildTask() {
        const tasks = await vscode.tasks.fetchTasks({
            type: TaskProvider.Type
        });

        if (!tasks) return;

        for (const task of tasks) {
            const definition = task.definition;
            if (!definition) continue;
            if (definition.action == 'build') {
                vscode.tasks.executeTask(task);
            }
        }

    }

    executeBuildTask(action, folder, terminal) {

        this.cancelBuild();

        if (!action) {
            return;
        }

        const settings = this._settings;
        const project = this._project;

        if (!project.isValid()) {

            let txt = null;
            if (project.error) {
                txt = project.configfile ? project.configfile + "(1) : Error : " + project.error : project.error;
            } else {
                txt = "Invalid project setup";
            }

            logger.error(txt);
            terminal.write(txt + "\r\n");
            terminal.done();

            return;
        }

        {
            //terminal.write('starting build...\r\n');

            if (this._builder) {
                const txt = "build process already active";
                logger.error(txt);
                terminal.write(txt + "\r\n");
                terminal.done();
                return;
            }

            const build = new Build(project);

            build.onBuildOutput((txt) => {
                terminal.write(txt + "\r\n");
            });

            if (action == "clean" || action == "rebuild") {
                try {
                    this.showStatus("$(gear) Cleaning build...");
                    build.clean();
                } catch(err) {
                    this.showStatus("$(error) Clean failed");
                    const txt = "clean failed: " + err;
                    logger.error(txt);
                    terminal.write(txt + "\r\n", AnsiColors.Red);
                    terminal.done();
                    throw(txt);
                }

                const txt = "clean succeeded";
                logger.info(txt);
                terminal.write(txt + "\r\n", AnsiColors.Green);
                this.showStatus("$(pass) Clean succeeded");

                if (action == "clean") {
                    terminal.done();
                    return;
                }
            }

            if (action == "build" || action == "rebuild") {
                this._builder = build;
                let hasError = false;

                this.showStatus("$(gear) Building...");

                try {

                    build.build()
                    .then((result) => {
                        const error = result.error;
                        let statusText = null;
                        let txt = null;
                        if (error == BuildResult.Success) {
                            txt = result.description||"build succeeded";
                            statusText = "Build succeeded";
                            logger.info(txt);
                        } else if (error == BuildResult.NoNeedToBuild) {
                            txt = result.description||"build up-to-date";
                            statusText = "Build up-to-date";
                            logger.info(txt);
                        } else if (error == BuildResult.ScanError) {
                            txt = result.description||"scan failed";
                            statusText = "Scan failed";
                            hasError = true;
                            logger.error(txt);
                        } else if (error == BuildResult.Error) {
                            txt = result.description||"build failed";
                            statusText = "Build failed";
                            hasError = true;
                            logger.error(txt);
                        }

                        if (txt) {
                            terminal.write(txt + "\r\n", hasError ? AnsiColors.Red : AnsiColors.Green);
                        }

                        this._builder = null;
                        terminal.done();

                        if (hasError) {
                            this.showStatus("$(error) " + statusText||txt);
                        } else {
                            this.showStatus("$(pass) " + statusText||txt);
                        }

                    })
                    .catch((result) => {
                        this._builder = null;
                        terminal.done();
                        this.showStatus("$(error) Build failed");
                    });

                } catch (err) {
                    this._builder = null;
                    this.showStatus("$(error) Build failed");
                    const txt = "build failed: " + err;
                    logger.error(txt);
                    terminal.write(txt + "\r\n", AnsiColors.Red);
                    terminal.done();
                }
            }
        }
    }

/*







    async executeBuildTaskAsync(action, folder, terminal) {

        this.cancelBuild();

        if (!action) {
            return null;
        }

        const settings = this._settings;
        const project = this._project;

        if (!project.isValid()) {

            let txt = null;
            if (project.error) {
                txt = project.configfile ? project.configfile + "(1) : Error : " + project.error : project.error;
            } else {
                txt = "Invalid project setup";
            }

            logger.error(txt);
            terminal.write(txt + "\r\n");
            terminal.done();

            return null;
        }

        return new Promise((resolve, reject) => {
            //terminal.write('starting build...\r\n');

            if (this._builder) {
                const txt = "build process already active";
                logger.error(txt);
                terminal.write(txt + "\r\n");
                terminal.done();
                resolve();
                return;
            }

            const build = new Build(project);
            build.onBuildOutput((txt) => {
                terminal.write(txt + "\r\n");
            });

            if (action == "clean" || action == "rebuild") {
                try {
                    this.showStatus("$(gear) Cleaning build...");
                    build.clean();
                } catch(err) {
                    this.showStatus("$(error) Clean failed");
                    const txt = "clean failed: " + err;
                    logger.error(txt);
                    terminal.write(txt + "\r\n", AnsiColors.Red);
                    terminal.done();
                    reject();
                    return;
                }

                const txt = "clean succeeded";
                logger.info(txt);
                terminal.write(txt + "\r\n", AnsiColors.Green);
                this.showStatus("$(pass) Clean succeeded");

                if (action == "clean") {
                    terminal.done();
                    resolve();
                    return;
                }
            }

            if (action == "build" || action == "rebuild") {
                this._builder = build;
                let hasError = false;

                this.showStatus("$(gear) Building...");

                try {

                    build.build()
                    .then((result) => {
                        const error = result.error;
                        let statusText = null;
                        let txt = null;
                        if (error == BuildResult.Success) {
                            txt = result.description||"build succeeded";
                            statusText = "Build succeeded";
                            logger.info(txt);
                        } else if (error == BuildResult.NoNeedToBuild) {
                            txt = result.description||"build up-to-date";
                            statusText = "Build up-to-date";
                            logger.info(txt);
                        } else if (error == BuildResult.ScanError) {
                            txt = result.description||"scan failed";
                            statusText = "Scan failed";
                            hasError = true;
                            logger.error(txt);
                        } else if (error == BuildResult.Error) {
                            txt = result.description||"build failed";
                            statusText = "Build failed";
                            hasError = true;
                            logger.error(txt);
                        }

                        if (txt) {
                            terminal.write(txt + "\r\n", hasError ? AnsiColors.Red : AnsiColors.Green);
                        }

                        this._builder = null;
                        terminal.done();

                        if (hasError) {
                            this.showStatus("$(error) " + statusText||txt);
                            reject(txt||"");
                            return;
                        } else {
                            this.showStatus("$(pass) " + statusText||txt);
                            resolve();
                            return;
                        }

                    })
                    .catch((result) => {
                        this._builder = null;
                        terminal.done();
                        this.showStatus("$(error) Build failed");
                        reject();
                        return;
                    });

                } catch (err) {
                    this._builder = null;
                    this.showStatus("$(error) Build failed");
                    const txt = "build failed: " + err;
                    logger.error(txt);
                    terminal.write(txt + "\r\n", AnsiColors.Red);
                    terminal.done();
                    reject();
                    return;
                }
            }
        });
    }
*/

    getFiles(folder, relFolder, files) {

        relFolder ||= "";
        files ||= [];

        const elements = fs.readdirSync(folder);
        for (const fileName of elements) {

            const absFilePath = path.join(folder, fileName);
            const relFilePath = path.join(relFolder, fileName);
            const stat = fs.lstatSync(absFilePath);

            if (stat.isDirectory()) {
                files.push({
                    relFilePath: relFilePath,
                    absFilePath: absFilePath,
                    isDirectory: true
                });
                this.getFiles(absFilePath, relFilePath, files);
            } else {
                files.push({
                    relFilePath: relFilePath,
                    absFilePath: absFilePath,
                    isDirectory: false
                });
            }
        }

        return files;
    }

    copy(source, dest) {
        const files = this.getFiles(source);
        for (const item of files) {
            const destPath = path.join(dest, item.relFilePath);
            if (item.isDirectory) {
                this.createFolder(destPath);
            } else {
                const sourcePath = path.join(source, item.relFilePath);
                this.copyFile(sourcePath, destPath);
            }
        }
    }

    createFolder(dest) {
        try {
            const stat = fs.lstatSync(dest);
            if (stat.isDirectory()) {
                return; // already exists
            } else if (stat.isFile()) {
                throw("cannot create directory because file with same name already exists");
            }
        } catch (err) {;}

        fs.mkdirSync(dest, { recursive: true });
    }

    copyFile(source, dest) {
        const destFolder = path.dirname(dest);
        this.createFolder(destFolder);

        try {
            const stat = fs.lstatSync(dest);
            if (stat.isDirectory()) {
                throw("cannot copy file because directory with same name already exists");
            } else if (stat.isFile()) {
                /*
                const result = vscode.window.showInformationMessage(
                    "The file " + dest + " already exists. Do you want to overwrite or skip it?",
                    "Overwrite",
                    "Skip"
                ).then((action) => {
                    if (action && action == "Skip") {
                        return;
                    }
                });
                */
                return; // already exists
            }
        } catch (err) { ; }

        const data = fs.readFileSync(source);
        fs.writeFileSync(dest, data);
    }

}

//-----------------------------------------------------------------------------------------------//
// Extension Entry Point
//-----------------------------------------------------------------------------------------------//

let extensionInstance = null;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    return new Promise(function(resolve /*, reject*/) {
        if (null == extensionInstance) {
            extensionInstance = new Extension(context);
            extensionInstance.activate();
        }
        resolve();
    });
}

function deactivate() {
    return new Promise(function(resolve /*, reject*/) {
        if (null == extensionInstance) {
            extensionInstance.deactivate();
            extensionInstance = null;
        }
        resolve();
    });
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    activate: activate,
    deactivate: deactivate
};
