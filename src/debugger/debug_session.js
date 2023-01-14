//
// Debug Session
//

const path = require('path');
const Net = require('net');
const vscode = require('vscode');
const DebugAdapter = require('@vscode/debugadapter');
const { Subject } = require('await-notify');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Constants } = require('settings/settings');
const { Utils, Formatter } = require('utilities/utils');
const { VscodeUtils } = require('utilities/vscode_utils');
const { Logger } = require('utilities/logger');
const { Breakpoint, Breakpoints, DebugInterruptReason, DebugStepType, ChipState, MemoryType } = require('debugger/debug');
const { DebugInfo } = require('debugger/debug_info');
const { Emulator } = require('emulator/emu');
const { ViceConnector, ViceProcess } = require('connector/connector');

const logger = new Logger("DebugSession");
const KILL_VICE_PROCESS_AT_STOP = false;

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//

const DebugConstants = {
    THREAD_ID: 1,
    STACKFRAME_NUMBER: 1,
    VARIABLES_REGISTERS: 0x10000,
    VARIABLES_FLAGS: 0x20000,
    VARIABLES_SYMBOLS: 0x30000,
    VARIABLES_STACK: 0x40000,
    VARIABLES_SYSINFO: 0x50000,
    VARIABLES_VIC: 0x60000,
    VARIABLES_SPRITES: 0x70000,
    VARIABLES_SPRITE_0: 0x70001,
    VARIABLES_SPRITE_1: 0x70002,
    VARIABLES_SPRITE_2: 0x70003,
    VARIABLES_SPRITE_3: 0x70004,
    VARIABLES_SPRITE_4: 0x70005,
    VARIABLES_SPRITE_5: 0x70006,
    VARIABLES_SPRITE_6: 0x70007,
    VARIABLES_SPRITE_7: 0x70008,
    VARIABLES_CIA1: 0x80000,
    VARIABLES_CIA2: 0x90000,
    VARIABLES_SID: 0xA0000,
    VARIABLES_SID_CHANNEL1: 0xA0001,
    VARIABLES_SID_CHANNEL2: 0xA0002,
    VARIABLES_SID_CHANNEL3: 0xA0003
};

//-----------------------------------------------------------------------------------------------//
// Debug Session
//-----------------------------------------------------------------------------------------------//
class DebugSession extends DebugAdapter.LoggingDebugSession {

    // session constructor
    constructor(host) {

        // set log file name
        super("vs64_debug_adapter.txt");

        logger.debug("create debug session");

        this._host = host;
        this._settings = host._settings;
        this._project = host._project;
        this._server = null;
        this._port = 0;
        this._configurationDone = new Subject();
        this._debugInfo = null;
        this._breakpoints = new Breakpoints();
        this._breakpointsDirty = true;
        this._launchBinary = null;
        this._launchPC = null;
        this._emulator = null;
        this._emulatorProcess = null;

        this._variablesCache = {};

    }

    // start session socket server
    start(inStream, outStream) {

        logger.debug("start debug session");

        if (null != inStream && null != outStream) {
            super.start(inStream, outStream);
            return;
        }

        let thisInstance = this;

        let port = 0;

        // start as a server
        logger.debug("waiting for DebugAdapter protocol client");

        this._server = Net.createServer((socket) => {

            socket.on('end', () => {
                logger.debug('client connection closed');
            });

            thisInstance.setRunAsServer(true);
            thisInstance.start(socket, socket);

        }).listen(port);

        if (0 == port) {
            let addr = this._server.address();
            if (null != addr) {
                port = addr.port;
            }
        }

        this._port = port;
    }

    // stop session
    stop() {
        logger.debug("stop debug session");
        this.destroyEmulatorInstance();
        this._port = 0;
    }

    dispatchRequest(request) {
        //logger.trace(`dispatch request: ${request.command}(${JSON.stringify(request.arguments) })`);
        return super.dispatchRequest(request);
    }

    sendResponse(response) {
        //logger.trace(`send response: ${response.command}(${JSON.stringify(response.body) })`);
        return super.sendResponse(response);
    }

    sendEvent(event) {
        //logger.trace(`send event: ${event.event}(${JSON.stringify(event) })`);
        return super.sendEvent(event);
    }

    initializeRequest(response, args) {

        response.body = response.body || {};
		response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsRestartRequest = true;
        response.body.supportsEvaluateForHovers = true;
        response.body.supportsLogPoints = true;
        response.body.supportsReadMemoryRequest = true;
        response.body.supportsMemoryReferences = true;

		this.sendResponse(response);

    }

    parseAddressString(str) {

        if (null == str) return null;

        str = str.trim();
        if (str == "") return null;

        let value = 0x0;

        if (str.charAt(0) == "$") {
            value = parseInt(str.substr(1), 16);
        } else if (str.substr(0, 2) == "0x") {
            value = parseInt(str.substr(2), 16);
        } else {
            value = parseInt(str);
        }

        if (isNaN(value)) return null;

        return value;
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
            settings.emulatorArgs,
            (proc) => {
                if (proc) {
                    if (proc.exitCode != 0) {
                        const output = proc.stdout.join("\n");
                        console.log(output);
                    }
                }
                instance._emulatorProcess = null;
                instance.sendEvent(new DebugAdapter.TerminatedEvent());
            }
        );

