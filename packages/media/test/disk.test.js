//
// Disk test
//

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Disk, File } = require('../disk');
const { Device } = require('../device');
const { DeviceIO } = require('../device_io');

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

function get_num_sectors_per_track(track) {
    let s = 0;
    if (track >= 31) { s = 17; }
    else if (track >= 25) { s = 18; }
    else if (track >= 18) { s = 19; }
    else { s = 21; }
    return s;
}

describe('disk', () => {
    test("disk_basics", () => {
        for (let track=1; track<41; track++) {
            expect(Disk.getNumSectorsPerTrack(track)).toBe(get_num_sectors_per_track(track));
        }

        const TRACK_POSITION = [
            0x00000, 0x01500, 0x02A00, 0x03F00, 0x05400, 0x06900, 0x07E00, 0x09300,
            0x0A800, 0x0BD00, 0x0D200, 0x0E700, 0x0FC00, 0x11100, 0x12600, 0x13B00,
            0x15000, 0x16500, 0x17800, 0x18B00, 0x19E00, 0x1B100, 0x1C400, 0x1D700,
            0x1EA00, 0x1FC00, 0x20E00, 0x22000, 0x23200, 0x24400, 0x25600, 0x26700,
            0x27800, 0x28900, 0x29A00, 0x2AB00, 0x2BC00, 0x2CD00, 0x2DE00, 0x2EF00
        ];

        for (let track=1; track<41; track++) {
            const ofs = Disk.getTrackOffset(track);
            const tab = TRACK_POSITION[track-1];
            expect(ofs).toBe(tab);
        }
    });

    test("disk_empty", () => {

        const disk = new Disk();
        disk.create("EmptyDisk", "ABCDE", 35);

        expect(disk.deviceTape).toBe(Device.DEVICE_TYPE_DISK);

        expect(disk.name).toBe("EmptyDisk");
        expect(disk.id).toBe("ABCDE");
        expect(disk.numTracks).toBe(35);
        expect(disk.numTracks).toBe(35);
        expect(disk.type).toBe(Disk.TYPE_35);
        expect(disk.size).toBe(Disk.TYPE_35); // size is encoded in type ID

        const bam = disk.getBam();
        bam.init(disk.numTracks);
        const freeSectors = bam.getFreeSectors(disk.numTracks);
        expect(freeSectors).toBe(683);
        const availableFreeSectors = freeSectors - Disk.RESERVED_SECTORS;
        expect(availableFreeSectors).toBe(664);

    });

    test("disk_35", () => {
        const _device_io = new DeviceIO();
        const disk = new Disk(null, _device_io);
        disk.open("./test/data/disk_35.d64");
        expect(disk.name).toBe("TEST35");
        expect(disk.format).toBe("A");
        expect(disk.version).toBe("2");
        expect(disk.size).toBe(Disk.TYPE_35);
        expect(disk.numTracks).toBe(35);
        expect(disk.numSectors).toBe(683);
        expect(disk.doubleSided).toBe(false);
        expect(disk.directory.length).toBe(1);
        const file = disk.directory[0];
        expect(file.name).toBe("C64HACKS");
        expect(file.fsName).toBe("C64HACKS");
        expect(file.size).toBe(33);
        expect(file.flags).toBe(File.FLAG_CLOSED);
        expect(file.type).toBe(File.TYPE_PRG);
        disk.close();
    });

    test("disk_40", () => {
        const _device_io = new DeviceIO();
        const disk = new Disk(null, _device_io);
        disk.open("./test/data/disk_40.d64");
        expect(disk.name).toBe("TEST40");
        expect(disk.format).toBe("A");
        expect(disk.version).toBe("2");
        expect(disk.size).toBe(Disk.TYPE_40);
        expect(disk.numTracks).toBe(40);
        expect(disk.numSectors).toBe(768);
        expect(disk.doubleSided).toBe(false);
        expect(disk.directory.length).toBe(1);
        const file = disk.directory[0];
        expect(file.name).toBe("C64HACKS");
        expect(file.fsName).toBe("C64HACKS");
        expect(file.size).toBe(33);
        expect(file.flags).toBe(File.FLAG_CLOSED);
        expect(file.type).toBe(File.TYPE_PRG);
        disk.close();
    });

    test("disk_35_err", () => {
        const _device_io = new DeviceIO();
        const disk = new Disk(null, _device_io);
        disk.open("./test/data/disk_35_err.d64");
        expect(disk.name).toBe("TEST35ERR");
        expect(disk.format).toBe("A");
        expect(disk.version).toBe("2");
        expect(disk.size).toBe(Disk.TYPE_35_ERR);
        expect(disk.numTracks).toBe(35);
        expect(disk.numSectors).toBe(683);
        expect(disk.doubleSided).toBe(false);
        expect(disk.directory.length).toBe(1);
        const file = disk.directory[0];
        expect(file.name).toBe("C64HACKS");
        expect(file.fsName).toBe("C64HACKS");
        expect(file.size).toBe(33);
        expect(file.flags).toBe(File.FLAG_CLOSED);
        expect(file.type).toBe(File.TYPE_PRG);
        disk.close();
    });

    test("disk_40_err", () => {
        const _device_io = new DeviceIO();
        const disk = new Disk(null, _device_io);
        disk.open("./test/data/disk_40_err.d64");
        expect(disk.name).toBe("TEST40ERR");
        expect(disk.format).toBe("A");
        expect(disk.version).toBe("2");
        expect(disk.size).toBe(Disk.TYPE_40_ERR);
        expect(disk.numTracks).toBe(40);
        expect(disk.numSectors).toBe(768);
        expect(disk.doubleSided).toBe(false);
        expect(disk.directory.length).toBe(1);
        const file = disk.directory[0];
        expect(file.name).toBe("C64HACKS");
        expect(file.fsName).toBe("C64HACKS");
        expect(file.size).toBe(33);
        expect(file.flags).toBe(File.FLAG_CLOSED);
        expect(file.type).toBe(File.TYPE_PRG);
        disk.close();
    });

});  // describe

/*

function run_tests2() {
    const disk = new Disk();

    //disk.create("MYDISK", "XY");
    //disk.open("test/newfile.d64");
    disk.open("test/data/disk1.d64");

    //disk.storeFile("test/c64hacks.prg", "C64HACKS", File.TYPE_PRG);
    //disk.storeFile("test/test.txt", "TEST.TXT", File.TYPE_USR);
    disk.showStats();

    //disk.exportFile("C64HACKS", "test/c64hacks_exp.prg");
    //disk.exportFile("TEST.TXT", "test/text_exp.txt");

    //disk.exportFile("CALIFORNIA GAMES", "test/test.prg");

    //disk.write("test/newfile.d64");
}
*/
