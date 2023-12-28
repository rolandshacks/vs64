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
const { Expression } = require('utilities/expression');
const { Logger } = require('utilities/logger');
const { Breakpoint, Breakpoints, DebugInterruptReason, DebugStepType } = require('debugger/debug');
const { Emulator } = require('emulator/emu');
const { ViceConnector, ViceProcess } = require('connector/connector');
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

    async #createEmulatorProcess() {

        if (this._emulatorProcess && this._emulatorProcess.alive) {
            this._emulatorProcess.kill();
        }

        const settings = this._settings;
        const instance = this;

        this._emulatorProcess = new ViceProcess();

        const emulatorCommand = settings.emulatorExecutable + " " + settings.emulatorArgs;
        logger.trace(`launch emulator: ${emulatorCommand}`)

        try {
            await this._emulatorProcess.spawn(
                settings.emulatorExecutable,
                settings.emulatorPort,
                settings.emulatorArgs,
                {
                    onexit:
                        (/*proc*/) => {
                            instance._emulatorProcess = null;
                            instance.sendEvent(new DebugAdapter.TerminatedEvent());
                        }
                }
            );
        } catch (err) {
            throw(err);
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

    async #createEmulatorInstance(debugConfigType, attachToProcess, hostname, port) {

        this.#destroyEmulatorInstance();

        let thisInstance = this;

        this._breakpointsDirty = true;

        let emu = null;

        if (debugConfigType == Constants.DebuggerType6502) {

            emu = new Emulator(this);

        } else if (debugConfigType == Constants.DebuggerTypeVice) {

            try {
                if (!attachToProcess) {
                    if (!this._emulatorProcess || !this._emulatorProcess.alive) {
                        await this.#createEmulatorProcess();
                    }
                }

                emu = new ViceConnector(this);
                await emu.connect(hostname, port);
            } catch (err) {
                logger.error("debug error: " + err);
                throw(err);
            }

        } else {
            throw("invalid debugger type");
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

    #destroyEmulatorInstance() {

        const emu = this._emulator;
        this._emulator = null;

        if (emu) {
            emu.stop();
            if (emu.disconnect) emu.disconnect();
        }
    }

    async #launchOrAttachRequest(response, args) {

        const settings = this._settings;
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

        const project = this._project;
        if (!project) return null;
        const toolkit = project.toolkit;
        if (toolkit) {
            this._isBasic = toolkit.isBasic;
        } else {
            this._isBasic = false;
        }

        let binaryPath = args.program;
        let forcedStartAddress = DebugHelper.parseAddressString(args.pc);

        this._launchBinary = null;
        this._launchPC = null;

        const emuHostname = args.hostname||"localhost";
        const emuPort = attachToProcess ? (args.port||settings.emulatorPort) : settings.emulatorPort;

        let emu = null;

        try {
            emu = await this.#createEmulatorInstance(args.type, attachToProcess, emuHostname, emuPort);
        } catch (err) {
            response.success = false;
            response.message ="Failed to start emulator. Please check your settings.\nError: " + err;
            this.sendResponse(response);
            return;
        }

        try {
            this.#loadDebugInfo();
            await this.#syncBreakpoints();

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

    async #syncBreakpoints(force) {

        if (!this._breakpointsDirty && !force) return;

        const emu = this._emulator;

        const debugInfo = this._debugInfo;
        if (!debugInfo) return;

        const editorBreakpoints = vscode.debug.breakpoints;

        const debugBreakpoints = this._breakpoints;
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
                        null,
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

        await emu.setBreakpoints(debugBreakpoints);
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

    scopesRequest(response, args) {

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
            value = "(const) " + Formatter.formatWord(exprValue);
        } else if ("#$" == expr.substr(0, 2) && expr.length >= 3) {
            const exprValue = parseInt(expr.substr(2), 16);
            value = "(const) " + Formatter.formatByte(exprValue);
        } else if (expr.toUpperCase() == "A") {
            value = "(accumulator A) " + Formatter.formatByte(registers.A);
        } else if (expr.toUpperCase() == "X") {
            value = "(register X) " + Formatter.formatByte(registers.X);
        } else if (expr.toUpperCase() == "Y") {
            value = "(register Y) " + Formatter.formatByte(registers.Y);
        } else if (expr.toUpperCase() == "PC") {
            value = "(program counter) " + Formatter.formatAddress(registers.PC);
            address = registers.PC;
        } else if (expr.toUpperCase() == "SP") {
            value = "(stack pointer) " + Formatter.formatByte(registers.S);
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

    async restartRequest(response, _args_) {

        let emu = this._emulator;

        await this.#syncBreakpoints();

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
        const memorySnapshot = await this._stateProvider.getMemorySnapshot();
        const mem = memorySnapshot.subarray(startAddress, endAddress);
        const bytesRead = endAddress - startAddress + 1;

        response.body = {
            address: startAddress.toString(),
            data: Utils.toBase64(mem),
            unreadableBytes: count - bytesRead
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

        const prefix = query.namedValue ? ("[" + Formatter.formatWord(query.address, true) + "] ") : "";

        if (query.elementCount) {
            query.result = prefix + await this.formatMemory(query.address, query.elementCount);
        } else {
            const info = await this.formatSymbol({ value: query.address, isAddress: true, data_size: query.dataSize });
            query.result = prefix + info.value;
        }

        return query;
    }

    async formatSymbol(symbol) {

        const emu = this._emulator;
        const info = {};

        if (symbol.isAddress) {

            let addrStr = "$" + Utils.fmt(symbol.value.toString(16), 4);
            info.label = "(" + addrStr + ") " + symbol.name;

            if (symbol.memory_size) {
                //const elementSize = symbol.data_size ? symbol.data_size / 8 : null;
                info.value = await this.formatMemory(symbol.value, symbol.memory_size);
            } else {
                const readSize = (symbol.data_size == 16 && symbol.value != 0xffff) ? 2 : 1;
                const memValue = await emu.read(symbol.value, readSize);
                if (readSize == 1) {
                    info.value = Formatter.formatByte(memValue);
                } else {
                    info.value = (symbol.data_size == 16) ? Formatter.formatWord(memValue) : Formatter.formatByte(memValue & 255) + " / " + Formatter.formatWord(memValue);
                }
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

    async formatMemory(address, memorySize, elementSize) {
        const emu = this._emulator;
        if (!memorySize) memorySize = 1;
        const readSize = Math.min(256, memorySize);
        const memBuffer = await emu.readMemory(address, address + readSize - 1);
        return Utils.formatMemory(memBuffer, readSize, elementSize, ' ');
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
