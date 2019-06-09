//
// Emulator MOS 6502
//

const path = require('path');
const fs = require('fs');
const process = require('process');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
var Constants = require('src/constants');
var CPU6502 = require('src/6502/cpu');

var CPU6510 = false;

function getTime() {
    var t = process.hrtime();
    return t[0]*1000000 + ((t[1]/1000)|0);
}

//-----------------------------------------------------------------------------------------------//
// Emulator
//-----------------------------------------------------------------------------------------------//

class Emulator extends CPU6502 {

    constructor(session) {
        super();

        this._session = session;

        if (CPU6510) {
            this._roms = {
                kernal: require('roms/kernal'),
                basic: require('roms/basic'),
                char: require('roms/char'),
                d1541: require('roms/1541')
            };
        }

        this._memory = new Uint8Array(65536);
        this._eventMap = null;

        this.init();
    }

    init() {
        this._running = false;
        this._prg = null;
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
            PC: this.PC,
            registers: {
                A: this.A,
                X: this.X,
                Y: this.Y,
                S: this.S
            },
            flags: {
                N: this.N,
                Z: this.Z,
                B: this.B,
                C: this.C,
                V: this.V,
                I: this.I,
                D: this.D
            },
            irq: this.irq,
            nmi: this.nmi,
            opcode: this.opcode,
            cycles: this.cycles,
        };

