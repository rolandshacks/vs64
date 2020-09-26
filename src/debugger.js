//
// VS64 Debugger
//

const path = require('path');
const fs = require('fs');
const Net = require('net');
const vscode = require('vscode');
const debug = require('vscode-debugadapter');
const { Subject } = require('await-notify');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

var Constants = require('src/constants');
var Utils = require('src/utils');
var DebugInfo = require('src/debug_info');
var Emulator = require('src/emulator');

//-----------------------------------------------------------------------------------------------//
// Debugger
//-----------------------------------------------------------------------------------------------//
class Debugger {

    // create debugger instance
    constructor(extension) {
        this._extension = extension;
        this._context = extension._context;
        this._settings = extension._settings;
        this._session = null;
    }

    // start debugger
    start() {

        // create session
        this._session = new DebugSession(this);

        this._session.start();

        if (0 == this._session._port) {
            console.error("could not start session");
            return;
        }

        // register configuration provider to pass back the port number
        // (instead of the default 4711)
        vscode.debug.registerDebugConfigurationProvider(Constants.AssemblerLanguageId, this);
        this._context.subscriptions.push(this);

    }

    // stop debugger
    stop() {

        if (null != this._session) {
            this._session.stop();
            this._session = null;
        }
    }

    // dispose resource
    dispose() {
        this.stop();
    }

    findPrg(filename) {

        var workspacePath = vscode.workspace.rootPath;
        var outDir = path.join(workspacePath, Constants.OutputDirectory);

        var prg = Utils.findFile(outDir, filename)||"";

        if (prg.substr(0, workspacePath.length) == workspacePath) {
            prg = path.join("${workspaceFolder}", prg.substr(workspacePath.length));
        }

        return prg;
    }

    // create debug configuration
    provideDebugConfigurations(folder, token) {
        var src = Utils.getCurrentAsmFile();
        var prg = (null != src) ? Utils.getOutputFilename(src, "prg") : "";

        var config = {
            type: "asm",
            request: "launch",
            name: "Launch Program",
            binary: prg
        };

        return config;
    }

    // update debug configuration
    resolveDebugConfiguration(folder, config, token) {
        if (null != config &&
            null != this._session) {

            if (null == config.type || config.type == "") {
                config.type = "asm";
            }

            if (null == config.request || config.request == "") {
                config.request = "launch";
            }

            if (null == config.name || config.name == "") {
                config.name = "Launch Program";
            }

            if (null == config.binary || config.binary == "") {

                var src = Utils.getCurrentAsmFile();

                if (null != src) {
                    var prg = Utils.getOutputFilename(src, "prg");
                    config.binary = prg;
                } else {
                    vscode.window.showErrorMessage("Could not launch debugger: Unknown program file, and there is no assembly file open to auto-detect it.");
                    return null;
                }

            } else {
                if (!fs.existsSync(config.binary)) {
                    var foundBinary = this.findPrg(config.binary);
                    if (null != foundBinary && foundBinary != "") {
                        config.binary = foundBinary;
                    }
                }
            }

            config.debugServer = this._session._port;
        }

        return config;
    }
}

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//
Debugger.THREAD_ID = 1;
Debugger.STACKFRAME_NUMBER = 1;
Debugger.VARIABLES_REGISTERS = 1;
Debugger.VARIABLES_FLAGS = 2;
Debugger.VARIABLES_SYMBOLS = 3;
Debugger.VARIABLES_STATS = 4;
Debugger.VARIABLES_STACK = 5;

//-----------------------------------------------------------------------------------------------//
// Debug Session
//-----------------------------------------------------------------------------------------------//
class DebugSession extends debug.LoggingDebugSession {

    // session constructor
    constructor(host) {

        // set log file name
        super("vs64-debug.txt");

        this._host = host;
        this._settings = host._settings;
        this._server = null;
        this._port = 0;
        this._configurationDone = new Subject();
        this._debugInfo = null;
        this._breakpoints = null;
        this._launchBinary = null;
        this._launchPC = null;

        var emu = null;

        emu = new Emulator(this);
        this._emulator = emu;

        var thisInstance = this;

        emu.on('breakpoint', function(breakpoint) {
            thisInstance.onBreakpoint(breakpoint);
        });

        emu.on('break', function(pc) {
            thisInstance.onBreak(pc);
        });

        emu.on('logpoint', function(breakpoint) {
            thisInstance.onLogpoint(breakpoint);
        });

    }

