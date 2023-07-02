//
// Arguments test
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
const { Arguments } = require('utilities/args');

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('args', () => {
    test("args_basics", () => {

        const args = Arguments.fromString("  aaa  \t   bbb \t \n --flag  \n \r\n --option   ooo     \t --flag2  --option2   vvvvv     --option3   www ccccc   ");

        expect(args.argv.length).toBe(11);
        expect(args.argc).toBe(11);
        expect(args.values.length).toBe(3);
        expect(args.flags.size).toBe(2);
        expect(args.options.size).toBe(3);

        expect(args.toString()).toBe("aaa bbb --flag --option ooo --flag2 --option2 vvvvv --option3 www ccccc");

        expect(args.getValue(-1)).toBe(null);
        expect(args.getValue(0)).toBe("aaa");
        expect(args.getValue(1)).toBe("bbb");
        expect(args.getValue(2)).toBe("ccccc");
        expect(args.getValue(3)).toBe(null);
        expect(args.getValue(3, "defaultValue")).toBe("defaultValue");

        expect(args.getFlag("flag")).toBe(true);
        expect(args.getFlag("FlAg")).toBe(true);
        expect(args.getFlag("noflag")).toBe(false);
        expect(args.getFlag("flag2")).toBe(true);

        expect(args.hasOption("option")).toBe(true);
        expect(args.hasOption("oPtIoN")).toBe(true);
        expect(args.hasOption("nooption")).toBe(false);
        expect(args.getOption("option")).toBe("ooo");
        expect(args.getOption("nooption")).toBe(null);
        expect(args.getOption("nooption", "defaultValue")).toBe("defaultValue");

        expect(args.hasOption("option2")).toBe(true);
        expect(args.getOption("option2")).toBe("vvvvv");
        expect(args.hasOption("option3")).toBe(true);
        expect(args.getOption("option3")).toBe("www");

    }); // test

    test("args_builder", () => {

        const args = new Arguments();

        expect(args.argv.length).toBe(0);
        expect(args.argc).toBe(0);

        const str = args.toString();
        expect(str).toBe("");

        args.setOption("option", "value");

        expect(args.hasOption("option")).toBe(true);
        expect(args.getOption("option")).toBe("value");

        expect(args.toString()).toBe("--option value");

    });

});  // describe
