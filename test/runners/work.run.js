//
// Standalone runner
//

const path = require('path');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../../src");
global.BIND = function (_module) {
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger, LogLevel } = require('utilities/logger');

function decodeBasicFloat(mem, ofs) {
    let floatValue = null;

    const e = mem[ofs];

    if (e == 0x0) return 0.0;

    const m4 = mem[ofs+1];
    const m3 = mem[ofs+2];
    const m2 = mem[ofs+3];
    const m1 = mem[ofs+4];

    let mantissaBits = ((m4 | 0x80) << 24) + (m3 << 16) + (m2 << 8) + m1;

    const exponent = e - 129; // excess-128 representation
    const sign = (m4 >= 128) ? -1.0 : 1.0

    let divisor = 0x80000000;
    let mantissa = 0.0;
    while (divisor != 0x0 && mantissaBits != 0x0) {
        if ((mantissaBits & 0x1) != 0x0) {
            mantissa += 1.0 / divisor;
        }
        mantissaBits >>>= 1;
        divisor >>>= 1;
    }

    floatValue = (sign * mantissa * Math.pow(2, exponent)).toString();

    return floatValue;
}

function runFunction() {
    const mem = [ 135, 118, 230, 102, 102 ]; // -4.550000011920929
    const mem2 = [ 135, 70, 0, 0, 0 ]; // -29

    let value = 0.0;
    let value2 = 0.0;

    var startTime = performance.now();

    for (let i=0; i<1000; i++) {
        value = decodeBasicFloat(mem, 0);
        value2 = decodeBasicFloat(mem2, 0);
    }

    var endTime = performance.now();

    console.log("value: " + value.toString());
    console.log("value: " + value2.toString());

    console.log(`Execution time: ${endTime - startTime} milliseconds`);

}

function main() {
    Logger.setGlobalLevel(LogLevel.Trace);
    runFunction();
}

main();
