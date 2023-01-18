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
const { DebugRunner, DebugInterruptReason, DebugStepType, MemoryType } = require('debugger/debug');
const CPU6502 = require('./cpu');

const ENABLE_6510_MODE = true;

function getTime() {
    const t = process.hrtime();
    return t[0]*1000000 + ((t[1]/1000)|0);
}

//-----------------------------------------------------------------------------------------------//
// Emulator Constants
//-----------------------------------------------------------------------------------------------//

const EmulatorConstants = {
    EmulatorIterationMaxSteps: 0,       // max steps per iteration (0: no limit)
    EmulatorIterationExecutionTime: 10, // milliseconds
    EmulatorIterationSleepTime: 10,     // milliseconds
};

//-----------------------------------------------------------------------------------------------//
// Emulator
//-----------------------------------------------------------------------------------------------//

class Emulator extends DebugRunner {

    constructor(session) {

        super();

        const instance = this;
        this._session = session;

        this._memory = new Uint8Array(65536);

        this._cpu = new CPU6502(
            instance.readSync.bind(instance),
            instance.writeSync.bind(instance)
        );

        if (ENABLE_6510_MODE) {
            this._roms = {
                kernal: require('./roms/kernal'),
                basic: require('./roms/basic'),
                char: require('./roms/char'),
                d1541: require('./roms/1541')
            };

            // patch kernal ROM
            this._roms.kernal[0xffd2 - 0xe000] = 0x60;
        }

        this.reset();

    }

    getCpuState() {
        return this._cpu.getState();
    }

    async start() {
        super.start();
        this.run(null, false);
    }

    async resume() {
        super.resume();
        this.run(null, true);
    }

    async do_step(debugStepType) {

        /*
        if (debugStepType == DebugStepType.STEP_IN) {
            this._cpu.step();
            this.fireEvent('stopped', DebugInterruptReason.BREAKPOINT);
            return;
        }
        */

        const cpu = this._cpu;
        const session = this._session;
        const debugInfo = session._debugInfo;

        const runFlags = {
            debugStepType: debugStepType,
            stopAtStackDepth: null,
            stackDepthMax: null,
            stepStartAddress: debugInfo.getAddressInfo(cpu.PC)
        };

        const callStackDepth = cpu._callStack.length;

        if (debugStepType == DebugStepType.STEP_OVER) {
            if (debugInfo) {
                //if (cpu._opcode == 0x20) { // JSR
                    runFlags.stopAtStackDepth = callStackDepth;
                //}
            }

        } else if (debugStepType == DebugStepType.STEP_OUT) {
            runFlags.stopAtStackDepth = (callStackDepth > 0) ? callStackDepth - 1 : null;
        }

        this.run(runFlags, true);
    }

    run(runFlags, continueExecution) {
        let thisInstance = this;
        setTimeout(() => { thisInstance.runLoop(runFlags, continueExecution); }, 0);
        this.fireEvent('started');
    }