        return this._emulatorProcess;

    }

    destroyEmulatorProcess() {
        //if (KILL_VICE_PROCESS_AT_STOP) {
        if (this._emulatorProcess) {
            this._emulatorProcess.kill();
            this._emulatorProcess = null;
        }
    }

    async createEmulatorInstance(debugConfigType, attachToProcess, hostname, port) {

        this.destroyEmulatorInstance();

        let thisInstance = this;

        this._breakpointsDirty = true;

        let emu = null;

        if (debugConfigType == Constants.DebuggerType6502) {

            emu = new Emulator(this);

        } else if (debugConfigType == Constants.DebuggerTypeVice) {

            if (!attachToProcess) {
                if (!this._emulatorProcess || !this._emulatorProcess.alive) {
                    await this.createEmulatorProcess();
                }
            }

            emu = new ViceConnector(this);
            await emu.connect(hostname, port);

        } else {
            return null;
        }

        emu.on('error', (err) => {
            thisInstance.onDebugError(err);
        });

        emu.on('started', () => {
            thisInstance.onDebugStarted();
        });

        emu.on('stopped', (reason) => {
            thisInstance.onDebugStopped(reason);
        });

        emu.on('breakpoint', (breakpoint) => {
            thisInstance.onDebugBreakpoint(breakpoint);
        });

        emu.on('break', (pc) => {
            thisInstance.onDebugBreak(pc);
        });

        emu.on('logpoint', (breakpoint) => {
            thisInstance.onDebugLogpoint(breakpoint);
        });

        this._emulator = emu;

        return emu;
    }

    destroyEmulatorInstance() {

        const emu = this._emulator;
        this._emulator = null;

        if (emu) {
            if (emu.disconnect) emu.disconnect();
            emu.stop();
        }
    }

    disconnectRequest(response, args) {
        this.destroyEmulatorInstance();
        super.disconnectRequest(response, args);
    }

    async attachRequest(response, args) {
        logger.trace("attachRequest");
        this.launchOrAttachRequest(response, args);
    }

    async launchRequest(response, args) {
        logger.trace("launchRequest");
        this.launchOrAttachRequest(response, args);
    }

    async launchOrAttachRequest(response, args) {

        const debuggerType = args.type;
        const debuggerCommand = args.request||"launch";
        const attachToProcess = (debuggerCommand == "attach");

        if (debuggerType != Constants.DebuggerType6502 &&
            debuggerType != Constants.DebuggerTypeVice) {
            response.success = false;
            response.message ="invalid debugger type " + args.type;
            this.sendResponse(response);
            return;
        }

        if (debuggerType == Constants.DebuggerType6502 && attachToProcess) {
            response.success = false;
            response.message ="Internal 6502 CPU debugger cannot be attached to a process";
            this.sendResponse(response);
            return;
        }

        let binaryPath = args.program;
        let forcedStartAddress = this.parseAddressString(args.pc);

        this._debugInfo = null;
        this._launchBinary = null;
        this._launchPC = null;

        const emuHostname = args.hostname||"localhost";
        const emuPort = args.port||6502;

        let emu = null;
        emu = await this.createEmulatorInstance(args.type, attachToProcess, emuHostname, emuPort);

        if (!emu) {
            response.success = false;
            response.message ="failed to start emulator";
            this.sendResponse(response);
            return;
        }

        try {

            const project = this._project;

            let debugInfoPath = project.outdebug;
            this._debugInfo = new DebugInfo(debugInfoPath, project);
            await this.syncBreakpoints();

            await emu.loadProgram(binaryPath, Constants.ProgramAddressCorrection, forcedStartAddress);

            this._launchBinary = binaryPath;
            this._launchPC = forcedStartAddress;

        } catch (err) {

            response.success = false;
            response.message = err.toString();
            this.sendResponse(response);

            return;
        }

        // ready for configuration requests
        this.sendEvent(new DebugAdapter.InitializedEvent());
        await this._configurationDone.wait(3000); // jshint ignore:line

        emu.start();

        this.sendResponse(response);
    }

    async syncBreakpoints(force) {
        const debugInfo = this._debugInfo;
        if (!debugInfo) return;

        if (!this._breakpointsDirty && !force) return;

        const breakpoints = vscode.debug.breakpoints;

        this._breakpoints.clear();
        for (const breakpoint of breakpoints) {
            if (!breakpoint.enabled) continue;

            const codeRef = breakpoint.location;
            if (!codeRef) continue;

            const fileToFind = codeRef.uri.fsPath;
            const lineToFind = codeRef.range.start.line+1;

            const location = debugInfo.findNearestCodeLine(fileToFind, lineToFind);
            if (!location) continue;

            this._breakpoints.add(new Breakpoint(
                location.address,
                location.source,
                location.line
            ));
        }
        //path, line, address, logMessage

        let emu = this._emulator;
        await emu.setBreakpoints(this._breakpoints);
        this._breakpointsDirty = false;
    }

    async restartRequest(response, args) {

        let emu = this._emulator;

        await this.syncBreakpoints();

        try {
            await emu.loadProgram(this._launchBinary, Constants.ProgramAddressCorrection, this._launchPC);
        } catch (err) {
            response.success = false;
            response.message = err.toString();
            this.sendResponse(response);
            return;
        }

        emu.start();

		this.sendResponse(response);
    }

    async setBreakPointsRequest(response, args) {

        // verify breakpoints

        const debugInfo = this._debugInfo;
        if (!debugInfo) {
            response.body = { breakpoints: [] };
            this.sendResponse(response);
            return;
        }

        this._breakpointsDirty = true;

        let source = Utils.normalizePath(args.source.path);

        const resultBreakpoints = [];

        for (const requestedBreakpoint of args.breakpoints) {
            const location = debugInfo.findNearestCodeLine(source, requestedBreakpoint.line);

            if (location) {
                resultBreakpoints.push({
                    source: {
                        path: location.source,
                        presentationHint: 'normal'
                    },
                    line: location.line,
                    verified: true
                });
            } else {
                resultBreakpoints.push({
                    source: {
                        path: source,
                        presentationHint: 'deemphasize'
                    },
                    line: requestedBreakpoint.line,
                    verified: false, // not found
                    message: 'No code found on this line'
                });
                VscodeUtils.debuggerLog("could not set breakpoint at line " + requestedBreakpoint.line);
            }
        }

        response.body = {
            breakpoints: resultBreakpoints
        };

        const activeDebugSession = vscode.debug.activeDebugSession;
        if (activeDebugSession) {
            this.syncBreakpoints();
        }

        this.sendResponse(response);
    }

    configurationDoneRequest(response, args) {
        super.configurationDoneRequest(response, args);
        this._configurationDone.notify();
	}

    threadsRequest(response, args) {
        response.body = {
            threads: [
                new DebugAdapter.Thread(DebugConstants.THREAD_ID, "MOS6502 Main")
            ]
        };

		this.sendResponse(response);
	}

    stackTraceRequest(response, args) {

        const debugInfo = this._debugInfo;
        if (!debugInfo) {
            response.success = false;
            response.message ="missing debug info";
            this.sendResponse(response);
            return;
        }

        const emu = this._emulator;
        const cpuState = emu.getCpuState();
        let stackFrameNumber = DebugConstants.STACKFRAME_NUMBER;

        const addressInfos = [];

        {
            const addressInfo = debugInfo.getAddressInfo(cpuState.cpuRegisters.PC);
            if (!addressInfo) {
                response.body = {
                    stackFrames: [
                        {
                            id: stackFrameNumber,
                            name: "current",
                            source: null,
                            line: 0,
                            column: 0,
                            presentationHint: "normal"
                        }
                    ]
                };
                this.sendResponse(response);
                return;
            } else {
                addressInfos.push(addressInfo);
            }
        }

        const callStack = cpuState.cpuInfo.callStack;
        if (callStack) {
            for (let i=0; i<callStack.length; i++) {
                if (args.levels && addressInfos.length >= args.levels) break;
                const depth = callStack.length - i - 1;
                const pc = callStack[depth];
                const stackAddressInfo = debugInfo.getAddressInfo(pc);
                if (!stackAddressInfo) break;
                addressInfos.push(stackAddressInfo);
            }
        }

        const stackFrames = [];

        for (const addressInfo of addressInfos) {

            const source = {
                name: path.basename(addressInfo.source),
                path: addressInfo.source,
                presentationHint: "normal"
            };

            const addr = addressInfo.address;
            let frameName = debugInfo.getScopeName(addr);

            if (null == frameName) {
                const debugLabel = addressInfo.findLabel();
                if (debugLabel) {
                    frameName = debugLabel.name;
                } else {
                    if (stackFrameNumber > 0) {
                        frameName = "current";
                    } else {
                        "caller " + stackFrameNumber;
                    }
                }
            }

            stackFrames.push({
                id: stackFrameNumber,
                name: frameName,
                source: source,
                line: addressInfo.line,
                column: 0,
                presentationHint: "normal"
            });

            stackFrameNumber++;
        }

        response.body = {
            stackFrames: stackFrames
        };

        this.sendResponse(response);
    }

    scopesRequest(response, args) {

        if (null != args && DebugConstants.STACKFRAME_NUMBER === args.frameId) {
            const scopes = [
                new DebugAdapter.Scope("CPU Registers",     DebugConstants.VARIABLES_REGISTERS,   false),
                new DebugAdapter.Scope("CPU Flags",         DebugConstants.VARIABLES_FLAGS,       false),
                new DebugAdapter.Scope("Stack",             DebugConstants.VARIABLES_STACK,       false),
                new DebugAdapter.Scope("Symbols",           DebugConstants.VARIABLES_SYMBOLS,     false),
                new DebugAdapter.Scope("Stats",             DebugConstants.VARIABLES_SYSINFO,     false),
                new DebugAdapter.Scope("Video (VIC)",       DebugConstants.VARIABLES_VIC,         false),
                new DebugAdapter.Scope("Sprites (VIC)",     DebugConstants.VARIABLES_SPRITES,     false)
            ];

            scopes[0].presentationHint = 'registers';

            response.body = {
                scopes: scopes
            };
        }

        this.sendResponse(response);
    }

    async getMemorySnapshot() {
        const variablesCache = this._variablesCache;
        if (!variablesCache.memory) {
            const emu = this._emulator;
            variablesCache.memory = await emu.readMemory(0x0000, 0xffff);
        }
        return variablesCache.memory;
    }

    async getChipState() {

        const variablesCache = this._variablesCache;

        if (!variablesCache.chipState) {
            const memorySnapshot = await this.getMemorySnapshot();
            variablesCache.chipState = ChipState.fromBytes(memorySnapshot);
        }

        return variablesCache.chipState;
    }

    async variablesRequest(response, args) {

        const emu = this._emulator;
        if (!emu) {
            response.success = false;
            response.message = "invalid state";
            this.sendResponse(response);
            return;
        }

        const debugInfo = this._debugInfo;

        args = args||{};

        const cpuState = emu.getCpuState();

        let variables = null;

        const variableType = args.variablesReference & 0xffff0000;

        if (null == args.filter || args.filter == "named") {

            if (DebugConstants.VARIABLES_REGISTERS == args.variablesReference) {

                let registers = cpuState.cpuRegisters;

                variables = [
                    { name: "(accumulator) A",      type: "register", value: Formatter.formatByte(registers.A), variablesReference: 0 },
                    { name: "(register) X",         type: "register", value: Formatter.formatByte(registers.X), variablesReference: 0 },
                    { name: "(register) Y",         type: "register", value: Formatter.formatByte(registers.Y), variablesReference: 0 },
                    { name: "(stack pointer) SP",   type: "register", value: Formatter.formatByte(registers.S), variablesReference: 0 },
                    { name: "(program counter) PC", type: "register", value: Formatter.formatAddress(registers.PC), variablesReference: 0, memoryReference: registers.PC }
                ];

            } else if (DebugConstants.VARIABLES_FLAGS == args.variablesReference) {

                let flags = cpuState.cpuFlags;

                variables = [
                    { name: "(negative) N",    type: "flag", value: Formatter.formatBit(flags.N), variablesReference: 0 },
                    { name: "(overflow) V",    type: "flag", value: Formatter.formatBit(flags.V), variablesReference: 0 },
                    { name: "(break) B",       type: "flag", value: Formatter.formatBit(flags.B), variablesReference: 0 },
                    { name: "(decimal) D",     type: "flag", value: Formatter.formatBit(flags.D), variablesReference: 0 },
                    { name: "(irq disable) I", type: "flag", value: Formatter.formatBit(flags.I), variablesReference: 0 },
                    { name: "(zero) Z",        type: "flag", value: Formatter.formatBit(flags.Z), variablesReference: 0 },
                    { name: "(carry) C",       type: "flag", value: Formatter.formatBit(flags.C), variablesReference: 0 }
                ];

            } else if (DebugConstants.VARIABLES_SYMBOLS == args.variablesReference) {

                variables = [];

                if (null != debugInfo && null != debugInfo._symbols) {

                    let symbols = debugInfo._symbols.values();

                    for (const symbol of symbols) {

                        let info = await this.formatSymbol(symbol);

                        if (symbol.isAddress) {
                            variables.push(
                                {
                                    name: info.label,
                                    type: "address symbol",
                                    value: info.value,
                                    variablesReference: 0,
                                    memoryReference: symbol.value
                                }
                            );
                        } else {
                            variables.push(
                                {
                                    name: info.label,
                                    type: "symbol",
                                    value: info.value,
                                    variablesReference: 0
                                }
                            );

                        }
                    }
                }
            } else  if (DebugConstants.VARIABLES_SYSINFO == args.variablesReference) {

                variables = [
                    { name: "Cycles", type: "stat", value: cpuState.cpuInfo.cycles.toString(), variablesReference: 0 },
                    { name: "Opcode", type: "stat", value: Formatter.formatValue(cpuState.cpuInfo.opcode), variablesReference: 0 },
                    { name: "IRQ", type: "stat", value: Formatter.formatByte(cpuState.cpuInfo.irq), variablesReference: 0 },
                    { name: "NMI", type: "stat", value: Formatter.formatByte(cpuState.cpuInfo.nmi), variablesReference: 0 },
                    { name: "Raster Line", type: "stat", value: Formatter.formatValue(cpuState.cpuInfo.rasterLine), variablesReference: 0 },
                    { name: "Raster Cycle", type: "stat", value: Formatter.formatValue(cpuState.cpuInfo.rasterCycle), variablesReference: 0 },
                    { name: "Zero-$00", type: "stat", value: Formatter.formatByte(cpuState.cpuInfo.zero0), variablesReference: 0 },
                    { name: "Zero-$01", type: "stat", value: Formatter.formatByte(cpuState.cpuInfo.zero1), variablesReference: 0 },
                ];

            } else if (args.variablesReference >= DebugConstants.VARIABLES_SPRITE_0 && args.variablesReference <= DebugConstants.VARIABLES_SPRITE_7) {

                const chipState = await this.getChipState();
                if (chipState) {
                    const vicState = chipState.vic;
                    const vicBase = vicState.baseAddress;
                    const spriteId = (args.variablesReference - DebugConstants.VARIABLES_SPRITE_0);
                    const s = vicState.sprites[spriteId];

                    variables = [

                        { name: "enabled", type: "stat", value: Formatter.formatBit(s.enabled), variablesReference: 0 },
                        { name: "pointer", type: "stat", value: s.pointer.toString(), variablesReference: 0,  memoryReference: (vicBase + s.pointer * 64).toString()},
                        { name: "x", type: "stat", value: Formatter.formatValue(s.x), variablesReference: 0 },
                        { name: "y", type: "stat", value: Formatter.formatValue(s.y), variablesReference: 0 },
                        { name: "color", type: "stat", value: Formatter.formatValue(s.color), variablesReference: 0 },
                        { name: "multi-color", type: "stat", value: Formatter.formatBit(s.multicolor), variablesReference: 0 },
                        { name: "doubleWidth", type: "stat", value: Formatter.formatValue(s.doubleWidth), variablesReference: 0 },
                        { name: "doubleHeight", type: "stat", value: Formatter.formatValue(s.doubleHeight), variablesReference: 0 },
                        { name: "sprite collision", type: "stat", value: Formatter.formatBit(s.spriteCollision), variablesReference: 0 },
                        { name: "background collision", type: "stat", value: Formatter.formatBit(s.backgroundCollision), variablesReference: 0 }

                    ]

                } else {
                    variables = [];
                }


            } else if (DebugConstants.VARIABLES_SPRITES == args.variablesReference) {

                variables = [];

                const chipState = await this.getChipState();
                if (chipState) {
                    const vicState = chipState.vic;

                    variables.push(
                        { name: "Multi-Color 1", type: "stat", value: Formatter.formatByte(vicState.spriteColorMulti1), variablesReference: 0 },
                    );

                    variables.push(
                        { name: "Multi-Color 2", type: "stat", value: Formatter.formatByte(vicState.spriteColorMulti2), variablesReference: 0 },
                    );

                    variables.push(
                        { name: "Sprite/Background Priority", type: "stat", value: Formatter.formatByte(vicState.spriteBackgroundPriority), variablesReference: 0 }
                    );

                    for (let i=0; i<8; i++) {
                        const s = vicState.sprites[i];
                        variables.push(
                            { name: "Sprite " + i, type: "stat", value: s.label, variablesReference: DebugConstants.VARIABLES_SPRITE_0+i }
                        );
                    }
                }

            } else if (DebugConstants.VARIABLES_VIC == args.variablesReference) {

                const chipState = await this.getChipState();
                if (chipState) {
                    const vicState = chipState.vic;
                    const vicBase = vicState.baseAddress;

                    variables = [
                        { name: "Bank Select", type: "stat", value: vicState.bankSelect.toString(), variablesReference: 0 },
                        { name: "Base Address", type: "stat", value: Formatter.formatAddress(vicBase), variablesReference: 0, memoryReference: vicBase },
                        { name: "Screen Address", type: "stat", value: Formatter.formatAddress(vicState.screenAddress), variablesReference: 0, memoryReference: (vicBase + vicState.screenAddress).toString() },
                        { name: "Bitmap Address", type: "stat", value: Formatter.formatAddress(vicState.bitmapAddress), variablesReference: 0, memoryReference: (vicBase + vicState.bitmapAddress).toString() },
                        { name: "Charset Address", type: "stat", value: Formatter.formatAddress(vicState.charsetAddress), variablesReference: 0, memoryReference: (vicBase + vicState.charsetAddress).toString() },
                        { name: "Raster Line", type: "stat", value: Formatter.formatValue(vicState.rasterLine), variablesReference: 0 },
                        { name: "Extended Color Mode", type: "stat", value: Formatter.formatBit(vicState.extendedColorMode), variablesReference: 0 },
                        { name: "Text Mode", type: "stat", value: Formatter.formatBit(vicState.textMode), variablesReference: 0 },
                        { name: "Bitmap Mode", type: "stat", value: Formatter.formatBit(vicState.bitmapMode), variablesReference: 0 },
                        { name: "Multi-Color Mode", type: "stat", value: Formatter.formatBit(vicState.multicolorMode), variablesReference: 0 },
                        { name: "Display Rows", type: "stat", value: vicState.numRows.toString(), variablesReference: 0 },
                        { name: "Display Columns", type: "stat", value: vicState.numColumns.toString(), variablesReference: 0 },
                        { name: "Scroll-X", type: "stat", value: vicState.scrollX.toString(), variablesReference: 0 },
                        { name: "Scroll-Y", type: "stat", value: vicState.scrollY.toString(), variablesReference: 0 },
                        { name: "Lightpen-X", type: "stat", value: vicState.lightPenX.toString(), variablesReference: 0 },
                        { name: "Lightpen-Y", type: "stat", value: vicState.lightPenY.toString(), variablesReference: 0 },
                        { name: "IRQ Flags", type: "stat", value: Formatter.formatByte(vicState.irqFlags), variablesReference: 0 },
                        { name: "IRQ Mask", type: "stat", value: Formatter.formatByte(vicState.irqMask), variablesReference: 0 },
                        { name: "Border Color", type: "stat", value: Formatter.formatByte(vicState.borderColor), variablesReference: 0 },
                        { name: "Background Color", type: "stat", value: Formatter.formatByte(vicState.backgroundColor), variablesReference: 0 },
                        { name: "Background Multi-Color 1", type: "stat", value: Formatter.formatByte(vicState.backgroundColorMulti1), variablesReference: 0 },
                        { name: "Background Multi-Color 2", type: "stat", value: Formatter.formatByte(vicState.backgroundColorMulti2), variablesReference: 0 },
                        { name: "Background Multi-Color 3", type: "stat", value: Formatter.formatByte(vicState.backgroundColorMulti3), variablesReference: 0 },
                    ];
                } else {
                    variables = [];
                }

            } else  if (DebugConstants.VARIABLES_STACK == args.variablesReference) {

                let stackUsage = 255 - cpuState.cpuRegisters.S;

                variables = [
                    {
                        name: "Stack",
                        type: "stack",
                        value: "(" + (stackUsage) + ")",
                        indexedVariables: stackUsage,
                        variablesReference: DebugConstants.VARIABLES_STACK+1000
                    }
                ];

                if (debugInfo.hasCStack) {

                    const mem = await emu.readMemory(0x02, 0x03);
                    const stackPointer = (mem[1] << 8) + mem[0];

                    variables.push(
                        {
                            name: "C-Stack",
                            type: "stack",
                            value: Formatter.formatAddress(stackPointer),
                            variablesReference: 0,
                            memoryReference: stackPointer
                        }
                    );
                }

            }
        } else if (args.filter == "indexed") {
            if (DebugConstants.VARIABLES_STACK + 1000 == args.variablesReference) {

                let ofs = args.start;
                let count = args.count;

                if (ofs < 0) ofs = 0;
                if (ofs > 255) ofs = 255;
                if (ofs+count > 255) count = 255-ofs;

                variables = [];

                for (let i=ofs; i<ofs+count; i++) {
                    let addr = 0xff-i;
                    let value = await emu.read(0x100+addr, 1);
                    variables.push( {
                        name: "$" + Utils.fmt(addr.toString(16), 2),
                        type: "stack",
                        value: Formatter.formatByte(value),
                        variablesReference: 0
                    });
                }

            }
        }

        response.body = {
            variables: variables
        };

        this.sendResponse(response);
    }

    async evaluateRequest(response, args) {

        const debugInfo = this._debugInfo;

        if (!debugInfo || !args || !args.expression ||
            DebugConstants.STACKFRAME_NUMBER !== args.frameId) {

            response.success = false;
            response.message = "invalid expression";
            this.sendResponse(response);
            return;
        }


        const emu = this._emulator;
        const cpuState = emu.getCpuState();
        const registers = cpuState.cpuRegisters;
        const expr = args.expression;
        let typeInfo = null;

        let value = null;
        let address = null;

        if ("#$" == expr.substr(0, 2) && expr.length >= 5) {
            const exprValue = parseInt(expr.substr(2), 16);
            value = "(const) " + Formatter.formatWord(exprValue);
        } else if ("#$" == expr.substr(0, 2) && expr.length >= 3) {
            const exprValue = parseInt(expr.substr(2), 16);
            value = "(const) " + Formatter.formatByte(exprValue);
        } else if ("$" == expr.charAt(0) && expr.length > 1) {
            let addr = null;

            const pos = expr.indexOf(',');
            if (pos >= 0) {
                addr = parseInt(expr.substr(1, pos), 16);
                const fmt = expr.substr(pos+1);
                if (fmt == 'b') {
                    let info = await this.formatSymbol({ value: addr, isAddress: true, data_size: 8 });
                    value = info.value;
                } else if (fmt == 'w') {
                    let info = await this.formatSymbol({ value: addr, isAddress: true, data_size: 16 });
                    value = info.value;
                } else {
                    const numElements = parseInt(fmt);
                    value = await this.formatMemory(addr, numElements);
                }
            } else {
                addr = parseInt(expr.substr(1), 16);
                let info = await this.formatSymbol({ value: addr, isAddress: true });
                value = info.value;
            }

            address = addr;
        } else if (expr.toUpperCase() == "A") {
            value = "(accumulator) A = " + Formatter.formatByte(registers.A);
        } else if (expr.toUpperCase() == "X") {
            value = "(register) X = " + Formatter.formatByte(registers.X);
        } else if (expr.toUpperCase() == "Y") {
            value = "(register) Y = " + Formatter.formatByte(registers.Y);
        } else if (expr.toUpperCase() == "PC") {
            value = "(program counter) PC = " + Formatter.formatAddress(registers.PC);
            address = registers.PC;
        } else if (expr.toUpperCase() == "SP") {
            value = "(stack pointer) SP = " + Formatter.formatByte(registers.S);
        } else {

            const pos = expr.indexOf(',');
            let symbolName = null;
            let numElements = null;
            let dataSize = null;
            if (pos >= 0) {
                symbolName = expr.substr(0, pos);
                const fmt = expr.substr(pos+1);
                if (fmt == 'b') {
                    dataSize = 8;
                } else if (fmt == 'w') {
                    dataSize = 16;
                } else {
                    numElements = parseInt(fmt);
                }
            } else {
                symbolName = expr;
            }

            let symbol = null;

            if (debugInfo.supportsScopes) {
                const pc = cpuState.cpuRegisters.PC;
                symbol = debugInfo.getScopedSymbol(pc, symbolName);
                if (symbol) {
                    const relativeAddress = symbol.value;
                    const mem = await emu.readMemory(0x02, 0x03);
                    const stackPointerMem = (mem[1] << 8) + mem[0];
                    const address = stackPointerMem + relativeAddress;
                    symbol.value = address;
                }
            }

            if (null == symbol) {
                symbol = debugInfo.getSymbol(symbolName);
            }

            if (null != symbol) {

                const addrPrefix = symbol.isAddress ? ("[" + Formatter.formatWord(symbol.value, true) + "] ") : "";

                if (symbol.isAddress && (numElements || dataSize)) {

                    if (numElements) {
                        const memstr = await this.formatMemory(symbol.value, numElements);
                        value = addrPrefix + memstr;
                    } else {
                        let info = await this.formatSymbol({ value: symbol.value, isAddress: true, data_size: dataSize });
                        value = addrPrefix + info.value;
                    }
                } else {
                    let info = await this.formatSymbol(symbol);
                    value = addrPrefix + info.value;
                }
            } else {
                let label = debugInfo.getLabel(expr);
                if (null != label) {
                    value = label.name + ": " + Formatter.formatAddress(label.address) + ", line " + label.line;
                    address = label.address;
                }
            }
        }

        if (null != value) {
            response.body = {
                result : value,
                variablesReference: 0
            };

            if (null != address) {
                response.body.memoryReference = address;
            }
        } else {
            response.success = false;
            response.message = "invalid expression";
        }

        this.sendResponse(response);

    }

    async pauseRequest(response, args) {
        this.sendResponse(response);

        let emu = this._emulator;
        await emu.pause();

        this.onDebugStopped(DebugInterruptReason.PAUSE);
	}

    async continueRequest(response, args) {
        this.sendResponse(response);
        let emu = this._emulator;
        await emu.resume();
        this.sendEvent(new DebugAdapter.ContinuedEvent(1, true));
    }

    async stepInRequest(response, args) {
        await this.doDebugStep(response, DebugStepType.STEP_IN);
    }

    async stepOutRequest(response, args) {
        await this.doDebugStep(response, DebugStepType.STEP_OUT);
    }

    async nextRequest(response, args) {
        await this.doDebugStep(response, DebugStepType.STEP_OVER);
	}

    async doDebugStep(response, debugStepType) {
        const emu = this._emulator;

        await this.syncBreakpoints();

        const debugInfo = this._debugInfo;
        if (!debugInfo) {
            response.success = false;
            response.message ="missing debug info";
            this.sendResponse(response);
            return;
        }

        await emu.step(debugStepType);

        this.sendResponse(response);
    }

    async readMemoryRequest(response, args) {
        //logger.trace("readMemoryRequest");

        const emu = this._emulator;

        const addr = parseInt(args.memoryReference, 10)||0;
        let offset = args.offset;
        let count = args.count;

        let startAddress = addr + offset;
        if (startAddress < 0) {
            offset += startAddress; // handle negative offsets
            startAddress = 0;
        }

        if (startAddress < 0 || startAddress > 0xffff) {
            response.body = {
                address: startAddress.toString(),
                data: null,
                unreadableBytes: count
            };
            this.sendResponse(response);
            return;
        }

        const requestedEndAddress = startAddress + count - ((count > 0) ? 1 : 0);
        const endAddress = Math.min(0xffff, requestedEndAddress);
        const memorySnapshot = await this.getMemorySnapshot();
        const mem = memorySnapshot.subarray(startAddress, endAddress);
        const bytesRead = endAddress - startAddress + 1;

        response.body = {
            address: startAddress.toString(),
            data: Utils.toBase64(mem),
            unreadableBytes: count - bytesRead
        };

		this.sendResponse(response);

    }

    showCode(addressInfo) {

        const filename = addressInfo.source;
        const line = addressInfo.line;

        logger.debug("show code " + filename + ":" + line);

        vscode.workspace.openTextDocument(filename)
        .then(textDocument => {
            let documentLine = textDocument.lineAt(line-1);
            if (null != documentLine) {
                vscode.window.showTextDocument(textDocument)
                .then(textEditor => {
                    textEditor.revealRange(documentLine.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
                })
                .catch((err) => {
                    logger.error("failed to show text document " + filename + ", line " + line);
                });
            }
        })
        .catch((err) => {
            logger.error("failed to open text document " + filename + ", line " + line);
        });
    }

    onDebugError(err) {
        logger.warn("debug error: " + err);

        vscode.window.showErrorMessage(err);
        this.sendEvent(new DebugAdapter.TerminatedEvent());
        this.destroyEmulatorInstance();
    }

    onDebugStarted() {
        logger.debug("debug started");
    }

    onDebugStopped(reason) {
        logger.info("debug stopped");

        if (!reason) return;

        if (reason == DebugInterruptReason.EXIT) {
            this.sendEvent(new DebugAdapter.TerminatedEvent());
        } else if (reason == DebugInterruptReason.FAILED) {
            this.sendEvent(new DebugAdapter.TerminatedEvent());
        } else if (reason == DebugInterruptReason.PAUSE) {
            let e = new DebugAdapter.StoppedEvent("pause", DebugConstants.THREAD_ID);
            e.body.text = "Successfully paused";
            this.sendEvent(e);
        } else {

            this._variablesCache = {}; // clear cached state information

            let eventReason = "";
            let eventDescription = null;

            if (reason == DebugInterruptReason.BREAKPOINT) {
                eventReason = "breakpoint";
                eventDescription = "Paused on breakpoint";
            } else if (reason == DebugInterruptReason.BREAKPOINT) {
                eventReason = "pause";
                eventDescription = "Paused";
            } else {
                eventReason = "stopped";
            }

            let e = new DebugAdapter.StoppedEvent(eventReason, DebugConstants.THREAD_ID);
            e.body.description = eventDescription;
            this.sendEvent(e);

        }
    }

    onDebugBreakpoint(breakpoint) {

        VscodeUtils.debuggerLog(
            "BREAKPOINT at $" +
            Utils.fmtAddress(breakpoint.address) +
            ", line " +
            breakpoint.line
        );

        this.showCode(breakpoint);

    }

    onDebugBreak(pc) {

        logger.break("debug break");

        let msg = "BREAK at $" + Utils.fmtAddress(pc);

        const debugInfo = this._debugInfo;
        if (debugInfo) {
            let addressInfo = debugInfo.getAddressInfo(pc);
            if (null != addressInfo) {
                msg += ", line " + addressInfo.line;
                this.showCode(addressInfo);
            }
        }

        VscodeUtils.debuggerLog(msg);
    }

    onDebugLogpoint(breakpoint) {
        VscodeUtils.debuggerLog(
            "LOGPOINT at $" +
            Utils.fmtAddress(breakpoint.address) +
            ", line " +
            breakpoint.line +
            ": " +
            breakpoint.logMessage
        );
    }

    async formatSymbol(symbol) {

        const emu = this._emulator;
        const info = {};

        if (symbol.isAddress) {

            let addrStr = "$" + Utils.fmt(symbol.value.toString(16), 4);
            info.label = "(" + addrStr + ") " + symbol.name;

            const readSize = (symbol.data_size == 16 && symbol.value != 0xffff) ? 2 : 1;
            const memValue = await emu.read(symbol.value, readSize);
            if (readSize == 1) {
                info.value = Formatter.formatByte(memValue);
            } else {
                info.value = (symbol.data_size == 16) ? Formatter.formatWord(memValue) : Formatter.formatByte(memValue & 255) + " / " + Formatter.formatWord(memValue);
            }

        } else {

            info.label = symbol.name;
            if (symbol.data_size == 8) {
                info.value = Formatter.formatByte(symbol.value);
            } else if (symbol.data_size == 16) {
                info.value = Formatter.formatWord(symbol.value);
            } else {
                info.value = Formatter.formatValue(symbol.value);
            }

        }

        return info;
    }

    async formatMemory(address, memorySize) {
        const emu = this._emulator;
        if (!memorySize) memorySize = 1;
        const readSize = Math.min(256, memorySize);
        const memBuffer = await emu.readMemory(address, address + readSize - 1);
        return Utils.formatMemory(memBuffer, readSize, ' ');
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugSession: DebugSession
}
