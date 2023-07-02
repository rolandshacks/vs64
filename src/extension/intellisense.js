//
// Intellisense Configuration Provider
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Constants } = require('settings/settings');

//-----------------------------------------------------------------------------------------------//
// Intellisense Configuration Provider
//-----------------------------------------------------------------------------------------------//

class IntellisenseConfigurationProvider {

    constructor(extension, api) {
        this._extension = extension;
        this._context = extension._extensionContext;
        this._project = extension._project;
        this._settings = extension._settings;
        this._api = api;

        this._cppStandard = Constants.CppStandard;
        this._intelliSenseMode = "custom-clang-mos";

        this.name = 'VS64';
        this.extensionId = this._context.extension.id;

        api.registerCustomConfigurationProvider(this);
        if (api.notifyReady) {
            api.notifyReady(this);
        } else {
            api.didChangeCustomConfiguration(this);
        }
    }

    dispose() {}

    notifyConfigChange() {
        const api = this._api;
        api.didChangeCustomConfiguration(this);
    }

    canProvideConfiguration(_uri_) {
        return true;
    }

    getCompilerIncludes() {
        const project = this._project;
        const settings = this._settings;
        const toolkit = project.toolkit;

        let compilerIncludes = null;
        if (toolkit.isLLVM) {
            compilerIncludes = settings.llvmIncludes;
        } else if (toolkit.isCC65) {
            compilerIncludes = settings.cc65Includes;
        }

        return compilerIncludes;
    }

    getCompilerPath() {

        const project = this._project;
        const settings = this._settings;
        const toolkit = project.toolkit;

        let compilerPath = null;

        if (toolkit.isLLVM) {
            compilerPath = settings.clangExecutable;
        } else if (toolkit.isCC65) {
            compilerPath = settings.cc65Executable;
        } else if (toolkit.isAcme) {
            compilerPath = settings.acmeExecutable;
        } else if (toolkit.isKick) {
            compilerPath = settings.kickExecutable;
        }

        return compilerPath;
    }

    provideConfigurations(uris) {
        if (!uris || uris.length < 1) return [];

        const project = this._project;
        const settings = this._settings;
        const toolkit = project.toolkit;
        if (!project || !settings || !toolkit) return [];

        const releaseBuild = project.releaseBuild;

        const includes = [];
        if (project.includes) includes.push(...project.includes);
        if (settings.includes) includes.push(...settings.includes);

        const compilerPath = this.getCompilerPath();

        const compilerIncludes = this.getCompilerIncludes();
        if (compilerIncludes) {
            includes.push(...compilerIncludes);
        }

        const defines = [];
        if (project.defines) defines.push(...project.defines);
        if (settings.defines) defines.push(...settings.defines);
        if (!releaseBuild) defines.push("DEBUG");

        const items = [];
        for (const uri of uris) {
            const sourceFileConfigurationItem = {
                uri: uri,
                configuration: {
                    includePath: includes,
                    defines: defines,
                    intelliSenseMode: this._intelliSenseMode,
                    compilerPath: compilerPath,
                    standard: this._cppStandard
                }
            };

            items.push(sourceFileConfigurationItem);
        }

        return items;
    }

    canProvideBrowseConfiguration() {
        return true;
    }

    provideBrowseConfiguration() {
        return this.provideFolderBrowseConfiguration(null);
    }

    canProvideBrowseConfigurationsPerFolder() {
        return true;
    }

    provideFolderBrowseConfiguration(uri) {

        const ext = this._extension;

        const browsePath = [];

        if (uri) {
            browsePath.push(uri.path);
        } else {
            const workspaceRoot = ext.getWorkspaceRoot();
            if (workspaceRoot) browsePath.push(workspaceRoot);
        }

        const compilerIncludes = this.getCompilerIncludes();
        if (compilerIncludes) browsePath.push(...compilerIncludes);

        const compilerPath = this.getCompilerPath();

        const workspaceBrowseConfiguration = {
            browsePath: browsePath,
            compilerPath: compilerPath,
            standard: this._cppStandard
        };

        return workspaceBrowseConfiguration;

    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    IntellisenseConfigurationProvider: IntellisenseConfigurationProvider
}
