//
// Standalone runner
//

const path = require('path');
const fs = require('fs');

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
const { Utils, Formatter } = require('utilities/utils');
const { Logger } = require('utilities/logger');
const { ViceConnector, ViceProcess } = require('connector/connector');
const { Breakpoint, Breakpoints, DebugInterruptReason } = require('debugger/debug');

const logger = new Logger("ViceDebug");
const attachToRunningEmulator = true;

function dumpCpuState(cpuState) {

    const r = cpuState.cpuRegisters;
    const f = cpuState.cpuFlags;
    const i = cpuState.cpuInfo;

    const flags = (
        (f.N<<7) + (f.V<<6) + (1<<5) + (f.B<<4) + (f.D<<3) + (f.I<<2) + (f.Z<<1) + (f.C<<0)
    );

    logger.info(
        "PC=" + Utils.formatHex(r.PC, 4, "0x") +
        " ACC=" + Utils.formatHex(r.A, 2, "0x") +
        " X=" + Utils.formatHex(r.X, 2, "0x") +
        " Y=" + Utils.formatHex(r.Y, 2, "0x") +
        " SP=" + Utils.formatHex(r.S, 2, "0x") +
        " FLAGS=" + Utils.formatHex(flags, 2, "0x") +
        " 00=" + Utils.formatHex(i.zero0, 2, "0x") +
        " 01=" + Utils.formatHex(i.zero1, 2, "0x") +
        " LIN=" + Utils.formatHex(i.rasterLine, 3, "0x") +
        " CYC=" + Utils.formatHex(i.rasterCycle, 3, "0x") +
        " IRQ=" + Utils.formatHex(i.irq, 2, "0x") +
        " NMI=" + Utils.formatHex(i.irq, 2, "0x") +
        " OPCODE=" + Utils.formatHex(i.opcode, 2, "0x") +
        " CYCLES=" + i.cycles
    );
}

//-----------------------------------------------------------------------------------------------//
// Application
//-----------------------------------------------------------------------------------------------//
class Application {
    constructor() {
        this._emulatorProcess = null;
        this._emulator = null;

        this._settings = {
            emulatorExecutable : "C:/tools/c64/vice/bin/x64sc.exe",
            emulatorPort: 6502,
            emulatorArgs : ""
        };

        this._breakpoints = new Breakpoints();

        this._stopped = false;
    }

    async createEmulatorProcess() {
        if (this._emulatorProcess && this._emulatorProcess.alive) {
            this._emulatorProcess.kill();
        }

        const settings = this._settings;
        const instance = this;

        this._emulatorProcess = new ViceProcess();
        await this._emulatorProcess.spawn(
            settings.emulatorExecutable,
            settings.emulatorPort,
            settings.emulatorArgs,
            { onexit: (proc) => {
                // exit function
                instance._emulatorProcess = null;
                logger.info("Vice executable terminated");
            }}
        );

        return this._emulatorProcess;

    }

    destroyEmulatorProcess() {
        //if (KILL_VICE_PROCESS_AT_STOP) {

        if (this._emulator) {
            this._emulator.disconnect();
            this._emulator = null;
        }

        if (this._emulatorProcess) {
            this._emulatorProcess.kill();
            this._emulatorProcess = null;
        }

    }

    async init() {

        logger.info("Application.init()");

        const settings = this._settings;
        const thisInstance = this;

        logger.info("create emulator process");

        if (!attachToRunningEmulator) {
            await this.createEmulatorProcess();
        }

        const emu = new ViceConnector(this);
        await emu.connect("127.0.0.1", settings.emulatorPort);

        emu.on('error', (err) => {
            logger.error(err);
        });

        emu.on('started', () => {
            logger.trace("started");
            thisInstance.onDebugStarted();
        });

        emu.on('stopped', (reason) => {
            logger.trace("stopped");
            thisInstance.onDebugStopped(reason);
        });

        emu.on('breakpoint', function(breakpoint) {
            logger.trace("breakpoint");
            thisInstance.onDebugBreakpoint(breakpoint);
        });

        emu.on('break', function(pc) {
            logger.trace("break");
            thisInstance.onDebugBreak(pc);
        });

        emu.on('logpoint', function(breakpoint) {
            logger.info("logpoint");
            thisInstance.onDebugLogpoint(breakpoint);
        });

        this._emulator = emu;

        logger.info("emulator process created");

        const breakpoints = this._breakpoints;

        breakpoints.clear();
        breakpoints.add(new Breakpoint(2062, null, "source.asm", 123, null));

        const binaryPath = path.resolve("./data/test.prg");

        try {
            await emu.loadProgram(binaryPath);
        } catch (err) {
            logger.error("failed to load program " + binaryPath + ": " + err);
        }


    }

    onDebugStarted() {
        this._stopped = false;
    }

    onDebugStopped(reason) {
        this._stopped = true;

        const emu = this._emulator;

        if (reason == DebugInterruptReason.BREAKPOINT) {
            logger.info("=================== Paused on breakpoint ===================");
            logger.info("=================== Debugger step triggered ===================");
            emu.step();
            //emu.start();
            //logger.info("=================== Resume after breakpoint ===================");
        } else {
            logger.info("Debug stopped");
        }

    }

    onDebugBreak(pc) {
        logger.info(
            "BREAK at $" + Utils.fmtAddress(pc)
        );
    }

    onDebugBreakpoint(breakpoint) {

        logger.info(
            "BREAKPOINT at $" +
            Utils.fmtAddress(breakpoint.address) +
            ", line " +
            breakpoint.line
        );
    }

    onDebugLogpoint(breakpoint) {

    }

    async run() {
        logger.info("Application.run()");

        const emu = this._emulator;
        if (!emu) return;

        this._stopped = false;
        emu.start();

        while (emu._running) {
            logger.log("running...");

            //const mem = await emu.readMemory(0x0000, 0x00ff);

            //const cpuState = emu.getCpuState();
            //dumpCpuState(cpuState);

            await Utils.sleep(3000);

            if (this._stopped) {
                this._stopped = false;
                emu.start();
                logger.info("=================== Resume after breakpoint ===================");
            }
        }

        emu.stop();
    }

    shutdown() {
        logger.info("Application.shutdown()");

        this.destroyEmulatorProcess();
    }

}

//-----------------------------------------------------------------------------------------------//
// Application entry
//-----------------------------------------------------------------------------------------------//
async function main() {

    logger.info("Hello!");

    const app = new Application();
    await app.init();
    await app.run();
    app.shutdown();
}

main();