    runLoop(runFlags, continueExecution) {

        const cpu = this._cpu;
        const session = this._session;
        const debugInfo = session._debugInfo;
        const breakpoints = session._breakpoints;

        let exitReason = DebugInterruptReason.UNKNOWN;

        let breakpointIndex = 0;
        let statementCounter = 0;

        let skipNextBreakpoint = (continueExecution ? true : false);

        let lastPC = 0;
        let lastOpcode = 0;

        // execution is interrupted after a defined amount of time
        // to let JS proceed with other tasks from the queue
        let startTime = getTime();
        let endTime = 0;
        if (EmulatorConstants.EmulatorIterationExecutionTime > 0) {
            endTime = startTime + EmulatorConstants.EmulatorIterationExecutionTime * 1000;
        }
        let checkCounter = 0;
        let stopRun = false;

        while (true == this._running) {

            let pc = cpu.PC;
            let opcode = cpu._opcode;

            if (!skipNextBreakpoint) {
                if (!breakpoints.empty()) {
                    if (pc < lastPC) {
                        breakpointIndex = 0;
                    }

                    breakpointIndex = breakpoints.nextByAddress(pc, breakpointIndex);

                    let breakpoint = breakpoints.at(breakpointIndex);
                    if (null != breakpoint && pc ==  breakpoint.address) {
                        if (null != breakpoint.logMessage) {
                            this.fireEvent('logpoint', breakpoint);
                        } else {
                            this.fireEvent('breakpoint', breakpoint);
                            exitReason = DebugInterruptReason.BREAKPOINT;
                            break;
                        }
                    }
                }

                if (runFlags) {
                    if (runFlags.stopAtAddress && pc == runFlags.stopAtAddress) {
                        exitReason = DebugInterruptReason.BREAKPOINT;
                        break;
                    }
                }
            }

            lastPC = pc;
            lastOpcode = opcode;

            cpu.step();

            if (runFlags) {
                if (!runFlags.stackDepthMax || cpu._callStack.length > runFlags.stackDepthMax) {
                    runFlags.stackDepthMax = cpu._callStack.length;
                }

                if (runFlags.debugStepType == DebugStepType.STEP_OUT) {
                    if (runFlags.stopAtStackDepth != null) {
                        if (cpu._callStack.length == runFlags.stopAtStackDepth) {
                            stopRun = true;
                        }
                    }
                } else if (runFlags.debugStepType == DebugStepType.STEP_OVER) {
                    if (runFlags.stopAtAddress == null) {
                        if (runFlags.stopAtStackDepth != null) {

                            if (cpu._callStack.length <= runFlags.stopAtStackDepth) {

                                const stepStartAddress = runFlags.stepStartAddress;
                                const addressInfo = debugInfo.getAddressInfo(cpu.PC);

                                if (stepStartAddress && addressInfo) {
                                    if (cpu.PC < stepStartAddress.address || cpu.PC > stepStartAddress.address_end) {
                                        stopRun = true;
                                    }
                                } else if (runFlags.stackDepthMax > runFlags.stopAtStackDepth) {
                                    stopRun = true;
                                }
                            }

                        } else {
                            stopRun = true;
                        }
                    }
                } else if (runFlags.debugStepType == DebugStepType.STEP_IN) {
                    const stepStartAddress = runFlags.stepStartAddress;
                    if (stepStartAddress) {
                        if (cpu.PC < stepStartAddress.address || cpu.PC > stepStartAddress.address_end) {
                            stopRun = true;
                        } else {
                            stopRun = false; // continue as there just was an RTS to the same code line
                        }
                    } else {
                        stopRun = true;
                    }
                }
            }

            if (stopRun) {
                const addressInfo = debugInfo.getAddressInfo(cpu.PC);
                if (addressInfo != null) {
                    exitReason = DebugInterruptReason.BREAKPOINT;
                    break;
                }
            }

            if (cpu.B) {
                this.fireEvent('break', pc);
                exitReason = DebugInterruptReason.BREAK;
                break;
            }

            if (true == cpu._returnReached) {
                exitReason = DebugInterruptReason.EXIT;
                break;
            }

            statementCounter++;
            if (EmulatorConstants.EmulatorIterationMaxSteps > 0 &&
                statementCounter > EmulatorConstants.EmulatorIterationMaxSteps) {
                    exitReason = DebugInterruptReason.YIELD;
                break;
            }

            checkCounter++;
            if (checkCounter >= 1000) {
                checkCounter = 0;
                if (endTime > 0) {
                    let currentTime = getTime();
                    if (currentTime >= endTime) {
                        exitReason = DebugInterruptReason.YIELD;
                        break;
                    }
                }
            }

            skipNextBreakpoint = false;
        }

        if (!this._running) {
            exitReason = DebugInterruptReason.INTERRUPTED;
        }

        if (this._running && exitReason == DebugInterruptReason.YIELD) {
            let thisInstance = this;
            if (EmulatorConstants.EmulatorIterationSleepTime > 0) {
                setTimeout(
                    () => { thisInstance.runLoop(runFlags); },
                    EmulatorConstants.EmulatorIterationSleepTime
                );
            } else {
                process.nextTick(() => { thisInstance.runLoop(runFlags); });
            }
        } else {
            this.fireEvent('stopped', exitReason);
        }
    }

    async pause() {
        super.pause();
    }

    async stop() {
        super.stop();
    }

    async setBreakpoints(breakpoints) {
    }

