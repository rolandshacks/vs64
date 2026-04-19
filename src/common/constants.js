//
// Constants
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//

const Constants = {
    DefaultOutputFormat: "prg",
    ViceBinaryMonitorPort: 6502,                    // connectino port to VICE binary monitor interface
    ViceConnectTimeoutSec: 10,                      // connection timeout (in seconds) for VICE binary monitor
    ProjectConfigFile: "project-config.json",       // name of project config file
    SupportedLanguageIds: [ "asm", "acme", "kickass", "s", "c", "cpp", "h", "hpp", "cc", "hh", "bas", "res", "raw", "spm", "properties" ],
    AssemblerLanguageIds: [ "asm", "acme", "kickass" ],
    BasicLanguageId: "bas",
    DebuggerType6502: "6502",
    DebuggerTypeVice: "vice",
    DebuggerTypeX16: "x16",
    CppStandard: "c++20",
    AlwaysShowOutputChannel: false,
    ProgramAddressCorrection: true,
    RemapLanguageIds: true,                         // remap grammars based on project settings
    AutoBuildDelayMs: 1250,
    ResourceFileFilter: "|res|raw|spm|spd|ctm|sid|wav|png|koa|kla|",
    CppFileFilter: "|c|cpp|cc|",
    CppOnlyFileFilter: "|cpp|cc|",
    COnlyFileFilter: "|c|",
    AsmFileFilter: "|s|asm|a|",
    BasicFileFilter: "|bas|",
    ObjFileFilter: "|o|obj|",
    BinaryFileFilter: "|prg|bin|dat|res|raw|spm|spd|ctm|sid|wav|png|jpg|koa|kla|",
    BasicInterpreterLoopRoutine: 0xa7e4,            // default adress of vector $308-309
    BasicInterpreterBreakRoutine: 0xa84b,           // when END is called
    BasicInterpreterErrorRoutine: 0xa437,
    BasicInterpreterListRoutine: 0xa69c,            // when LIST is called
    TSBInterpreterLoopRoutine: 0x80e8,
    TSBInterpreterErrorRoutine: 0x839c,             // TSC modified BASIC vector at $300/$301
    BasicCharset1: "big/graphics",                  // used in settings
    BasicCharset2: "small/big",                     // used in settings
    BasicStartC64: 0x0801,                          // BASIC start address of C64
    BasicStartC128: 0x1c01                          // BASIC start address of C128
};

const AnsiColors = {
    Reset: 0,
    Bold: 1,
    Underline: 4,
    Reverse: 7,

    Foreground: 0,
    Background: 10,

    Black: 30,
    Red: 31,
    Green: 32,
    Yellow: 33,
    Blue: 34,
    Magenta: 35,
    Cyan: 36,
    LightGrey: 37,

    DarkGrey: 90,
    LightRed: 91,
    LightGreen: 92,
    LightYellow: 93,
    LightBlue: 94,
    LightMagenta: 95,
    LightCyan: 96,
    White: 97
};

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Constants: Constants,
    AnsiColors: AnsiColors
};
