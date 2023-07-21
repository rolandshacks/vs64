//
// Project test
//

const path = require('path');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../src");
global.BIND = function(_module) {
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger, LogLevel } = require('utilities/logger');
const { Utils } = require('utilities/utils');
const { Project } = require('project/project');
const { Build } = require('builder/builder');

//-----------------------------------------------------------------------------------------------//
// Helpers
//-----------------------------------------------------------------------------------------------//

function setupProject(config) {
    const projectName = config.name;

    // eslint-disable-next-line no-undef
    const projectFolder = context.resolve("/temp/" + projectName);
    Utils.createFolder(projectFolder);
    const configJSON = JSON.stringify(config);
    const settings = {};
    const project = new Project(settings);
    project._configfile = path.resolve(projectFolder, "project-config.json");
    project.fromJson(configJSON);
    project._buildfile = path.resolve(projectFolder, "build", "build_" + project.toolkit.name + ".ninja");
    return project;
}

function generateProjectFiles(project) {
    project.createBuildFile(true);
    const build = new Build(project);
    build.createDependencyFiles();
}

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('project', () => {

    beforeAll(() => {
        Logger.pushGlobalLevel(LogLevel.Warn);
    });

    afterAll(() => {
        Logger.popGlobalLevel();
    });


    test("project_construct_llvm", () => {

        const config = {
            name: "name",
            toolkit: "llvm",
            sources: [
              "cpp.cpp",
              "asm.asm",
              "raw.raw"
            ],
        };

        const project = setupProject(config);
        expect(project.isValid()).toBeTruthy();
        expect(project.name).toBe("name");
        expect(project.toolkit.name).toBe("llvm");

        project.updateBuildTree();
        const buildTree = project.buildTree;
        expect(buildTree).toBeTruthy();

        expect(buildTree.res.size).toBe(1);
        expect(buildTree.res.get(0).to.substr(-7)).toBe("raw.raw");

        expect(buildTree.gen.size).toBe(1);
        expect(buildTree.gen.get(0).to.substr(-7)).toBe("raw.cpp");
        expect(buildTree.gen.get(0).from.substr(-7)).toBe("raw.raw");

        expect(buildTree.cpp.size).toBe(2);
        expect(buildTree.cpp.get(0).to.substr(-7)).toBe("cpp.cpp");
        expect(buildTree.cpp.get(1).to.substr(-7)).toBe("raw.cpp");

        expect(buildTree.asm.size).toBe(1);
        expect(buildTree.asm.get(0).to.substr(-7)).toBe("asm.asm");

        expect(buildTree.obj.size).toBe(3);
        expect(buildTree.obj.get(0).to.substr(-5)).toBe("cpp.o");
        expect(buildTree.obj.get(0).from.substr(-7)).toBe("cpp.cpp");
        expect(buildTree.obj.get(1).to.substr(-5)).toBe("raw.o");
        expect(buildTree.obj.get(1).from.substr(-7)).toBe("raw.cpp");
        expect(buildTree.obj.get(2).to.substr(-5)).toBe("asm.o");
        expect(buildTree.obj.get(2).from.substr(-7)).toBe("asm.asm");


    });

    test("project_construct_acme", () => {

        const config = {
            name: "name",
            toolkit: "acme",
            sources: [
              "asm.asm",
              "asm2.asm",
              "raw.raw"
            ]
        };

        const project = setupProject(config);

        expect(project.isValid()).toBeTruthy();
        expect(project.name).toBe("name");
        expect(project.toolkit.name).toBe("acme");

        project.updateBuildTree();
        const buildTree = project.buildTree;
        expect(buildTree).toBeTruthy();

        expect(buildTree.res.size).toBe(1);
        expect(buildTree.res.get(0).to.substr(-7)).toBe("raw.raw");

        expect(buildTree.gen.size).toBe(1);
        expect(buildTree.gen.get(0).to.substr(-7)).toBe("raw.asm");
        expect(buildTree.gen.get(0).from.substr(-7)).toBe("raw.raw");

        expect(buildTree.cpp.size).toBe(0);

        expect(buildTree.asm.size).toBe(3);
        expect(buildTree.asm.get(0).to.substr(-7)).toBe("asm.asm");
        expect(buildTree.asm.get(1).to.substr(-8)).toBe("asm2.asm");
        expect(buildTree.asm.get(2).to.substr(-7)).toBe("raw.asm");

        expect(buildTree.deps.size).toBe(2);
        expect(buildTree.deps.get(0).to.substr(-7)).toBe("raw.asm");
        expect(buildTree.deps.get(0).from.substr(-7)).toBe("raw.raw");
        expect(buildTree.deps.get(1).to.substr(-8)).toBe("name.prg");

    });

    test("project_build_file_cc65", () => {

        const config = {
            name: "cc65project",
            toolkit: "cc65",
            sources: [
                "src/main.c",
                "src/asm.asm",
                "resources/res.raw"
            ],
            includes: [
                "inc folder/aaa/bbb",
                "second folder/ccc"
            ]
        };

        const project = setupProject(config);
        expect(project.isValid()).toBeTruthy();
        generateProjectFiles(project);

    });

    test("project_build_file_llvm", () => {

        const config = {
            name: "llvmproject",
            toolkit: "llvm",
            sources: [
                "src/main.cpp",
                "src/second.c",
                "src/asm.asm",
                "resources/res.raw"
            ],
            "rcFlags": "--format cpp",
            includes: [
                "inc folder/aaa/bbb",
                "second folder/ccc"
            ]
        };

        const project = setupProject(config);
        expect(project.isValid()).toBeTruthy();
        generateProjectFiles(project);

    });

    test("project_build_file_acme", () => {

        const config = {
            name: "acmeproject",
            toolkit: "acme",
            sources: [
                "src/main.asm",
                "resources/res.raw",
                "src/second.asm"
            ],
            includes: [
                "inc folder/aaa/bbb",
                "second folder/ccc"
            ]
        };

        const project = setupProject(config);
        expect(project.isValid()).toBeTruthy();
        generateProjectFiles(project);

    });

    test("project_build_file_kick", () => {

        const config = {
            name: "kickproject",
            toolkit: "kick",
            sources: [
                "src/main.asm",
                "resources/res.raw"
            ],
            includes: [
                "inc folder/aaa/bbb",
                "second folder/ccc"
            ]
        };

        const project = setupProject(config);
        expect(project.isValid()).toBeTruthy();
        generateProjectFiles(project);

    });

});  // describe
