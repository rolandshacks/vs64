//
// VS64 Extension
//

const path = require('path');
const fs = require('fs');
const vscode = require('vscode');
const {CppToolsApi, Version, CustomConfigurationProvider, getCppToolsApi} = require('vscode-cpptools');

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
const { Logger, LogLevel, LogLevelChars } = require('utilities/logger');
const { Utils } = require('utilities/utils');
const { Constants, AnsiColors, Settings, Opcodes } = require('settings/settings');
const { Project } = require('project/project');
const { DebugContext } = require('debugger/debug_context');
const { Build, BuildResult } = require('builder/builder');
const { DiagnosticProvider } = require('extension/diagnostic_provider');
const { IntellisenseConfiguratrionProvider } = require('extension/intellisense');
const { TaskProvider } = require('extension/task_provider');
const { StatusBarItem } = require('extension/statusbar');
const { DisassemblerView } = require('extension/disassembler_view');
const { LanguageFeatureProvider } = require('language/language');

const logger = new Logger("Extension");

//-----------------------------------------------------------------------------------------------//
// Extension
//-----------------------------------------------------------------------------------------------//

class Extension {

    /**
     * @param {vscode.ExtensionContext} extensionContext
     */
    constructor(extensionContext) {
        this._activated = false;
        this._extensionContext = extensionContext;
        this._debugContext = null;
        this._outputChannel = null;
        this._settings = new Settings(extensionContext);
        this._project = new Project(this._settings);
        this._projectFileWatcher = null;
        this._builder = null;
        this._taskProvider = null;
        this._buildTimer = null;
        this._statusBarItem = null;
        this._intellisenseConfiguratrionProvider = null;
        this._languageFeatureProvider = null;
    }

    isActivated() {
        return this._activated;
    }

    get settings() {
        return this._settings;
    }

    get project() {
        return this._project;
    }

    hasWorkspace() {
        if (!vscode.workspace.workspaceFolders || !vscode.workspace.workspaceFolders.length) {
            return false;
        }
        return true;
    }

