//
// Denise Debugger Connector
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
const { DebugProcess, DebugInterface } = require('debugger/debug');

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//

//-----------------------------------------------------------------------------------------------//
// Denise Connector
//-----------------------------------------------------------------------------------------------//

class DeniseConnector extends DebugInterface {
    constructor(session) {
        super(session);
    }
}

//-----------------------------------------------------------------------------------------------//
// Denise Process
//-----------------------------------------------------------------------------------------------//

class DeniseProcess extends DebugProcess {
    constructor(sessionInfo) {
        super(sessionInfo);
    }

    async spawn(executable, params, binary, options) {

        const args = [];

        if (binary) {
            args.push("-autostart-prg");
            args.push("1");
            args.push(binary);
        }

        if (params) {
            args.push(...Utils.splitQuotedString(params));
        }

        await super.spawn_exec(executable, args, options);

    }

    static createDebugInterface(session) {
        return new DeniseConnector(session);
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DeniseProcess: DeniseProcess
}
