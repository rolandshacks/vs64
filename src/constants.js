//
// Constants
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//

BIND(module);

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//

var Constants = {
    DebugLoggingEnabled: true,
    OutputDirectory: ".cache",
    AssemblerLanguageId: "asm",
    AlwaysShowOutputChannel: false,
    ProgramAddressCorrection: true,
    EmulatorIterationMaxSteps: 0, // max steps per iteration (0: no limit)
    EmulatorIterationExecutionTime: 10, // milliseconds
    EmulatorIterationSleepTime: 5,   // milliseconds
    InterruptReason: {
        UNKNOWN: 0,
        EXIT: 1,
        YIELD: 2,
        INTERRUPTED: 3,
        BREAKPOINT: 4,
        BREAK: 5
    }
};

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = Constants;
