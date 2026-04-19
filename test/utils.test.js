//
// Utils test
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
const { Utils } = require('utilities/utils');

//-----------------------------------------------------------------------------------------------//
// Helpers
//-----------------------------------------------------------------------------------------------//

function toUint8Array(str) {

    const mem = new Uint8Array(str.length);

    let i=0;
    for (const c of str) {
        mem[i++] = c.charCodeAt(0);
    }

    return mem;
}

function strToBase64(str) {
    return toBase64(toUint8Array(str));
}

function toBase64(mem) {
    return Utils.toBase64(mem);
}


//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('utils', () => {

test("base64", () => {

    const mem = new Uint8Array(16);
    for (let i=0; i<mem.length; i++) {
        mem[i] = ((i*19) & 0xff);
    }

    expect(toBase64(mem)).toBe("ABMmOUxfcoWYq77R5PcKHQ==");

    expect(strToBase64("")).toBe("");
    expect(strToBase64("f")).toBe("Zg==");
    expect(strToBase64("fo")).toBe("Zm8=");
    expect(strToBase64("foo")).toBe("Zm9v");
    expect(strToBase64("foob")).toBe("Zm9vYg==");
    expect(strToBase64("fooba")).toBe("Zm9vYmE=");
    expect(strToBase64("foobar")).toBe("Zm9vYmFy");

});

test("formatter", () => {

    const data = [ 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88 ];
    const buffer = Buffer.from(data);

    {
        const s = Utils.formatMemory(buffer, 0, 4, null, " ");
        expect(s).toBe("11 22 33 44");
    }

    {
        const s = Utils.formatMemory(buffer, 0, 4, 1, " ");
        expect(s).toBe("11 22 33 44");
    }

    {
        const s = Utils.formatMemory(buffer, 0, 6, 2, " ");
        expect(s).toBe("1122 3344 5566");
    }

    {
        const s = Utils.formatMemory(buffer, 0, 8, 3, " ");
        expect(s).toBe("112233 445566");
    }

    {
        const s = Utils.formatMemory(buffer, 0, 8, 4, " ");
        expect(s).toBe("11223344 55667788");
    }

}); // test

});  // describe