    // start session socket server
    start(inStream, outStream) {

        if (null != inStream && null != outStream) {
            super.start(inStream, outStream);
            return;
        }

        var thisInstance = this;

        var verbose = this._settings.verbose;

        var port = 0;

        // start as a server
        if (verbose) {
            console.error("waiting for debug protocol client");
        }

        this._server = Net.createServer((socket) => {

            socket.on('end', () => {
                if (verbose) {
                    console.error('client connection closed');
                }
            });

            thisInstance.setRunAsServer(true);
            thisInstance.start(socket, socket);

        }).listen(port);

        if (0 == port) {
            var addr = this._server.address();
            if (null != addr) {
                port = addr.port;
            }
        }

        this._port = port;
    }

    // stop session
    stop() {
        this._port = 0;
    }

    dispatchRequest(request) {
        if (this._settings.verbose) {
            console.log(`dispatch request: ${request.command}(${JSON.stringify(request.arguments) })`);
        }
        return super.dispatchRequest(request);
    }

    sendResponse(response) {
        //console.log(`send response: ${response.command}(${JSON.stringify(response.body) })`);
        return super.sendResponse(response);
    }

    sendEvent(event) {
        if (this._settings.verbose) {
            console.log(`send event: ${event.event}(${JSON.stringify(event) })`);
        }
        return super.sendEvent(event);
    }

    initializeRequest(response, args) {

        response.body = response.body || {};
		response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsRestartRequest = true;
        response.body.supportsEvaluateForHovers = true;
        response.body.supportsLogPoints = true;

		this.sendResponse(response);

    }

    disconnectRequest(response, args) {

        var emu = this._emulator;
        emu.stop();

        super.disconnectRequest(response, args);
    }

    restartRequest(response, args) {

        var emu = this._emulator;

        try {
            emu.init();
            emu.loadProgram(this._launchBinary, Constants.ProgramAddressCorrection, this._launchPC);
        } catch (err) {
            response.success = false;
            response.message = err.toString();
            this.sendResponse(response);
            return;
        }

        var thisInstance = this;
        emu.start().then(function(exitInfo) {
            thisInstance.onEmulatorStopped(exitInfo);
        });

		this.sendResponse(response);
    }

