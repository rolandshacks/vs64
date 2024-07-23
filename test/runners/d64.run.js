//
// D64 file system
//

const path = require('path');
const fs = require('fs');
const assert = require('assert');

//-----------------------------------------------------------------------------------------------//
// Init module and lookup path
//-----------------------------------------------------------------------------------------------//

global._sourcebase = path.resolve(__dirname, "../../src");
global.BIND = function(_module) {
    _module.paths.push(global._sourcebase);
};

// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Logger, LogLevel } = require('utilities/logger');
const { Disk, File, Position } = require('disk/disk');

function testTrackIterator() {
    const numTracks = 35;
    let track = 17; // start track

    const trackList = [ 17, 19, 16, 20, 15, 21, 14, 22, 13, 23, 12, 24, 11, 25, 10, 26, 9, 27, 8, 28, 7, 29, 6, 30, 5, 31, 4, 32, 3, 33, 2, 34, 1, 35 ];
    let computedList = [];

    while ( track >= 1 && track <= numTracks) {
        computedList.push(track);
        track = Position.nextTrack(track, numTracks);
    }

    assert(trackList.length == computedList.length);

}


function run() {

    testTrackIterator();

    if (!fs.existsSync("temp")) {
        fs.mkdirSync("temp");
    }

    const disk = new Disk();

    disk.create("MYDISK", "XY");
    //disk.open("test/newfile.d64");
    //disk.open("data/disk_35.d64");

    disk.showStats();

    disk.storeFile("data/small.txt", "SMALL.TXT");
    disk.storeFile("data/test.prg", "TEST.PRG");
    disk.storeFile("data/wave_hello.wav", "WAVE.WAV");
    //disk.deleteFile("TEST.TXT");

    disk.showStats();

    //disk.exportFile("C64HACKS", "test/c64hacks_exp.prg");
    //disk.exportFile("TEST.TXT", "test/text_exp.txt");

    //disk.exportFile("CALIFORNIA GAMES", "test/test.prg");

    disk.write("temp/newdisk.d64");

}

function main() {
    Logger.setGlobalLevel(LogLevel.Trace);
    run();
}

main();
