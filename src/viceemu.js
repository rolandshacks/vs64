//
// Emulator Vice Remote Monitor
//

const path = require('path');
const fs = require('fs');
const process = require('process');
const { spawn } = require('child_process');
const net = require('net');

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

//-----------------------------------------------------------------------------------------------//
// Emulator
//-----------------------------------------------------------------------------------------------//

class Emulator {

    constructor(session) {

        this._session = session;
        this._settings = session._settings;

        this._socket = null;
        this._procInfo = null;

        this._running = false;

        this.startHostProcess();
    }

    init() {

        /*
        var thisInstance = this;
        setTimeout(function() {
            thisInstance.callHostProcess("help");
        }, 5000);
        */

        this.callHostProcess("clear_labels"); // clear labels
        
    }

    on(eventName, eventFunction) {
        if (null == this._eventMap) {
            this._eventMap = [];
        }

        this._eventMap[eventName] = eventFunction;
    }

    fireEvent(eventName, arg1, arg2, arg3) {
        if (null == this._eventMap) return null;

        var eventFunction = this._eventMap[eventName];
        if (null == eventFunction) return null;

        return eventFunction(arg1, arg2, arg3);
    }

    getStats() {

        var stats = {
            PC: 0,
            registers: {
                A: 0,
                X: 0,
                Y: 0,
                S: 0
            },
            flags: {
                N: 0,
                Z: 0,
                B: 0,
                C: 0,
                V: 0,
                I: 0,
                D: 0
            },
            irq: 0,
            nmi: 0,
            opcode: 0,
            cycles: 0,
        };

        return stats;
    }

    async start(continueExecution) {
        this._running = true;
    }
    
    stop() {
        this._running = false;
    }

    run(runAsync, resolve, continueExecution) {

        var session = this._session;
        var breakpoints = session._breakpoints;

        this.callHostProcess("f 0277 027a 52 55 4e 0d"); // put "RUN" to keyboard buffer
        this.callHostProcess("f 00c6 00c6 04"); // set keyboard buffer to 4

    }

    reset(startAddress) {

        super.reset();
    }

    read(addr){

        if (addr < 0 || addr > 0xFFFF) {
            throw new Error('Illegal memory read at address: ' + addr.toString(16).toLowerCase());
        }

        return 0x0;
    }
     
    write(addr, value){
        if (addr < 0 || addr > 0xFFFF) {
            throw new Error('Illegal memory read at address: ' + addr.toString(16).toLowerCase());
        }
    }

    loadProgram(filename, autoOffsetCorrection) {

        this.callHostProcess("load \"" + filename + "\" 0"); // load program

    }

    startHostProcess() {

        var settings = this._settings;

        if (false == settings.emulatorEnabled) {
            return;
        }

        var executable = settings.emulatorPath;
        var args = [
            "-remotemonitor"
        ];

        var procInfo = {
            exited: false,
            exitCode: 0,
            proc: null
        };

        var thisInstance = this;

        this._running = true;

        var proc = spawn(executable, args);
        procInfo.proc = proc;

        proc.on('exit', (code) => {
            thisInstance._running = false;
            procInfo.exited = true;
            procInfo.exitCode = code;
        });

        this._procInfo = procInfo;
    }

    stopHostProcess() {

        var procInfo = this._procInfo;
        if (null == procInfo) {
            return;
        }
        
        if (null != procInfo.proc) {
            process.kill(procInfo.proc);
            procInfo.proc = null;
        }

        this._procInfo = null;
    }

    async callHostProcess(cmd) {

        var thisInstance = this;

        /*
        await this.connectHostProcess(
            function(socket) {
                socket.write(cmd + "\n\0");
            },
            function(buffer, socket) {
                thisInstance.disconnectHostProcess();
                console.log("VICE:" + buffer.toString());
            }
        );
        */

        var socket = new net.Socket();
        var result = null;

        return new Promise((resolve, reject) => {

            socket.on("connect", function () {
            });

            socket.on("ready", function () {
                socket.write(cmd + "\n\0");
            });

            socket.on("close", function () {
            });

            socket.on("error", function () {
                reject();
                socket.destroy();
            });

            socket.on("timeout", function () {
                reject();
                socket.destroy();
            });

            socket.on("data", function (buffer) {
                resolve(buffer);
                socket.destroy();
            });

            socket.setNoDelay();
            socket.setTimeout(1500);
            socket.connect(6510, 'localhost');

        });
    }

    async connectHostProcess(onConnect, onData) {

        var thisInstance = this;

        var socket = new net.Socket();

        this._socket = socket;
        this._socketReady = false;
        this._socketClosed = false;

        socket.on("connect", function() {
            console.log("connect");
            thisInstance._socketReady = true;
            if (null != onConnect) {
                onConnect(socket);
            }
        });
    
        socket.on("ready", function() {
            console.log("ready");
        });
    
        socket.on("close", function() {
            console.log("close");
            thisInstance._socketReady = false;
            thisInstance._socketClosed = true;
        });
    
        socket.on("error", function() {
            console.log("error");
        });
    
        socket.on("timeout", function() {
            console.log("timeout");
        });
    
        socket.on("data", function(buffer) {
            console.log("data");
            if (onData) {
                onData(buffer, socket);
            } else {
                thisInstance.onHostProcessData(buffer);
            }
        });
    
        socket.setNoDelay();
        socket.setTimeout(1500);
        socket.connect(6510, 'localhost');
    
    }

    disconnectHostProcess() {
        if (null != this._socket) {
            this._socket.end();
            this._socket = null;
        }

        this._socketReady = false;
        this._socketClosed = true;
    }

    onHostProcessData(data) {

    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = Emulator;