    parseAddressString(str) {

        if (null == str) return null;

        str = str.trim();
        if (str == "") return null;

        var value = 0x0;

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

    async launchRequest(response, args) { // jshint ignore:line

        if (args.type != "asm") {
            response.success = false;
            response.message ="invalid type";
            this.sendResponse(response);
            return;
        }

        this.clearBreakpoints();

        var binaryPath = args.binary;
        var forcedStartAddress = this.parseAddressString(args.pc);

        this._debugInfo = null;
        this._breakpoints = null;
        this._launchBinary = null;
        this._launchPC = null;

        var emu = this._emulator;

        try {
            emu.init();
            emu.loadProgram(binaryPath, Constants.ProgramAddressCorrection, forcedStartAddress);

            if (null == this._debugInfo) {
                var debugInfoPath = Utils.changeExtension(binaryPath, ".report");
                this.loadDebugInfo(debugInfoPath);
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
        this.sendEvent(new debug.InitializedEvent());
        await this._configurationDone.wait(3000); // jshint ignore:line

        var thisInstance = this;
        emu.start().then(function(exitInfo) {
            thisInstance.onEmulatorStopped(exitInfo);
        });

		this.sendResponse(response);
    }

    setBreakPointsRequest(response, args) {

        var resultBreakpoints = [];

        var emu = this._emulator;
        if (null != this._debugInfo) {

            var source = path.resolve(args.source.path);
            // Fixup path to match capitalization in DebugInfo
            if (source.charAt(1) == ':') {
                source = source.substr(0, 1).toUpperCase() + source.substr(1);
            }
            var sourceBreakpoints = args.breakpoints;

            for (var i=0, sourceBreakpoint; (sourceBreakpoint=sourceBreakpoints[i]); i++) {

                var breakpoint = this.addBreakpoint(source, sourceBreakpoint.line, sourceBreakpoint.logMessage);

                if (null != breakpoint) {
                    resultBreakpoints.push({
                        source: {
                            path: source,
                            presentationHint: 'normal'
                        },
                        line: breakpoint.line,
                        verified: true
                    });
                    if (this._settings.verbose) {
                        Utils.debuggerLog("set breakpoint at line " + breakpoint.line);
                    }
                } else {
                    resultBreakpoints.push({
                        source: {
                            path: source,
                            presentationHint: 'deemphasize'
                        },
                        line: sourceBreakpoint.line,
                        verified: false, // not found
                        message: 'No code found on this line'
                    });
                    Utils.debuggerLog("could not set breakpoint at line " + sourceBreakpoint.line);
                }
            }
        }

        response.body = {
            breakpoints: resultBreakpoints
        };

        this.sendResponse(response);
    }

    configurationDoneRequest(response, args) {
        super.configurationDoneRequest(response, args);
        this._configurationDone.notify();
	}

    threadsRequest(response, args) {
        response.body = {
            threads: [
                new debug.Thread(Debugger.THREAD_ID, "MOS6502 Main")
            ]
        };

		this.sendResponse(response);
	}

    stackTraceRequest(response, args) {

        var emu = this._emulator;
        var stats = emu.getStats();

        var addressInfo = this.getAddressInfo(stats.PC);

        var source = null;

        if (null != addressInfo) {
            source = {
                name: path.basename(addressInfo.source),
                path: addressInfo.source,
                presentationHint: "normal"
            };
        }

        var stackFrames = [];

        stackFrames.push({
            id: Debugger.STACKFRAME_NUMBER,
            name: "global",
            source: source,
            line: (null != addressInfo ? addressInfo.line : 0),
            column: 0,
            presentationHint: "normal"
        });

        response.body = {
            stackFrames: stackFrames
        };

        this.sendResponse(response);
    }

    scopesRequest(response, args) {

        if (null != args && Debugger.STACKFRAME_NUMBER === args.frameId) {
            const scopes = [
                new debug.Scope("Registers",  Debugger.VARIABLES_REGISTERS, false),
                new debug.Scope("Flags",      Debugger.VARIABLES_FLAGS,     false),
                new debug.Scope("Symbols",    Debugger.VARIABLES_SYMBOLS,   false),
                new debug.Scope("Statistics", Debugger.VARIABLES_STATS,     false),
                new debug.Scope("Stack",      Debugger.VARIABLES_STACK,     false)
            ];

            scopes[0].presentationHint = 'registers';

            response.body = {
                scopes: scopes
            };
        }

        this.sendResponse(response);
    }

    variablesRequest(response, args) {

        args = args||{};

        var variables = null;

        var emu = this._emulator;
        var stats = emu.getStats();

        if (null == args.filter || args.filter == "named") {

            if (Debugger.VARIABLES_REGISTERS == args.variablesReference) {

                var registers = stats.registers;

                variables = [
                    { name: "(accumulator) A",      type: "register", value: this.formatByte(registers.A), variablesReference: 0 },
                    { name: "(register) X",         type: "register", value: this.formatByte(registers.X), variablesReference: 0 },
                    { name: "(register) Y",         type: "register", value: this.formatByte(registers.Y), variablesReference: 0 },
                    { name: "(stack pointer) SP",   type: "register", value: this.formatByte(registers.S), variablesReference: 0 },
                    { name: "(program counter) PC", type: "register", value: this.formatAddress(stats.PC), variablesReference: 0 }
                ];

            } else if (Debugger.VARIABLES_FLAGS == args.variablesReference) {

                var flags = stats.flags;

                variables = [
                    { name: "(negative) N",    type: "flag", value: this.formatBit(flags.N), variablesReference: 0 },
                    { name: "(overflow) V",    type: "flag", value: this.formatBit(flags.V), variablesReference: 0 },
                    { name: "(break) B",       type: "flag", value: this.formatBit(flags.B), variablesReference: 0 },
                    { name: "(decimal) D",     type: "flag", value: this.formatBit(flags.D), variablesReference: 0 },
                    { name: "(irq disable) I", type: "flag", value: this.formatBit(flags.I), variablesReference: 0 },
                    { name: "(zero) Z",        type: "flag", value: this.formatBit(flags.Z), variablesReference: 0 },
                    { name: "(carry) C",       type: "flag", value: this.formatBit(flags.C), variablesReference: 0 }
                ];

            } else if (Debugger.VARIABLES_SYMBOLS == args.variablesReference) {

                variables = [];

                if (null != this._debugInfo && null != this._debugInfo.symbols) {

                    var symbols = this._debugInfo.symbols;

                    for (var i=0, symbol; (symbol=symbols[i]); i++) {

                        var info = this.formatSymbol(symbol);

                        if (symbol.isAddress) {
                            variables.push(
                                {
                                    name: info.label,
                                    type: "address symbol",
                                    value: info.value,
                                    variablesReference: 0
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
            } else  if (Debugger.VARIABLES_STATS == args.variablesReference) {

                variables = [
                    { name: "Cycles", type: "stat", value: stats.cycles.toString(), variablesReference: 0 },
                    { name: "Opcode", type: "stat", value: this.formatValue(stats.opcode), variablesReference: 0 }
                ];

            } else  if (Debugger.VARIABLES_STACK == args.variablesReference) {

                let stackUsage = 255-stats.registers.S;

                variables = [
                    {
                        name: "Stack",
                        type: "stack",
                        value: "(" + (stackUsage) + ")",
                        indexedVariables: stackUsage,
                        variablesReference: Debugger.VARIABLES_STACK+1000
                    }
                ];

            }
        } else if (args.filter == "indexed") {
            if (Debugger.VARIABLES_STACK + 1000 == args.variablesReference) {

                var ofs = args.start;
                var count = args.count;

                if (ofs < 0) ofs = 0;
                if (ofs > 255) ofs = 255;
                if (ofs+count > 255) count = 255-ofs;

                variables = [];

                for (let i=ofs; i<ofs+count; i++) {
                    var addr = 0xff-i;
                    var value = emu.read(0x100+addr);
                    variables.push( {
                        name: "$" + Utils.fmt(addr.toString(16), 2),
                        type: "stack",
                        value: this.formatByte(value),
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

    evaluateRequest(response, args) {

        var emu = this._emulator;
        var evals = [];

        var stats = emu.getStats();
        var registers = stats.registers;

        var value = null;

        if (null != args && null != args.expression && Debugger.STACKFRAME_NUMBER === args.frameId) {
            var expr = args.expression;

            if ("#$" == expr.substr(0, 2) && expr.length == 4) {
                var exprValue = parseInt(expr.substr(2), 16);
                value = "(const) " + this.formatByte(exprValue);
            } else if ("$" == expr.charAt(0) && expr.length == 5) {
                var addr = parseInt(expr.substr(1), 16);
                var symbolinfo = this.formatSymbol({ value: addr, isAddress:true });
                value = "(address) " + expr + " = " + symbolinfo.value;
            } else if ("$" == expr.charAt(0) && expr.length == 3) {
                var numValue = parseInt(expr.substr(1), 16);
                value = "(const) " + this.formatByte(numValue);
            } else if (expr.toUpperCase() == "A") {
                value = "(accumulator) A = " + this.formatByte(registers.A);
            } else if (expr.toUpperCase() == "X") {
                value = "(register) X = " + this.formatByte(registers.X);
            } else if (expr.toUpperCase() == "Y") {
                value = "(register) Y = " + this.formatByte(registers.Y);
            } else if (expr.toUpperCase() == "PC") {
                value = "(program counter) PC = " + this.formatAddress(stats.PC);
            } else if (expr.toUpperCase() == "SP") {
                value = "(stack pointer) SP = " + this.formatByte(registers.S);
            } else {
                var symbol = this.getSymbol(expr);
                if (null != symbol) {
                    var info = this.formatSymbol(symbol);
                    value = info.label + " = " + info.value;
                } else {
                    var label = this.getLabel(expr);
                    if (null != label) {
                        value = label.name + ": " + this.formatAddress(label.address) + ", line " + label.line;
                    }
                }
            }
        }

        if (null != value) {
            response.body = {
                result : value,
                variablesReference: 0
            };
        } else {
            response.success = false;
            response.message = "invalid expression";
        }

        this.sendResponse(response);

    }

    pauseRequest(response, args) {
        this.sendResponse(response);

        var emu = this._emulator;
        emu.stop();

        var e = new debug.StoppedEvent("pause", Debugger.THREAD_ID);
        e.body.text = "Successfully paused";
        this.sendEvent(e);
	}

    continueRequest(response, args) {
        this.sendResponse(response);

        var thisInstance = this;

        var emu = this._emulator;
        emu.start(true).then(function(exitInfo) {
            thisInstance.onEmulatorStopped(exitInfo);
        });

        this.sendEvent(new debug.ContinuedEvent(1, true));

    }

    stepInRequest(response, args) {
        this.nextRequest(response, args);
    }

    stepOutRequest(response, args) {
        this.nextRequest(response, args);
    }

    nextRequest(response, args) {
        this.sendResponse(response);

        var emu = this._emulator;
        emu.step();

        let e = new debug.StoppedEvent("breakpoint", Debugger.THREAD_ID);
        this.sendEvent(e);

        var stats = emu.getStats();
        var pc = stats.PC;
        var addressInfo = this.getAddressInfo(pc);
        if (null != addressInfo) {
            this.showCode(addressInfo.source, addressInfo.line);
        }

	}

    onEmulatorStopped(exitInfo) {
        if (this._settings.verbose) {
            console.log("emulator stopped...");
        }

        var reason = exitInfo.reason;

        if (reason == Constants.InterruptReason.EXIT) {
            this.sendEvent(new debug.TerminatedEvent());
        } else {
            var eventReason = (reason == Constants.InterruptReason.BREAKPOINT) ? "breakpoint" : "stopped";
            let e = new debug.StoppedEvent(eventReason, Debugger.THREAD_ID);
            if (reason == Constants.InterruptReason.BREAKPOINT) {
                e.body.description = "Paused on breakpoint";
            }
            this.sendEvent(e);
        }
    }

    showCode(filename, line) {
        vscode.workspace.openTextDocument(filename).then(textDocument => {
            var documentLine = textDocument.lineAt(line-1);
            if (null != documentLine) {
                vscode.window.showTextDocument(textDocument).then(textEditor => {
                    textEditor.revealRange(documentLine.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
                });
            }
        });
    }

    onBreak(pc) {

        var emu = this._emulator;

        var msg = "BREAK at $" + this.fmtAddress(pc);

        var addressInfo = this.getAddressInfo(pc);
        if (null != addressInfo) {
            msg += ", line " + addressInfo.line;
            this.showCode(addressInfo.source, addressInfo.line);
        }

        Utils.debuggerLog(msg);

    }

    onBreakpoint(breakpoint) {

        var emu = this._emulator;

        Utils.debuggerLog(
            "BREAKPOINT at $" +
            this.fmtAddress(breakpoint.address.address) +
            ", line " +
            breakpoint.line
        );

        this.showCode(breakpoint.path, breakpoint.line);

    }

    onLogpoint(breakpoint) {

        var emu = this._emulator;

        Utils.debuggerLog(
            "LOGPOINT at $" +
            this.fmtAddress(breakpoint.address.address) +
            ", line " +
            breakpoint.line +
            ": " +
            breakpoint.logMessage
        );
    }

    formatValue(value) {
        return this.formatWord(value);
    }

    formatAddress(value) {
        return this.formatWord(value);
    }

    formatBit(value) {
        return (0 == value) ? "0 (unset)" : "1 (set)";
    }

    formatByte(value) {
        return "$" + Utils.fmt(value.toString(16), 2) + " (" + value.toString() + ")";
    }

    formatWord(value) {
        return "$" + Utils.fmt(value.toString(16), 4) + " (" + value.toString() + ")";
    }

    formatSymbol(symbol) {

        var emu = this._emulator;

        var info = {};

        if (symbol.isAddress) {

            var addrStr = "$" + Utils.fmt(symbol.value.toString(16), 4);
            info.label = "(" + addrStr + ") " + symbol.name;

            if (symbol.data_size == 8 || symbol.value == 0xFFFF) { // avoids emu.read from 0x10000
                var memValue = emu.read(symbol.value);
                info.value = this.formatByte(memValue);
            } else {
                var memValue = emu.read(symbol.value) | (emu.read(symbol.value+1)<<8);
                info.value = (symbol.data_size == 16) ? this.formatWord(memValue) : this.formatByte(memValue & 255) + " / " + this.formatWord(memValue);
            }

        } else {

            info.label = symbol.name;
            info.value = this.formatValue(symbol.value);

        }

        return info;
    }

    clearBreakpoints() {
        this._breakpoints = null;
    }

    addBreakpoint(path, line, logMessage) {

        var foundAddr = this.findNearestCodeLine(path, line);
        if (null == foundAddr) return null;

        if (null == this._breakpoints) {
            this._breakpoints = [];
        }

        var breakpoint = {
            path: path,
            line: line,
            address: foundAddr,
            logMessage: logMessage
        };

        var idx = this._breakpoints.length;
        while (idx > 0) {
            if (breakpoint.address.address < this._breakpoints[idx-1].address.address) {
                idx--;
            } else {
                break;
            }
        }

        // insert
        this._breakpoints.splice(idx, 0, breakpoint);
        // this._breakpoints.push(breakpoint);

        return breakpoint;
    }

    findNearestCodeLine(path, line) {

        var debugInfo = this._debugInfo;
        if (null == debugInfo) return null;

        var addr = debugInfo.sourceRef[path];
        if (null == addr || addr.length == 0) {
            addr = debugInfo.addresses;
        }

        if (null == addr || addr.length == 0) return null;

        var foundAddr = null;

        var firstLine = addr[0].line;
        var lastLine = addr[addr.length-1].line;

        if (line <= firstLine) {
            foundAddr = addr[0];
        } else if (line >= lastLine) {
            foundAddr = addr[addr.length-1];
        } else {

            // perform binary search

            var l = 0;
            var r = addr.length-1;

            while (null == foundAddr && l <= r) {
                var m = Math.floor((l+r)/2);
                var a = addr[m];

                //console.log("OFS: " + ofs + " " + line + ":" + a.line);

                if (line == a.line) {
                    foundAddr = a;
                    break;
                } else if (line > a.line) {
                    l = m + 1;
                } else {
                    r = m - 1;
                }
            }

        }

        return foundAddr;
    }

    getSymbol(name) {
        if (null == this._debugInfo || null == this._debugInfo.symbols) {
            return null;
        }

        var symbols = this._debugInfo.symbols;

        for (var i=0, symbol; (symbol=symbols[i]); i++) {
            if (symbol.name == name) {
                return symbol;
            }
        }

        return null;
    }

    getLabel(name) {
        if (null == this._debugInfo || null == this._debugInfo.labels) {
            return null;
        }

        var labels = this._debugInfo.labels;

        for (var i=0, label; (label=labels[i]); i++) {
            if (label.name == name) {
                return label;
            }
        }

        return null;
    }

    loadDebugInfo(filename) {
        this._debugInfo = DebugInfo.load(filename);
    }

    getAddressInfo(address) {

        var debugInfo = this._debugInfo;

        if (null == debugInfo) return null;

        var addr = debugInfo.addresses;
        if (addr.length < 1) return null;

        if (address < addr[0].address ||
            address > addr[addr.length-1].addr) {
            return null;
        }

        // perform binary search

        var foundAddr = null;
        var l = 0;
        var r = addr.length-1;

        while (null == foundAddr && l <= r) {
            var m = Math.floor((l+r)/2);
            var a = addr[m];

            //console.log("OFS: " + ofs + " " + line + ":" + a.line);

            if (address == a.address) {
                foundAddr = a;
                break;
            } else if (address > a.address) {
                l = m + 1;
            } else {
                r = m - 1;
            }
        }

        return foundAddr;
    }

    fmtAddress(a) {
        return ("0000"+a.toString(16)).substr(-4);
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = Debugger;
