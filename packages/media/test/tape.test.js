//
// Tape test
//

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Tape } = require('../tape');
const { Device } = require('../device');
const { DeviceIO } = require('../device_io');
const { File } = require('../filesystem');

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('tape', () => {
    test("tape_basics", () => {

    });

    test("tape_empty", () => {

        const tape = new Tape();
        expect(tape.deviceType).toBe(Device.DEVICE_TYPE_TAPE);
        expect(tape.name).toBe("");
        expect(tape.size).toBe(0);
        expect(tape.version).toBe("0");
        expect(tape.directory.length).toBe(0);

    });

    test("tape_1", () => {
        const _device_io = new DeviceIO();
        const tape = new Tape(null, _device_io);
        tape.open("./test/data/tape.t64");
        expect(tape.name).toBe("DEMO TAPE");
        expect(tape.version).toBe("0");
        expect(tape.size).toBe(28159);
        expect(tape.directory.length).toBe(1);

        const file = tape.directory[0];
        expect(file.name).toBe("FILE");
        expect(file.fsName).toBe("FILE");
        expect(file.size).toBe(48069);
        expect(file.flags).toBe(File.FLAG_CLOSED);
        expect(file.type).toBe(File.TYPE_PRG);

        tape.close();
    });

});  // describe
