//
// Ninja build tool support test
//

const path = require('path');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../src");
global.BIND = function(_module) {
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger, LogLevel } = require('utilities/logger');
const { Ninja, NinjaArgs } = require('project/ninja');

//-----------------------------------------------------------------------------------------------//
// Helpers
//-----------------------------------------------------------------------------------------------//

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('ninja', () => {

    beforeAll(() => {
        Logger.pushGlobalLevel(LogLevel.Error);
    });

    afterAll(() => {
        Logger.popGlobalLevel();
    });

    test("ninja_escaping", () => {

        expect(Ninja.escape("aaa")).toBe("aaa");
        expect(Ninja.escape("aaa bbb ccc")).toBe("aaa$ bbb$ ccc");
        expect(Ninja.escape("aaa:bbb:ccc")).toBe("aaa$:bbb$:ccc");
        expect(Ninja.escape("aaa$bbb$ccc")).toBe("aaa$$bbb$$ccc");
        expect(Ninja.escape("aaa :$ :$bbb")).toBe("aaa$ $:$$$ $:$$bbb");

    });

    test("ninja_keyvalue", () => {

        expect(Ninja.keyValue("aaa", "bbb")).toBe("aaa = bbb");
        expect(Ninja.keyValue("aaa", "bbb ccc")).toBe("aaa = bbb$ ccc");

    });

    /*
    test("ninja_keyvaluelist", () => {

        expect(Ninja.keyValueList("aaa", [ "bb bb", "cc cc", "dd dd" ])).toBe("aaa = \"bb$ bb\" \"cc$ cc\" \"dd$ dd\"");

    });
    */

    test("ninja_args", () => {

        const args = new NinjaArgs();
        args.add("aa aa");
        args.add(["bb bb", "ccc"]);
        args.add("dd dd", "eee");

        const joined = args.join();
        expect(joined).toBe("\"aa$ aa\" \"bb$ bb\" ccc \"dd$ dd\" eee");

    });

});  // describe
