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
const { Utils } = require('utilities/utils');
const { Formatter } = require('utilities/formatter');
const { Expression } = require('utilities/expression');
const { Logger } = require('utilities/logger');
const { Breakpoint, Breakpoints, DebugInterruptReason, DebugStepType } = require('debugger/debug');
const { Emulator } = require('emulator/emu');
const { ViceProcess } = require('debugger/debug_vice');
const { X16Process } = require('debugger/debug_x16');
const { DebugDataType } = require('debugger/debug_info_types');
const { DebugInfo } = require('debugger/debug_info');
const { DebugStateProvider } = require('debugger/debug_state');
const { DebugVariablesProvider } = require('debugger/debug_variables');
const { DebugHelper } = require('debugger/debug_helper');

const logger = new Logger("DebugSession");

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//

const DebugConstants = {
    THREAD_ID: 1,
    STACKFRAME_NUMBER: 1
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
        this._debuggerSessionInfo = null;
        this._debugInfo = null;
        this._breakpoints = new Breakpoints();
        this._breakpointsDirty = true;
        this._launchBinary = null;
        this._launchPC = null;
        this._emulator = null;
        this._emulatorProcess = null;
        this._isBasic = false;
        this._variablesProvider = new DebugVariablesProvider(this);
        this._stateProvider = new DebugStateProvider(this);

    }

    get isBasic() { return this._isBasic; }

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
        this.#destroyEmulatorInstance();
        this._port = 0;
    }

    initializeRequest(response, _args_) {

        response.body = response.body || {};
		response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsRestartRequest = true;
        response.body.supportsEvaluateForHovers = true;
        response.body.supportsLogPoints = true;
        response.body.supportsReadMemoryRequest = true;
        response.body.supportsMemoryReferences = true;
        response.body.supportsSetVariable = true;

		this.sendResponse(response);

    }

    disconnectRequest(response, args) {
        this.#destroyEmulatorInstance();
        super.disconnectRequest(response, args);
    }

    async attachRequest(response, args) {
        logger.trace("attachRequest");
        this.#launchOrAttachRequest(response, args);
    }

    async launchRequest(response, args) {
        logger.trace("launchRequest");
        this.#launchOrAttachRequest(response, args);
    }

    #loadDebugInfo() {

        const project = this._project;
        if (!project) return null;

        let debugInfoPath = project.outdebug;

        let needsReload = true;

        if (this._debugInfo && this._debugInfo.timestamp && this._debugInfo.filename) {
            if (debugInfoPath != null && debugInfoPath == this._debugInfo.filename) {
                const filetime = Utils.getFileTime(debugInfoPath);
                if (filetime == this._debugInfo.timestamp) {
                    needsReload = false;
                }
            }
        }

        if (needsReload) {
            const debugInfo = new DebugInfo(debugInfoPath, project);
            this._debugInfo = debugInfo;
        }

    }

    #debuggerProcessExitHandler(_proc_) {
        this._emulatorProcess = null;
        this.sendEvent(new DebugAdapter.TerminatedEvent());
    }

    async #createEmulatorProcess() {

        const options = this._debuggerSessionInfo;
        const debuggerType = options.type;

        if (this._emulatorProcess && this._emulatorProcess.alive) {
            this._emulatorProcess.kill();
            this._emulatorProcess = null;
        }

        const settings = this._settings;
        const instance = this;

        const processExitHandler = (proc) => {
            instance.#debuggerProcessExitHandler(proc);
        }

        if (debuggerType == Constants.DebuggerTypeVice) {
            this._emulatorProcess = new ViceProcess();

            const args = settings.viceArgs + (options.args ? (" " + options.args) : "");
            const emulatorCommand = settings.viceExecutable + " " + args;
            logger.trace(`launch VICE emulator: ${emulatorCommand}`)

            try {
                await this._emulatorProcess.spawn(
                    settings.viceExecutable,
                    settings.vicePort,
                    args,
                    { onexit: processExitHandler }
                );
            } catch (err) {
                throw(err);
            }
        } else if (debuggerType == Constants.DebuggerTypeX16) {
            this._emulatorProcess = new X16Process();

            let args = []
            if (settings.x16Args && settings.x16Args.length > 0) args.push(settings.x16Args);
            if (options.args && options.args.length > 0) args.push(options.args);

            if (!options.args || options.args.indexOf("-debug") == -1) {
                const breakpoints = options.breakpoints;
                if (breakpoints && !breakpoints.empty()) {
                    const firstBreakpoint = breakpoints.at(0);
                    if (firstBreakpoint) {
                        args.push("-debug " + firstBreakpoint.address.toString(16));
                    }
                } else {
                    args.push("-debug");
                }
            }

            const argsLine = args.join(' ');
            const emulatorCommand = settings.x16Executable + " " + argsLine;

            logger.trace(`launch X16 emulator: ${emulatorCommand}`)

            try {
                await this._emulatorProcess.spawn(
                    settings.x16Executable,
                    argsLine,
                    options.prg,
                    { onexit: processExitHandler }
                );
            } catch (err) {
                throw(err);
            }


        } else {
            return null;
        }

        return this._emulatorProcess;
    }

    #destroyEmulatorProcess() {
        //if (KILL_VICE_PROCESS_AT_STOP) {
        if (this._emulatorProcess) {
            this._emulatorProcess.kill();
            this._emulatorProcess = null;
        }
    }

    async #createEmulatorInstance(attachToProcess, restartEmulatorProcess) {

        this.#destroyEmulatorInstance(restartEmulatorProcess);

        const options = this._debuggerSessionInfo;

        let thisInstance = this;

        this._breakpointsDirty = true;

        let emu = null;

        const debuggerType = options.type;

        if (debuggerType == Constants.DebuggerType6502) {

            emu = new Emulator(this);

        } else if (debuggerType == Constants.DebuggerTypeVice) {

            try {
                if (!attachToProcess) {
                    if (!this._emulatorProcess || !this._emulatorProcess.alive) {
                        await this.#createEmulatorProcess();
                    }
                }

                emu = ViceProcess.createDebugInterface(this);
                await emu.connect(options.hostname, options.port);
            } catch (err) {
                logger.error("debug error: " + err);
                throw(err);
            }

        } else if (debuggerType == Constants.DebuggerTypeX16) {

            try {
                if (!attachToProcess) {
                    if (!this._emulatorProcess || !this._emulatorProcess.alive) {
                        await this.#createEmulatorProcess();
                    }
                }

                emu = X16Process.createDebugInterface(this);

            } catch (err) {
                logger.error("debug error: " + err);
                throw(err);
            }

        } else {
            throw("invalid debugger type");
        }

        if (null != emu) {
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
        }

        this._emulator = emu;

        return emu;
    }

    #destroyEmulatorInstance(restartEmulatorProcess) {

        const emu = this._emulator;
        this._emulator = null;

        if (emu && !restartEmulatorProcess) {
            emu.stop();
            if (emu.disconnect) emu.disconnect();
        }

        const emuProcess = this._emulatorProcess;
        if (emuProcess && !emuProcess.supportsRelaunch) {
            this._emulatorProcess = null;
            if (restartEmulatorProcess) {
                emuProcess.disableEvents();
            }
            if (emuProcess.alive) emuProcess.kill();
        }

    }

    async #launchOrAttachRequest(response, args) {

        const settings = this._settings;
        const debuggerType = args.type;
        const debuggerCommand = args.request||"launch";
        const attachToProcess = (debuggerCommand == "attach");

        if (debuggerType != Constants.DebuggerType6502 &&
            debuggerType != Constants.DebuggerTypeVice &&
            debuggerType != Constants.DebuggerTypeX16) {
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

        const project = this._project;
        if (!project) {
            response.success = false;
            response.message ="Invalid or missing project configuration";
            this.sendResponse(response);
            return null;
        }

        const toolkit = project.toolkit;
        this._isBasic = toolkit ? toolkit.isBasic : false;
        this._launchBinary = null;
        this._launchPC = null;

        let breakpoints = null;

        try {
            this.#loadDebugInfo();
            breakpoints = this.#loadBreakpoints();
        } catch (err) {
            response.success = false;
            response.message = "Failed to load debug info: " + err.toString();
            this.sendResponse(response);
            return;
        }

        const options = {
            type: debuggerType,
            args: args.args,
            breakpoints: breakpoints
        };

        let binaryPath = args.program;
        let forcedStartAddress = DebugHelper.parseAddressString(args.pc);

        if (debuggerType == Constants.DebuggerTypeVice) {
            options.hostname = args.hostname||"localhost";
            options.port = attachToProcess ? (args.port||settings.vicePort) : settings.vicePort;
        } else if (debuggerType == Constants.DebuggerTypeX16) {
            options.prg = binaryPath;
        }

        this._debuggerSessionInfo = options;

        let emu = null;

        try {
            emu = await this.#createEmulatorInstance(attachToProcess);
        } catch (err) {
            response.success = false;
            response.message ="Failed to start emulator. Please check your settings.\nError: " + err;
            this.sendResponse(response);
            return;
        }

        try {

            await this.#syncBreakpoints(false, breakpoints);

            if (debuggerType != Constants.DebuggerTypeX16) {
                // X16 does not support injection of binary
                await emu.loadProgram(binaryPath, Constants.ProgramAddressCorrection, forcedStartAddress);
            }

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
                this.#debuggerLog("could not set breakpoint at line " + requestedBreakpoint.line);
            }
        }

        response.body = {
            breakpoints: resultBreakpoints
        };

        const activeDebugSession = vscode.debug.activeDebugSession;
        if (activeDebugSession) {
            this.#syncBreakpoints();
        }

        this.sendResponse(response);
    }

    #loadBreakpoints(force, debugBreakpoints) {
        if (null == debugBreakpoints) {
            debugBreakpoints = this._breakpoints;
        }

        if (!this._breakpointsDirty && !force) return debugBreakpoints;

        const debugInfo = this._debugInfo;
        if (!debugInfo) return debugBreakpoints;

        const editorBreakpoints = vscode.debug.breakpoints;

        debugBreakpoints.clear();

        if (this._isBasic) {
            // break at basic interpreter end (either end of program or end command or BREAK key)
            const exitHooks = [ Constants.BasicInterpreterBreakRoutine,
                                Constants.BasicInterpreterErrorRoutine,
                                Constants.BasicInterpreterListRoutine,
                                Constants.TSBInterpreterErrorRoutine ];
            for (const hookAddr of exitHooks) {
                const exitHook = new Breakpoint(hookAddr, null, null, null);
                exitHook.isBasic = true;
                debugBreakpoints.add(exitHook);
            }

        }

        if (editorBreakpoints && editorBreakpoints.length > 0) {

            let basicInterpreterHooks = [];

            if (this._isBasic) {

                // break at basic interpreter loop, at get next token routine
                const interpreterHooks = [ Constants.BasicInterpreterLoopRoutine,
                                           Constants.TSBInterpreterLoopRoutine ];
                for (const hookAddr of interpreterHooks) {
                    const interpreterHook = new Breakpoint(hookAddr, null, null, null);
                    interpreterHook.isBasic = true;
                    interpreterHook.basicBreakpoints = [];
                    debugBreakpoints.add(interpreterHook);
                    basicInterpreterHooks.push(interpreterHook);
                }
            }

            {
                for (const breakpoint of editorBreakpoints) {
                    if (!breakpoint.enabled) continue;

                    const codeRef = breakpoint.location;
                    if (!codeRef) continue;

                    const fileToFind = codeRef.uri.fsPath;
                    const lineToFind = codeRef.range.start.line+1;

                    const location = debugInfo.findNearestCodeLine(fileToFind, lineToFind);
                    if (!location) continue;

                    const debugBreakpoint = new Breakpoint(
                        location.address,
                        null, // using location.address_end may result in repeated hits per source line
                        location.source,
                        location.line
                    );

                    if (basicInterpreterHooks.length > 0) {
                        for (const interpreterHook of basicInterpreterHooks) {
                            interpreterHook.basicBreakpoints.push(debugBreakpoint);
                        }
                    } else {
                        debugBreakpoints.add(debugBreakpoint);
                    }
                }
            }
        }

        return debugBreakpoints;
    }

    async #syncBreakpoints(force, breakpoints) {

        if (!this._breakpointsDirty && !force && null == breakpoints) return;

        if (null == breakpoints) {
            breakpoints = this.#loadBreakpoints(force);
        }

        const emu = this._emulator;
        await emu.setBreakpoints(breakpoints);
        this._breakpointsDirty = false;
    }

    configurationDoneRequest(response, args) {
        super.configurationDoneRequest(response, args);
        this._configurationDone.notify();
	}

    threadsRequest(response, _args_) {
        response.body = {
            threads: [
                new DebugAdapter.Thread(DebugConstants.THREAD_ID, "MOS6502 Main")
            ]
        };

		this.sendResponse(response);
	}

    async stackTraceRequest(response, args) {

        const debugInfo = this._debugInfo;
        if (!debugInfo) {
            response.success = false;
            response.message ="missing debug info";
            this.sendResponse(response);
            return;
        }

        let stackFrameNumber = DebugConstants.STACKFRAME_NUMBER;

        const stateProvider = this._stateProvider;
        const cpuState = stateProvider.getCpuState();

        if (debugInfo.hasFunctions) {
            await this.getCStackTrace(response, args);
            return;
        }

        const addressInfos = [];

        if (this._isBasic) {
            const basicState = await stateProvider.getBasicState();
            if (basicState) {
                const pc = basicState.registers.currentStatement;

                const addressInfo = debugInfo.getAddressInfo(pc);
                if (!addressInfo) {
                    response.body = {
                        stackFrames: [
                            {
                                id: stackFrameNumber,
                                name: "BASIC",
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

        } else {
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

    async getCStackTrace(response, _args) {

        const debugInfo = this._debugInfo;
        const stateProvider = this._stateProvider;
        const cpuState = stateProvider.getCpuState();

        let emu = this._emulator;

        const stackFrames = [];
        const stackAddrTable = [];

        let stackPointer = cpuState.cpuRegisters.S;

        //await emu.read(0x0, 1);

        //let ptr = 0xF4 - 2; // 0xff;
        let ptr = 0xff - 2;
        while (ptr >= stackPointer) {
            let addr = await emu.read(0x100+ptr + 1, 2);

            if (addr >= 2) {

                const sourceAddress = addr - 2;
                const callerOpcode = await emu.read(sourceAddress);
                if (callerOpcode == 0x20) { // check for JSR opcode
                    stackAddrTable.push(sourceAddress);
                    ptr -= 2;
                } else {
                    ptr--;
                }
            } else {
                ptr--;
            }
        }

        stackAddrTable.push(cpuState.cpuRegisters.PC);

        for (let i=stackAddrTable.length-1; i>=0; i--) {
            const addr = stackAddrTable[i];
            const functionInfo = debugInfo.getFunctionByAddr(addr);
            if (functionInfo == null) continue;

            const addrInfo = debugInfo.getAddressInfo(addr);

            const source = (addrInfo != null) ? addrInfo.source : functionInfo.source;
            const line = (addrInfo != null) ? addrInfo.line : functionInfo.line;

            const sourceInfo = {
                name: path.basename(source),
                path: source,
                presentationHint: "normal"
            };

            stackFrames.push({
                id: 1,
                name: functionInfo.name,
                source: sourceInfo,
                line: line,
                column: 0,
                presentationHint: "normal"
            });
        }

        response.body = {
            stackFrames: stackFrames
        };

        this.sendResponse(response);
    }

    async scopesRequest(response, args) {

        if (null != args && DebugConstants.STACKFRAME_NUMBER === args.frameId) {
            const scopes = this._variablesProvider.getScopes();

            if (scopes && scopes.length > 0) {

                response.body = {
                    scopes: []
                };

                for (const scope of scopes) {
                    response.body.scopes.push(new DebugAdapter.Scope(scope[0], scope[1], false));
                }

                scopes[0].presentationHint = 'registers';
            }
        }

        this.sendResponse(response);
    }

    async variablesRequest(response, args) {
        await this._variablesProvider.variablesRequest(response, args);
        this.sendResponse(response);
    }

    async setVariableRequest(response, args) {
        await this._variablesProvider.setVariableRequest(response, args);
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

        const stateProvider = this._stateProvider;
        const cpuState = stateProvider.getCpuState();
        const registers = cpuState.cpuRegisters;
        const expr = args.expression;

        let value = null;
        let address = null;

        if ("#$" == expr.substr(0, 2) && expr.length >= 5) {
            const exprValue = parseInt(expr.substr(2), 16);
            value = "(const) " + Formatter.formatU16(exprValue);
        } else if ("#$" == expr.substr(0, 2) && expr.length >= 3) {
            const exprValue = parseInt(expr.substr(2), 16);
            value = "(const) " + Formatter.formatU8(exprValue);
        } else if (expr.toUpperCase() == "A") {
            value = "(accumulator A) " + Formatter.formatU8(registers.A);
        } else if (expr.toUpperCase() == "X") {
            value = "(register X) " + Formatter.formatU8(registers.X);
        } else if (expr.toUpperCase() == "Y") {
            value = "(register Y) " + Formatter.formatU8(registers.Y);
        } else if (expr.toUpperCase() == "PC") {
            value = "(program counter) " + Formatter.formatAddress(registers.PC);
            address = registers.PC;
        } else if (expr.toUpperCase() == "SP") {
            value = "(stack pointer) " + Formatter.formatU8(registers.S);
        } else {
            const exprValue = await this.#getFormattedData(expr);
            if (exprValue) {
                value = exprValue.result;
                address = exprValue.address;
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

    async restartRequest(response, args) {

        if (this._debuggerSessionInfo && args && args.arguments) {
            // update launch arguments
            this._debuggerSessionInfo.args = args.arguments.args;
        }

        let emu = this._emulator;
        if (null != this._debuggerSessionInfo && null != this._emulatorProcess && !this._emulatorProcess.supportsRelaunch) {
            if (null != emu) {
                emu.unregisterAllListeners();
            }
            emu = await this.#createEmulatorInstance(false, true);
        }

        await this.#syncBreakpoints();

        if (this._debuggerSessionInfo.type != Constants.DebuggerTypeX16) {
            // X16 does not support injection of binary
            try {
                await emu.loadProgram(this._launchBinary, Constants.ProgramAddressCorrection, this._launchPC);
            } catch (err) {
                response.success = false;
                response.message = err.toString();
                this.sendResponse(response);
                return;
            }
        }

        emu.start();

		this.sendResponse(response);
    }

    async pauseRequest(response, _args_) {
        this.sendResponse(response);

        let emu = this._emulator;
        emu.pause();

        //this.onDebugStopped(DebugInterruptReason.PAUSE);
	}

    async continueRequest(response, _args_) {
        this.sendResponse(response);
        let emu = this._emulator;
        await emu.resume();
        this.sendEvent(new DebugAdapter.ContinuedEvent(1, true));
    }

    async stepInRequest(response, _args_) {
        await this.#doDebugStep(response, DebugStepType.STEP_IN);
    }

    async stepOutRequest(response, _args_) {
        await this.#doDebugStep(response, DebugStepType.STEP_OUT);
    }

    async nextRequest(response, _args_) {
        await this.#doDebugStep(response, DebugStepType.STEP_OVER);
	}

    async readMemoryRequest(response, args) {
        //logger.trace("readMemoryRequest");

        let addr = parseInt(args.memoryReference, 10)||0;
        if (addr < 0) addr = 0x0;
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
        const bufferedMemory = await this._stateProvider.getMemorySnapshot();
        const rangeSize = endAddress - startAddress + 1;
        const mem = bufferedMemory.toSlice(startAddress, rangeSize);

        response.body = {
            address: startAddress.toString(),
            data: Utils.toBase64(mem),
            unreadableBytes: count - rangeSize
        };

		this.sendResponse(response);

    }

    onDebugError(err) {
        logger.warn("debug error: " + err);

        vscode.window.showErrorMessage(err);
        this.sendEvent(new DebugAdapter.TerminatedEvent());
        this.#destroyEmulatorInstance();
    }

    onDebugStarted() {
        logger.trace("debug started");
    }

    onDebugStopped(reason) {
        logger.trace("debug stopped");

        if (!reason) return;

        if (reason == DebugInterruptReason.EXIT) {
            this.sendEvent(new DebugAdapter.TerminatedEvent());
        } else if (reason == DebugInterruptReason.FAILED) {
            this.sendEvent(new DebugAdapter.TerminatedEvent());
        } else {

            this._stateProvider.clearCache();

            const emu = this._emulator;
            if (emu) {
                emu._profiler.update();
            }

            let eventReason = "";
            let eventDescription = null;

            if (reason == DebugInterruptReason.BREAKPOINT) {
                eventReason = "breakpoint";
                eventDescription = "Paused on breakpoint";
            } else if (reason == DebugInterruptReason.BREAK) {
                eventReason = "break";
                eventDescription = "Break";
            } else if (reason == DebugInterruptReason.PAUSE) {
                eventReason = "pause";
                eventDescription = "Paused";
            } else {
                eventReason = "stopped";
            }

            let e = new DebugAdapter.StoppedEvent(eventReason, DebugConstants.THREAD_ID);

            e.body.description = eventDescription;
            e.body.preserveFocusHint = false;
            e.body.allThreadsStopped = true;

            this.sendEvent(e);

        }
    }

    async onDebugBreakpoint(breakpoint) {

        if (this._isBasic || breakpoint.isBasic) {

            this.#debuggerLog(
                "BREAKPOINT at $" +
                Utils.fmtAddress(breakpoint.address) +
                ", file " + breakpoint.source +
                ", line " + breakpoint.line +
                ", basic line " + breakpoint.basicLine
            );

        } else {

            this.#debuggerLog(
                "BREAKPOINT at $" +
                Utils.fmtAddress(breakpoint.address) +
                ", line " + breakpoint.line
            );

        }

        DebugHelper.showCode(breakpoint.source, breakpoint.line);

    }

    onDebugBreak(pc) {

        logger.trace("debug break");

        let msg = "BREAK at $" + Utils.fmtAddress(pc);

        const debugInfo = this._debugInfo;
        if (debugInfo) {
            let addressInfo = debugInfo.getAddressInfo(pc);
            if (null != addressInfo) {
                if (addressInfo.source) msg += ", file " + addressInfo.source;
                msg += ", line " + addressInfo.line;
                DebugHelper.showCode(addressInfo.source, addressInfo.line);
            }
        }

        this.#debuggerLog(msg);
    }

    onDebugLogpoint(breakpoint) {
        this.#debuggerLog(
            "LOGPOINT at $" +
            Utils.fmtAddress(breakpoint.address) +
            ", line " +
            breakpoint.line +
            ": " +
            breakpoint.logMessage
        );
    }

    async #doDebugStep(response, debugStepType) {
        const emu = this._emulator;

        await this.#syncBreakpoints();

        const debugInfo = this._debugInfo;
        if (!debugInfo) {
            response.success = false;
            response.message ="missing debug info";
            this.sendResponse(response);
            return;
        }

        this.sendResponse(response);

        await emu.step(debugStepType);
    }

    #findNamedItem(name) {
        const debugInfo = this._debugInfo;
        const stateProvider = this._stateProvider;
        const cpuState = stateProvider.getCpuState();
        const registers = cpuState.cpuRegisters;

        let item = null;

        const info = {
            name: name
        };

        if (debugInfo.supportsScopes) {
            const pc = registers.PC;
            item = debugInfo.getScopedSymbol(pc, name);
            if (item) {
                info.symbol = item;
                info.relativeAddress = item.value;
            }
        }

        if (null == item) {
            item = debugInfo.getSymbol(name);
            if (!item && name[0]!='_') item = debugInfo.getSymbol('_'+name);
            if (item) {
                info.symbol = item;
                info.absoluteAddress = item.value;
            }
        }

        if (null == item) {
            item = debugInfo.getLabel(name);
            if (item) {
                info.label = item;
                info.absoluteAddress = item.address;
            }
        }

        if (!item) return null;

        return info;
    }

    #parseQuery(expr) {

        if (!expr) return null;

        let address = null;
        let dataSize = null;
        let elementCount = null;

        let pos = expr.indexOf(',');
        const reference = pos >= 0 ? expr.substr(0, pos) : expr;

        let isExpression = false;

        for (let c of reference) {
            if ("+-*/()".indexOf(c) >= 0) {
                isExpression = true;
                break;
            }
        }

        if (!isExpression && "$" == reference.charAt(0) && reference.length > 1) {
            address = parseInt(reference.substr(1), 16);
        }

        let isIndirect = false;

        if (pos >= 0) {
            pos++;

            if (expr[pos] == 'i') {
                isIndirect++;
                pos++;
            }

            const fmt = expr.substr(pos);
            if (fmt == 'b') {
                dataSize = 8;
            } else if (fmt == 'w') {
                dataSize = 16;
            } else {
                elementCount = parseInt(fmt);
            }
        }

        return {
            name: reference,
            isExpression: isExpression,
            isIndirect: isIndirect,
            address: address,
            dataSize : dataSize,
            elementCount : elementCount
        };
    }

    async #getNamedItemAddress(name) {

        const emu = this._emulator;

        let address = null;

        let addressInfo = this.#findNamedItem(name);
        if (!addressInfo) return null;

        if (addressInfo.absoluteAddress) {
            address = addressInfo.absoluteAddress;
        } else if (addressInfo.relativeAddress) {
            // resolve symbol from C-Stack
            const mem = await emu.readMemory(0x02, 0x03);
            const stackPointerMem = (mem[1] << 8) + mem[0];
            address = stackPointerMem + addressInfo.relativeAddress;
        } else {
            return null;
        }

        return address;
    }

    async #getFormattedData(expr) {

        const emu = this._emulator;

        const query = this.#parseQuery(expr);

        if (!query) return null;

        if (query.isExpression) {

            const expression = new Expression(query.name, (name) => {
                const addressInfo = this.#findNamedItem(name);
                if (!addressInfo) return null;
                return addressInfo.absoluteAddress;
            });

            const computedAddress = expression.eval();

            query.address = computedAddress;
            query.namedValue = true;

        } else if (query.address == null) {
            query.address = await this.#getNamedItemAddress(query.name, query.isIndirect);
            query.namedValue = true;
        }

        query.result = null;

        if (query.address == null) {
            return query;
        }

        if (query.isIndirect) {
            const mem = await emu.readMemory(query.address, query.address+1);
            query.address = (mem[1] << 8) + mem[0];
        }

        const prefix = query.namedValue ? ("[" + Formatter.formatU16(query.address, true) + "] ") : "";

        if (query.elementCount) {
            query.result = prefix + await this.formatMemory(query.address, query.elementCount);
        } else {
            const info = await this.formatSymbol({ value: query.address, isAddress: true, data_size: query.dataSize });
            query.result = prefix + info.value;
        }

        return query;
    }

    formatSymbolBytes(symbol, mem, ofs, plain) {
        ofs |= 0;

        let s = null;

        switch (symbol.data_type) {
            case DebugDataType.POINTER: {
                let v = mem[ofs];
                s = Formatter.formatU16dec(v, plain);
                break;
            }
            case DebugDataType.UINT8: {
                let v = mem[ofs];
                s = Formatter.formatU8dec(v, plain);
                break;
            }
            case DebugDataType.INT8: {
                let m = mem[ofs];
                let v = (m&0x80) ? -(0x100-m) : m;
                s = v.toString();
                break;
            }
            case DebugDataType.UINT16: {
                let v = mem[ofs] + (mem[ofs+1] << 8);
                s = Formatter.formatU16dec(v, plain);
                break;
            }
            case DebugDataType.INT16: {
                let m = mem[ofs] + (mem[ofs+1] << 8);
                let v = (mem[ofs+1]&0x80) ? -(0x10000-m) : m;
                s = v.toString();
                break;
            }
            case DebugDataType.UINT32: {
                let v = mem[ofs] + (mem[ofs+1] << 8) + (mem[ofs+2] << 16) + (mem[ofs+3] * 0x1000000);
                s = Formatter.formatU32dec(v, plain);
                break;
            }
            case DebugDataType.INT32: {
                let m = mem[ofs] + (mem[ofs+1] << 8) + (mem[ofs+2] << 16) + (mem[ofs+3] * 0x1000000);
                let v = mem[ofs+3] ? -(0x100000000-m) : m;
                s = v.toString();
                break;
            }
            case DebugDataType.FLOAT32: {
                var buf = new Uint8Array([mem[ofs+3], mem[ofs+2], mem[ofs+1], mem[ofs]]).buffer;
                var view = new DataView(buf);
                s = view.getFloat32(0).toString();
                break;
            }
            case DebugDataType.BOOL: {
                let v = mem[ofs];
                s = Formatter.formatBool(v);
                break;
            }
            default: {
                break;
            }
        }

        return s;
    }

    async unpackStructureSymbol(symbol, pointerSymbol) {

        if (null == symbol || symbol.data_type != DebugDataType.STRUCT) return null;
        if (!symbol.isAddress || !symbol.num_children || !symbol.children) return null;

        const emu = this._emulator;
        const mem = await emu.readMemory(0, 0xffff);

        const items = [];

        let addr = symbol.value;

        if (null != pointerSymbol) {
            const pointerAddrPos = pointerSymbol.value;
            addr = mem[pointerAddrPos] + (mem[pointerAddrPos+1]<<8);
        }

        for (const child of symbol.children) {
            const ofs = child.value;
            const unpackedChild = this.unpackSymbol(child, mem, 0, addr, ofs);
            unpackedChild.name = child.name;
            if (null != unpackedChild) {
                items.push(unpackedChild);
            }
        }

        return items;
    }

    async unpackArraySymbol(symbol) {

        if (!symbol.isAddress || !symbol.num_children || !symbol.data_size) return null;

        const data_type = symbol.data_type;

        const is_primitive = DebugDataType.is_primitive(data_type);

        const emu = this._emulator;
        const mem = await emu.readMemory(0, 0xffff);

        const addr = symbol.value;
        const sz = symbol.memory_size;
        const data_size = symbol.data_size;
        let ofs = addr;
        const end_ofs = ofs + sz;

        const values = [];
        let count = 0;
        while (ofs < end_ofs) {

            if (count < 256) {
                let ev = is_primitive ?
                    this.formatSymbolBytes(symbol, mem, ofs, true) :
                    "{" + Utils.formatMemory(mem, ofs, data_size, 1, ' ') + "}";

                if (ev == null) break;
                values.push(ev);
            }

            count++;
            ofs += data_size;
        }

        return values;
    }

    unpackSymbol(symbol, mem, idx, addr, ofs) {

        let unpackedSymbol = null;

        if (symbol.isAddress) {

            if (null == addr) {
                addr = symbol.value;
            }

            if (null != symbol.stack_pointer_addr) {
                // stack address is stored in zero page
                // symbol address is relative to stack
                const stackPointer = mem[symbol.stack_pointer_addr] + (mem[symbol.stack_pointer_addr+1]<<8);
                addr += stackPointer;

                if (null != symbol.stack_pointer_offset) {
                    addr += symbol.stack_pointer_offset;
                }
            }

            if (symbol.data_type == DebugDataType.POINTER) {
                // resolve pointer address
                // (a pointer is an address pointing to another address...)
                addr = mem[addr] + (mem[addr+1]<<8);
            }

            if (null != ofs) {
                addr += ofs;
            }

            let mem_ref = addr;

            const addrStr = "$" + Utils.fmt(addr.toString(16), 4);
            let label = "(" + addrStr + ") " + symbol.name;

            let num_children = null;

            const description = symbol.memory_size ?
                symbol.name + ": " + symbol.memory_size + " bytes at " + Formatter.formatAddress(addr) :
                symbol.name + ": " + Formatter.formatAddress(addr);

            let value = null;

            if (symbol.data_type != DebugDataType.VOID) {

                if (symbol.num_children && symbol.data_size) { // ARRAY

                    const sz = symbol.memory_size;
                    let ofs = addr;
                    const end_ofs = ofs + sz;
                    num_children = symbol.num_children||0;
                    const data_size = symbol.data_size||1;

                    let count = 0;
                    let v = "";
                    while (ofs < end_ofs) {

                        if (count < 256 && count < num_children) {
                            let ev = this.formatSymbolBytes(symbol, mem, ofs, true);
                            if (ev == null) break;
                            if (v.length > 0) v += ", ";
                            v += ev;
                        }

                        count++;
                        ofs += data_size;
                    }

                    value = "(" + num_children + ") [" + v + "]";

                } else if (symbol.data_type == DebugDataType.STRUCT) {
                    let type_label = symbol.type_name ? symbol.type_name : "struct";
                    value = type_label;
                    num_children = symbol.num_children||0;
                } else if (symbol.data_type == DebugDataType.POINTER) {
                    let type_label = symbol.type_name ? symbol.type_name : "pointer";
                    value = type_label;
                    if (null != symbol.type_ref) {
                        if (symbol.type_ref.data_type == DebugDataType.STRUCT) {
                            num_children = symbol.type_ref.num_children||0;
                        } else {
                            value = this.formatSymbolBytes( symbol.type_ref, mem, addr);
                        }
                    }

                } else {
                    value = this.formatSymbolBytes(symbol, mem, addr);
                }
            }

            if (null == value) {

                if (symbol.memory_size) {
                    value = Utils.formatMemory(mem, addr, symbol.memory_size, 1, ' ');
                } else {
                    const readSize = (symbol.data_size == 1 || addr == 0xffff) ? 1 : 2;
                    if (readSize == 1) {
                        value = Formatter.formatU8(mem[addr]);
                    } else {
                        const memValue = mem[addr] + (mem[addr+1]<<8);
                        value = Formatter.formatU8(memValue & 255) + " / " + Formatter.formatU16(memValue);
                    }
                }
            }

            unpackedSymbol = {
                name: label,
                type: description,
                value: value,
                variablesReference: 0,
                memoryReference: mem_ref
            };

            if (num_children) {
                unpackedSymbol.indexedVariables = num_children;
                unpackedSymbol.variablesReference = (symbol.index != null) ? (symbol.index + 1) : 0;
            }

        } else {

            const label = symbol.name;
            const description = symbol.name + " = " + symbol.value;

            let value = null;

            if (symbol.data_size == 1) {
                value = Formatter.formatU8(symbol.value);
            } else if (symbol.data_size == 2) {
                value = Formatter.formatU16(symbol.value);
            } else {
                value = Formatter.formatValue(symbol.value);
            }

            unpackedSymbol = {
                name: label,
                type: description,
                value: value,
                variablesReference: 0
            };
        }

        return unpackedSymbol;
    }

    async unpackSymbols(symbols) {
        if (null == symbols || symbols.length < 1) return null;

        const emu = this._emulator;
        const mem = await emu.readMemory(0, 0xffff);
        const unpackedSymbols = [];

        let idx = 0;

        for (const symbol of symbols) {
            const unpackedSymbol = this.unpackSymbol(symbol, mem, idx);
            if (unpackedSymbol != null) unpackedSymbols.push(unpackedSymbol);
            idx++;
        }

        if (unpackedSymbols.length < 1) return null;

        return unpackedSymbols;
    }

    async formatSymbol(symbol) {

        const emu = this._emulator;
        const info = {};

        if (symbol.data_type && symbol.data_type != DebugDataType.VOID) {

            const mem = await emu.readMemory(0, 0xffff);
            const unpackedSymbol = this.unpackSymbol(null, symbol, mem);
            if (unpackedSymbol != null) return null;

            info.label = (unpackedSymbol != null) ? unpackedSymbol.label : symbol.name;
            info.value = (unpackedSymbol != null) ? unpackedSymbol.label : Formatter.formatValue(symbol.value);

        } else {

            info.label = symbol.name;
            if (symbol.data_size == 1) {
                info.value = Formatter.formatU8(symbol.value);
            } else if (symbol.data_size == 2) {
                info.value = Formatter.formatU16(symbol.value);
            } else {
                info.value = Formatter.formatValue(symbol.value);
            }

        }

        return info;
    }

    async formatMemory(address, memorySize, elementSize) {
        const emu = this._emulator;
        if (!memorySize) memorySize = 1;
        const readSize = Math.min(256, memorySize);
        const memBuffer = await emu.readMemory(address, address + readSize - 1);
        return Utils.formatMemory(memBuffer, 0, readSize, elementSize, ' ');
    }

    #debuggerLog(message) {
        vscode.debug.activeDebugConsole.appendLine(message);
    }

    /*
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
    */
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DebugSession: DebugSession
}