        return stats;
    }

    async start(continueExecution) { // jshint ignore:line

        this._running = true;
        var thisInstance = this;

        var promise = new Promise(function(resolve, reject) {
            setTimeout(function() {
                thisInstance.run(true, resolve, continueExecution); 
            }, 0);
        });

        return promise;
    }
    
    stop() { // jshint ignore:line

        this._running = false;
        
    }

    run(runAsync, resolve, continueExecution) {

        var result = {
            reason: Constants.InterruptReason.UNKNOWN
        };

        var session = this._session;

        var breakpoints = session._breakpoints;
        var breakpointIndex = 0;
        var nextBreakpoint = -1;

        var statementCounter = 0;

        var firstStepWithoutBreakpoint = (continueExecution ? true : false);

        var lastPC = 0;

        // execution is interrupted after a defined amount of time
        // to let JS proceed with other tasks from the queue
        var startTime = getTime();
        var endTime = 0;
        if (Constants.EmulatorIterationExecutionTime > 0) {
            endTime = startTime + Constants.EmulatorIterationExecutionTime * 1000;
        }
        var checkCounter = 0;

        while (true == this._running) {

            var pc = this.PC;

            if (null != breakpoints && !firstStepWithoutBreakpoint) {
                if (pc < lastPC) {
                    breakpointIndex = 0;
                }
                
                while (breakpointIndex < breakpoints.length &&
                       breakpoints[breakpointIndex].address.address < pc) {
                    breakpointIndex++;
                }
    
                var breakpoint = breakpoints[breakpointIndex];
                if (null != breakpoint && pc ==  breakpoint.address.address) {
                    if (null != breakpoint.logMessage) {
                        this.fireEvent('logpoint', breakpoint);
                    } else {
                        this.fireEvent('breakpoint', breakpoint);
                        result.reason = Constants.InterruptReason.BREAKPOINT;
                        break;
                    }
                }
            }

            lastPC = pc;

            //this.log();
            this.step();

            if (this.B) {
                this.fireEvent('break', pc);
                result.reason = Constants.InterruptReason.BREAK;
                break;
            }

            if (true == this.returnReached) {
                result.reason = Constants.InterruptReason.EXIT;
                break;
            }

            statementCounter++;
            if (Constants.EmulatorIterationMaxSteps > 0 &&
                statementCounter > Constants.EmulatorIterationMaxSteps) {
                result.reason = Constants.InterruptReason.YIELD;
                break;
            }

            checkCounter++;
            if (checkCounter >= 1000) {
                checkCounter = 0;
                if (endTime > 0) {
                    var currentTime = getTime();
                    if (currentTime >= endTime) {
                        //console.log("STATEMENTS BEFORE YIELD: " + statementCounter);
                        result.reason = Constants.InterruptReason.YIELD;
                        break;
                    }
                }
            }

            firstStepWithoutBreakpoint = false;
        }

        if (!this._running) {
            result.reason = Constants.InterruptReason.INTERRUPTED;
        }

        if (this._running && result.reason == Constants.InterruptReason.YIELD) {
            var thisInstance = this;
            if (Constants.EmulatorIterationSleepTime > 0) {
                setTimeout(function() { thisInstance.run(true, resolve); }, Constants.EmulatorIterationSleepTime);
            } else {
                process.nextTick(function() { thisInstance.run(true, resolve); });
            }
        } else if (resolve) {
            resolve(result);
        } else {
            return result;
        }
    }

    reset(startAddress) {

        super.reset();

        this._memory.fill(0);

        if (CPU6510) {
            // initialize some zeropage values
            this._memory[0x0] = 0xFF; // I/O port register
            this._memory[0x1] = 0xFF; // bankswitching
        } else if (null != startAddress) {
            // set reset vector to start address
            this.write(0xFFFD, (startAddress>>8) & 0xFF);
            this.write(0xFFFC, (startAddress & 0xFF));
        }

        this.S = 0xFF; // initialize stack pointer
        this.PC = startAddress;
        this.opcode = this.read( this.PC );
        this.cycles = 0;
    }

    read(addr){

        if (addr < 0 || addr > 0xFFFF) {
            throw new Error('Illegal memory read at address: ' + addr.toString(16).toLowerCase());
        }

        if (CPU6510) {

            /*
                Bit 0 - LORAM: Configures RAM or ROM at $A000-$BFFF (see bankswitching)
                Bit 1 - HIRAM: Configures RAM or ROM at $E000-$FFFF (see bankswitching)
                Bit 2 - CHAREN: Configures I/O or ROM at $D000-$DFFF (see bankswitching) 
            */

            var bankswitching = (this._memory[0x0001] & 0xFF);

            if ((bankswitching & 0x01) && addr >= 0xE000) {
                return this._roms.kernal[addr-0xE000] & 0xFF;
            } else if ((bankswitching & 0x02) && addr >= 0xD000) {
                return this._roms.char[addr-0xD000] & 0xFF;
            } else if ((bankswitching & 0x04) && addr >= 0xA000 && addr <= 0xBFFF) {
                return this._roms.basic[addr-0xA000] & 0xFF;
            }

        }

        return this._memory[addr] & 0xFF;
    }
     
    write(addr, value){
        if (addr < 0 || addr > 0xFFFF) {
            throw new Error('Illegal memory read at address: ' + addr.toString(16).toLowerCase());
        }
        this._memory[addr] = (value & 0xFF);
    }

    loadProgram(filename, autoOffsetCorrection, forcedStartAddress) {

        var prg = null;

        try {
            prg = fs.readFileSync(filename);
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("file " + filename + " does not exist");
            } else {
                throw("unable to read file '" + filename + "'");
            }
        }

        this._prg = prg;

        this.injectProgram(prg, autoOffsetCorrection, forcedStartAddress);
    }

    injectProgram(prg, autoOffsetCorrection, forcedStartAddress) {

        var addr = ((prg[1] << 8) | prg[0]);
        var data = prg.slice(2);
        var startAddr = addr;

        if (null != forcedStartAddress) {

            startAddr = forcedStartAddress;
            
        } else if (true == autoOffsetCorrection) {

            // skip if...
            // starts with valid next statement address
            //        and SYS basic comment
            //        and end of statement zero bytes
            //        !byte $0c,$08,$b5,$07,$9e,$20,$32,$30,$36,$32,$00,$00,$00
            //                              SYS       2   0   6   2

            var addrNextBasic = ((data[1] << 8) | data[0]);
            var maxHeaderBytes = 32;
            var delta = (addrNextBasic - addr);

            if (delta > 0 && delta < maxHeaderBytes) {

                // skip 2 address bytes of next basic token
                var ofs = 2;

                // scanning for "SYS" command 0x9e
                while (ofs < maxHeaderBytes) {
                    if (data[ofs] == 0x9e) break;
                    ofs++;
                }

                ofs++;

                // skip optional spaces
                while (data[ofs] == 0x20) {
                    ofs++;
                }

                // parse call address
                var addressCalc = 0;
                while (ofs < maxHeaderBytes) {
                    var c = data[ofs];
                    if (c < 0x30 || c > 0x39) break;
                    addressCalc = addressCalc * 10 + (data[ofs]-0x30);
                    ofs++;
                }
                
                startAddr = addressCalc;
            }
        }

        this.reset(startAddr||0);
        this._memory.set(data, addr);
        this.opcode = this.read( this.PC );
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = Emulator;
