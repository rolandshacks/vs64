//
// BASIC compiler integration tests (Python bc.py)
//

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../src");
global.BIND = function (_module) {
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Helpers
//-----------------------------------------------------------------------------------------------//

function findPythonExecutable() {
    const candidates = [];

    if (process.platform === "win32") {
        candidates.push(
            path.resolve(__dirname, "../resources/python/python.exe"),
        );
    }

    candidates.push("python3");
    candidates.push("python");

    for (const candidate of candidates) {
        const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
        if (probe.status === 0) {
            return candidate;
        }
    }

    return null;
}

function runBc(pyExe, args, cwd) {
    const result = spawnSync(pyExe, args, {
        cwd,
        encoding: "utf8",
    });

    if (result.status !== 0) {
        const stdout = result.stdout || "";
        const stderr = result.stderr || "";
        throw new Error(
            `bc.py failed with exit code ${result.status}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        );
    }

    return result;
}

function writeFile(filePath, content) {
    const folder = path.dirname(filePath);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
}

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe("basic_compiler", () => {
    const pyExe = findPythonExecutable();

    if (!pyExe) {
        test("python runtime available", () => {
            throw new Error(
                "No Python runtime found (tried python3/python and bundled Windows python).",
            );
        });
        return;
    }

    const bcScript = __context.resolve("tools/bc.py");
    const suiteTemp = __context.resolve("temp:/basic_compiler");

    beforeEach(() => {
        fs.rmSync(suiteTemp, { recursive: true, force: true });
        fs.mkdirSync(suiteTemp, { recursive: true });
    });

    test("compiles aliases for variables, fn names, and fn parameters", () => {
        const projectDir = path.join(suiteTemp, "aliases_core");
        const srcDir = path.join(projectDir, "src");
        const buildDir = path.join(projectDir, "build");
        const mainBas = path.join(srcDir, "main.bas");
        const outPrg = path.join(buildDir, "out.prg");
        const outMap = path.join(buildDir, "out.map");

        writeFile(
            mainBas,
            [
                "10 def fn @diceRoll(@sides)=@sides+1",
                "20 @value = fn @diceRoll(6)",
                "30 goto done",
                "done:",
                "40 print @value",
            ].join("\n") + "\n",
        );

        runBc(
            pyExe,
            [
                bcScript,
                "--crunch",
                "--aliases",
                "--map",
                outMap,
                "-o",
                outPrg,
                mainBas,
            ],
            projectDir,
        );

        expect(fs.existsSync(outPrg)).toBeTruthy();
        expect(fs.existsSync(outMap)).toBeTruthy();

        const mapText = fs.readFileSync(outMap, "utf8");

        expect(mapText.includes("@diceRoll")).toBeFalsy();
        expect(mapText.includes("@sides")).toBeFalsy();
        expect(mapText.includes("@value")).toBeFalsy();
    });

    test("compiles normally without aliases enabled", () => {
        const projectDir = path.join(suiteTemp, "baseline_no_aliases");
        const srcDir = path.join(projectDir, "src");
        const buildDir = path.join(projectDir, "build");
        const mainBas = path.join(srcDir, "main.bas");
        const outPrg = path.join(buildDir, "out.prg");
        const outMap = path.join(buildDir, "out.map");

        writeFile(
            mainBas,
            [
                "10 value = 7",
                "20 if value > 0 then print \"OK\"",
                "30 end",
            ].join("\n") + "\n",
        );

        const result = runBc(
            pyExe,
            [
                bcScript,
                "--crunch",
                "--map",
                outMap,
                "-o",
                outPrg,
                mainBas,
            ],
            projectDir,
        );

        expect(fs.existsSync(outPrg)).toBeTruthy();
        expect(fs.existsSync(outMap)).toBeTruthy();
        expect((result.stdout || "").includes("aliases mapped:")).toBeFalsy();
    });

    test("collects aliases across include files before preprocessing", () => {
        const projectDir = path.join(suiteTemp, "aliases_include");
        const srcDir = path.join(projectDir, "src");
        const buildDir = path.join(projectDir, "build");
        const mainBas = path.join(srcDir, "main.bas");
        const incBas = path.join(srcDir, "inc.bas");
        const outPrg = path.join(buildDir, "out.prg");
        const outMap = path.join(buildDir, "out.map");

        writeFile(
            incBas,
            ["sharedLabel:", "@sharedVar = 99", "return"].join("\n") + "\n",
        );

        writeFile(
            mainBas,
            [
                '#INCLUDE "inc.bas"',
                "10 gosub sharedLabel",
                "20 end",
            ].join("\n") + "\n",
        );

        const result = runBc(
            pyExe,
            [
                bcScript,
                "--crunch",
                "--aliases",
                "--map",
                outMap,
                "-o",
                outPrg,
                mainBas,
            ],
            projectDir,
        );

        expect(fs.existsSync(outPrg)).toBeTruthy();
        expect(fs.existsSync(outMap)).toBeTruthy();

        const mapText = fs.readFileSync(outMap, "utf8");
        expect(mapText.includes("@sharedVar")).toBeFalsy();

        const stdout = result.stdout || "";
        expect(stdout.includes("aliases mapped: 1")).toBeTruthy();
    });

    test("in debug-style mode, keeps @ text in REM/strings while replacing code aliases", () => {
        const projectDir = path.join(suiteTemp, "aliases_comment_string");
        const srcDir = path.join(projectDir, "src");
        const buildDir = path.join(projectDir, "build");
        const mainBas = path.join(srcDir, "main.bas");
        const outPrg = path.join(buildDir, "out.prg");
        const outMap = path.join(buildDir, "out.map");

        writeFile(
            mainBas,
            [
                "10 rem keep @actual in rem",
                '20 print "@actual in string"',
                "30 @actual = 1",
                "40 print @actual",
                "50 end",
            ].join("\n") + "\n",
        );

        const result = runBc(
            pyExe,
            [
                bcScript,
                "--aliases",
                "--map",
                outMap,
                "-o",
                outPrg,
                mainBas,
            ],
            projectDir,
        );

        expect(fs.existsSync(outPrg)).toBeTruthy();
        expect(fs.existsSync(outMap)).toBeTruthy();

        const mapText = fs.readFileSync(outMap, "utf8");
        expect(mapText.includes("REM keep @actual in rem")).toBeTruthy();
        expect(mapText.includes('PRINT "@actual in string"')).toBeTruthy();
        expect(mapText.includes("30 A0 = 1")).toBeTruthy();
        expect(mapText.includes("40 PRINT A0")).toBeTruthy();

        const stdout = result.stdout || "";
        expect(stdout.includes("aliases mapped: 1")).toBeTruthy();
    });
});