    getWorkspaceRoot() {
        if (!this.hasWorkspace()) return null;
		return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    getWorkspaceAbsoluteFilename(filename) {
        if (!filename || path.isAbsolute(filename)) return filename;

        const workspaceRoot = this.getWorkspaceRoot();
	    if (!workspaceRoot) {
		    return;
    	}

        return path.resolve(workspaceRoot, filename);
    }

    activate() {

        const thisInstance = this;
        const extensionContext = this._extensionContext;
        const subscriptions =  extensionContext.subscriptions;

        { // create output channel
            this._outputChannel = vscode.window.createOutputChannel("VS64" /*, { log: true } */);
            Logger.setGlobalListener((level, txt, location, caller) => {
                thisInstance.writeLog(level, txt, location, caller);
            });
        }

        { // load settings
            this.updateSettings();

            let disposable = vscode.workspace.onDidChangeConfiguration(function(e) {
                thisInstance.updateSettings();
                if (!thisInstance._builder && !thisInstance._buildTimer) {
                    thisInstance.triggerAutoBuild(true);
                }
            });

            subscriptions.push(disposable);
        }

        { // load project
            this.syncProject();
        }

        { // create diagnostic provider
            this._diagnostics = new DiagnosticProvider(this);
        }

        { // register language feature providers

            const languageFeatureSelector = "asm";
            const languageFeatureProvider = new LanguageFeatureProvider(this._project);

            subscriptions.push(vscode.languages.registerDefinitionProvider(languageFeatureSelector, languageFeatureProvider));
            subscriptions.push(vscode.languages.registerReferenceProvider(languageFeatureSelector, languageFeatureProvider));
            subscriptions.push(vscode.languages.registerCompletionItemProvider(languageFeatureSelector, languageFeatureProvider));

            this._languageFeatureProvider = languageFeatureProvider;
        }

        { // create status bar item

            this._statusBarItem = new StatusBarItem("vs64.showStatus");
            subscriptions.push(this._statusBarItem.obj);
        }

        // listen do document save
        vscode.workspace.onDidSaveTextDocument((document) => {

            if (!document || null == vscode.window.activeTextEditor) return;

            if (!thisInstance.hasWorkspace()) return;

            const fileName = path.basename(document.fileName);
            if (fileName == Constants.ProjectConfigFile) {
                thisInstance.onSaveProject();
                return;
            }

            if (!thisInstance._project.isValid() || Constants.SupportedLanguageIds.indexOf(document.languageId) < 0) {
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
            subscriptions.push(vscode.commands.registerCommand("vs64.createProjectAcme", function() {
                thisInstance.onCommandCreateProject("acme");
            }));
            subscriptions.push(vscode.commands.registerCommand("vs64.createProjectKick", function() {
                thisInstance.onCommandCreateProject("kick");
            }));
            subscriptions.push(vscode.commands.registerCommand("vs64.createProjectCc65", function() {
                thisInstance.onCommandCreateProject("cc65");
            }));
            subscriptions.push(vscode.commands.registerCommand("vs64.createProjectLlvm", function() {
                thisInstance.onCommandCreateProject("llvm");
            }));
            subscriptions.push(vscode.commands.registerCommand("vs64.buildProject", function() {
                thisInstance.triggerBuild();
            }));
            subscriptions.push(vscode.commands.registerCommand("vs64.cleanProject", function() {
                thisInstance.triggerClean();
            }));
        }

        // register task provider
        {
            this._taskProvider = new TaskProvider(
                this._settings,
                this._project,
                (action, folder, terminal) => {
                    return thisInstance.executeBuildTask(action, folder, terminal);
                }
            );

            vscode.tasks.registerTaskProvider(TaskProvider.Type, this._taskProvider);
        }

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

        this._activated = true;

        if (this.hasWorkspace()) {

            this.triggerAutoBuild();

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

        /*
            // Custom configuration provider is disabled, not sure why it leads to crashes (e.g. in the git extension)
            getCppToolsApi(Version.v2).then((api) => {
                this._intellisenseConfiguratrionProvider = new IntellisenseConfiguratrionProvider(this, api);
            });
        */

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

    onCommandCreateProject(toolkitName, templateName) {

        if (!templateName) templateName = toolkitName;

        this.cancelBuild();

        const extensionContext = this._extensionContext;

        const templateFolder = path.join(extensionContext.extensionPath, "resources", "templates", templateName);

        const workspaceRoot = this.getWorkspaceRoot();
        if (!workspaceRoot) {
            vscode.window.showErrorMessage("Cannot create project setup without workspace. Please create or open a workspace or folder.");
            return;
        }

        const destFolder = workspaceRoot;

        const sourceExtensions = ";.cpp;.cc;.c;.s;.asm;.raw;.res;";
        const includeExtensions = ";.hpp;.hh;.h;.inc;";

        let sourceFilesExist = false;
        let includeFolders = new Set();

        let sourceFiles = Utils.findFiles(destFolder, (item) => {
            if (item.isDirectory) return false;
            if (sourceExtensions.indexOf(";" + item.extension + ";") >= 0) {
                sourceFilesExist = true;
                return true;
            } else if (includeExtensions.indexOf(";" + item.extension + ";") >= 0) {
                const parentFolder = path.dirname(item.relFilePath);
                includeFolders.add(parentFolder);
            };
            return false;
        }, [".git", "build"]);

        Utils.copy(templateFolder, destFolder, (item) => {
            if (item.isDirectory) return true;
            if (item.relFilePath == 'project-config.json') return false; // will be generated
            if (sourceExtensions.indexOf(";" + item.extension + ";") == -1) return true;
            if (sourceFilesExist) return false; // don't copy source examples if source already exist
            sourceFiles.push(item);
            return true; // copy
        });

        this.createProjectFile(destFolder, toolkitName, sourceFiles, [...includeFolders]);

        if (this._settings.autoBuild) {
            this.triggerBuild();
        } else {
            this.syncProject();
        }

    }

    createProjectFile(destFolder, toolkitName, sourceFiles, includeFolders) {

        const filename = path.resolve(destFolder, "project-config.json");

        if (Utils.fileExists(filename)) {
            try {
                const fileBackup = fs.readFileSync(filename);
                fs.writeFileSync(filename + "~", fileBackup);
            } catch (err) {;}
        }

        let i = "    ";
        let s = "";

        const name = vscode.workspace.name || "unnamed";
        const desc = "Project " + name;

        s += '{\n';
        s += i + '"name": "' + name + '",\n';
        s += i + '"description": "' + desc + '",\n';
        s += i + '"toolkit": "' + toolkitName + '",\n';
        s += i + '"sources": [\n';

        if (sourceFiles) {
            let idx = 0;
            for (const sourceFile of sourceFiles) {
                const p = sourceFile.relFilePath.replaceAll('\\', '/');
                s += i + i + '"' + p + '"';
                if (idx < sourceFiles.length-1) s += ',';
                s += '\n';
                idx++;
            }
        }

        s += i + '],\n';
        s += i + '"build": "debug",\n';
        s += i + '"definitions": [],\n';
        s += i + '"includes": [\n';

        if (includeFolders) {
            let idx = 0;
            for (const includeFolder of includeFolders) {
                const p = includeFolder.replaceAll('\\', '/');
                s += i + i + '"' + p + '"';
                if (idx < includeFolders.length-1) s += ',';
                s += '\n';
                idx++;
            }
        }

        s += i + '],\n';
        s += i + '"args": [],\n';
        s += i + '"compiler": ""\n';
        s += '}\n';

        try {
            fs.writeFileSync(filename, s);
        } catch (err) {;}

    }

    invalidateTasks() {
        if (this._taskProvider) {
            this._taskProvider.invalidate();
        }
    }

    syncProject() {

        if (!this.hasWorkspace()) {
            return;
        }

        const settings = this._settings;
        const projectFile = this.getWorkspaceAbsoluteFilename(settings.projectFile||Constants.ProjectConfigFile);
        if (!projectFile) {
            return;
        }

        if (!Utils.fileExists(projectFile)) {
            return;
        }

        const project = this._project;
        try {

            if (project.fromFileIfChanged(projectFile)) {

                this.invalidateTasks();

                if (this._projectFileWatcher) {
                    this._projectFileWatcher.dispose();
                    this._projectFileWatcher = null;
                }

                // setup file watcher
                if (project.isValid()) {
                    this._projectFileWatcher = vscode.workspace.createFileSystemWatcher(projectFile);

                    const watcher = this._projectFileWatcher;
                    const instance = this;
                    watcher.onDidChange(() => { instance.invalidateTasks(); });
                    watcher.onDidCreate(() => { instance.invalidateTasks(); });
                    watcher.onDidDelete(() => { instance.invalidateTasks(); });

                }

                // project has been reloaded, notify configuration change
                if (this._intellisenseConfiguratrionProvider) {
                    this._intellisenseConfiguratrionProvider.notifyConfigChange();
                }
            }


        } catch (err) {
            const txt = projectFile + " : Error : " + err;
            logger.error(txt);
            const channel = this._outputChannel;
            if (channel) channel.show(null, true);

        }
    }

    writeLog(level, txt, location, caller) {
        const channel = this._outputChannel;
        if (!channel) return;

        // use appendLine instead of levels to ensure logs
        // are always displayed according to vs64 settings

        if (Logger.getGlobalLevel() == LogLevel.Trace && caller) {
            channel.appendLine(LogLevelChars[level] + "/" + caller + ": " + txt);
        } else {
            channel.appendLine(txt);
        }

        /*
        if (level == LogLevel.Trace) {
            if (caller) {
                channel.trace(caller + ": " + txt);
            } else {
                channel.trace(txt);
            }
        } else if (level == LogLevel.Debug) {
            channel.debug(txt);
        } else if (level == LogLevel.Info) {
            channel.info(txt);
        } else if (level == LogLevel.Warning) {
            channel.warn(txt);
        } else if (level == LogLevel.Error) {
            channel.error(txt);
        } else {
            channel.appendLine(txt);
        }
        */
    }

    update() {
    }

    showStatus(txt) {
        const statusBarItem = this._statusBarItem;
        if (!statusBarItem) return;

        logger.trace("status: " + txt);
        statusBarItem.set(txt);
    }


    onSaveProject() {
        this.triggerAutoBuild(true);
    }

    onSave(document) {
        this.triggerAutoBuild();
    }

    clearDiagnostics() {
        this._diagnostics.clear();
    }

    updateDiagnostics(procInfo) {
        this._diagnostics.update(procInfo);
    }

    deactivate() {

        this._activated = false;

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

    triggerClean() {

        this.cancelBuild();
        this.syncProject();

        if (!this._project.isValid()) {
            return;
        }

        if (this._builder) {
            const txt = "build process already active";
            logger.error(txt);
            return;
        }

        const build = new Build(this._project);
        build.clean(true);
    }

    triggerAutoBuild(fullRebuild) {
        if (!this.isActivated()) return;
        if (this._settings.autoBuild) {
            this.triggerBuild(fullRebuild);
        }
    }

    triggerBuild(fullRebuild) {

        this.cancelBuild();
        this.syncProject();

        if (!this._project.isValid()) {
            return;
        }

        const instance = this;

        this._buildTimer = setTimeout(() => {
            this._buildTimer = null;
            instance.triggerBuildTask(fullRebuild);
        }, Constants.AutoBuildDelayMs);

    }

    async triggerBuildTask(fullRebuild) {
        const tasks = await vscode.tasks.fetchTasks({
            type: TaskProvider.Type
        });

        if (!tasks) return;

        const action = fullRebuild ? "rebuild" : "build"

        for (const task of tasks) {
            const definition = task.definition;
            if (!definition) continue;
            if (definition.action == action) {
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
                    build.clean(true);
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