    reset(startAddress) {

        const cpu = this._cpu;

        cpu.reset();

        this._memory.fill(0);

        if (ENABLE_6510_MODE) {
            // initialize some zeropage values
            this._memory[0x0] = 0xFF; // I/O port register
            this._memory[0x1] = 0xFF; // bankswitching
        } else if (null != startAddress) {
            // set reset vector to start address
            this.writeSync(0xFFFD, (startAddress>>8) & 0xFF);
            this.writeSync(0xFFFC, (startAddress & 0xFF));
        }

        cpu.S = 0xFF; // initialize stack pointer
        if (startAddress) {
            cpu.PC = startAddress;
        }

        cpu._opcode = this.readSync( cpu.PC );
        cpu.resetCycleCounter();
    }

    readSync(addr) {
        if (addr < 0 || addr > 0xFFFF) {
            throw new Error('Illegal memory read at address: ' + addr.toString(16).toLowerCase());
        }

        if (ENABLE_6510_MODE) {

            /*
                Bit 0 - LORAM: Configures RAM or ROM at $A000-$BFFF (see bankswitching)
                Bit 1 - HIRAM: Configures RAM or ROM at $E000-$FFFF (see bankswitching)
                Bit 2 - CHAREN: Configures I/O or ROM at $D000-$DFFF (see bankswitching)
            */

            let bankswitching = (this._memory[0x0001] & 0xFF);

            if ((bankswitching & 0x02) && addr >= 0xE000) {
                return this._roms.kernal[addr-0xE000] & 0xFF;
            } else if (0 == (bankswitching & 0x04) && addr >= 0xD000) {
                return this._roms.char[addr-0xD000] & 0xFF;
            } else if ((bankswitching & 0x01) && addr >= 0xA000 && addr <= 0xBFFF) {
                return this._roms.basic[addr-0xA000] & 0xFF;
            }

        }

        return this._memory[addr] & 0xFF;
    }

    readMemory(startAddress, endAddress, memoryType) {

        const ramOnly = (memoryType == MemoryType.Ram);

        if (ramOnly || !ENABLE_6510_MODE || endAddress < 0xa000) {
            return this._memory.slice(startAddress, endAddress+1);
        }

        const sz = endAddress + 1 - startAddress;
        if (sz < 1) return null;

        const mem = new Uint8Array(sz);
        for (let i=0; i<sz; i++) {
            mem[i] = this.readSync(startAddress+i);
        }

        return mem;
    }

    async read(addr, size) {
        let val = this.readSync(addr);
        if (size > 1) val += (this.readSync(addr+1) << 8);
        return val;
    }

    writeSync(addr, value) {
        if (addr < 0 || addr > 0xFFFF) {
            throw new Error('Illegal memory read at address: ' + addr.toString(16).toLowerCase());
        }
        this._memory[addr] = (value & 0xFF);
    }

    async write(addr, value) {
        this.writeSync(addr, value);
    }

    async loadProgram(filename, autoOffsetCorrection, forcedStartAddress) {

        let prg = null;

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

        const cpu = this._cpu;

        let addr = ((prg[1] << 8) | prg[0]);
        let data = prg.slice(2);
        let startAddr = addr;

        if (null != forcedStartAddress) {

            startAddr = forcedStartAddress;

        } else if (true == autoOffsetCorrection) {

            // skip if...
            // starts with valid next statement address
            //        and SYS basic comment
            //        and end of statement zero bytes
            //        !byte $0c,$08,$b5,$07,$9e,$20,$32,$30,$36,$32,$00,$00,$00
            //                              SYS       2   0   6   2

            let addrNextBasic = ((data[1] << 8) | data[0]);
            let maxHeaderBytes = 32;
            let delta = (addrNextBasic - addr);

            if (delta > 0 && delta < maxHeaderBytes) {

                // skip 2 address bytes of next basic token
                let ofs = 2;

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
                let addressCalc = 0;
                while (ofs < maxHeaderBytes) {
                    let c = data[ofs];
                    if (c < 0x30 || c > 0x39) break;
                    addressCalc = addressCalc * 10 + (data[ofs]-0x30);
                    ofs++;
                }

                startAddr = addressCalc;
            }
        }

        this.reset(startAddr||0);
        this._memory.set(data, addr);
        cpu._opcode = this.readSync( cpu.PC );
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Emulator: Emulator,
    DebugInterruptReason: DebugInterruptReason
}
