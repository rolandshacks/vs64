//
// Standalone runner
//

const path = require('path');
const fs = require('fs');

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
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger, LogLevel } = require('utilities/logger');
const { DebugInfo, KickAssemblerInfo } = require('debugger/debug_info');

const logger = new Logger("DebugRun");

/*

TRYING TO REPRODUCE:

system.c

poke(0xdc0d, 0x7f);  ====>

void poke(const uint16_t poke_address, const uint8_t value) {
====>    *(address_t)(poke_address) = value;
}

PC: $8DA (2266)

-------------

csym	id=21,name="poke_address",scope=14,type=0,sc=auto,offs=1

scope	id=14,name="_poke",mod=3,type=scope,size=26,parent=13,sym=109,span=367
span	id=367,seg=0,start=151,size=26		==> CODE (ro)

scope	id=13,name="",mod=3,size=592,span=353+654
span	id=353,seg=3,start=1,size=2,type=3 ==> DATA (rw)
span	id=654,seg=0,start=151,size=592    ==> CODE (ro)

seg	id=0,name="CODE",start=0x000840,size=0x0B24,addrsize=absolute,type=ro,oname="d:\Work\c64\ctest\build\ctest.prg",ooffs=65
seg	id=3,name="DATA",start=0x001474,size=0x0B76,addrsize=absolute,type=rw,oname="d:\Work\c64\ctest\build\ctest.prg",ooffs=3189

----------

*/

function processDebugFile() {

    const debugInfoPath = "data/test.dbg";
    const debugInfo = new DebugInfo(debugInfoPath);

    const PC = 0x8da; // 2266

    const addressInfo = debugInfo.getAddressInfo(PC);

    return;

}

function processReportFile() {

    const debugInfoPath = "data/test.report";
    const debugInfo = new DebugInfo(debugInfoPath);

    const PC = 0x8da; // 2266

    const addressInfo = debugInfo.getAddressInfo(PC);

    return;

}

function processKickDebugInfo() {

    const project = {
        toolkit: "kick"
    };

    const debugInfoPath = "data/kickdebug.dbg";
    const debugInfo = new DebugInfo(debugInfoPath, project);

    const PC = 0x8da; // 2266

    const addressInfo = debugInfo.getAddressInfo(PC);

    return;

}

function processKickAsmInfo() {

    const debugInfoPath = "data/kickdebug.info";
    const debugInfo = KickAssemblerInfo.read(debugInfoPath);

    return;

}

async function main() {
    Logger.setGlobalLevel(LogLevel.Trace);

    processKickAsmInfo();
    //processKickDebugInfo();
}

main();
