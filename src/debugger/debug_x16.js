//
// X16 Debugger Connector
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Utils } = require('utilities/utils');
const { Logger } = require('utilities/logger');
const { DebugProcess, DebugInterface } = require('debugger/debug');

const logger = new Logger("X16Debug");

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//

//-----------------------------------------------------------------------------------------------//
// X16 Connector
//-----------------------------------------------------------------------------------------------//

class X16Connector extends DebugInterface {
    constructor(session) {
        super(session);
    }
}

//-----------------------------------------------------------------------------------------------//
// X16 Process
//-----------------------------------------------------------------------------------------------//

class X16Process extends DebugProcess {
    constructor() {
        super();
    }

    async spawn(executable, params, binary, options) {

        const args = [];

        if (binary) {
            args.push("-prg");
            args.push(binary);
            args.push("-run");
        }

        if (params) {
            args.push(...Utils.splitQuotedString(params));
        }

        await super.spawn_exec(executable, args, options);

    }

    createDebugInterface(session) {
        return new X16Connector(session);
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    X16Process: X16Process
}
