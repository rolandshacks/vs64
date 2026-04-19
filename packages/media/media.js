//
// Media Package
//
const { MediaType, MediaClassId } = require('./mediatype');
const { BufferedReader } = require('./buffered_reader');
const { MediaFile } = require('./mediafile');
const { FileSystem, Position, File } = require('./filesystem');
const { Disk } = require('./disk');
const { Tape } = require('./tape');
const { DiskMediaFile } = require('./diskfile');
const { CharsetMediaFile, CharsetDisplayMode, CharsetColorMethod } = require('./charset');
const { SpriteMediaFile } = require('./spritefile');
const { SidMediaFile } = require('./sidfile');
const { TapeMediaFile } = require('./tapefile');

module.exports = {
    MediaType: MediaType,
    MediaClassId: MediaClassId,
    BufferedReader: BufferedReader,
    MediaFile: MediaFile,
    Disk: Disk,
    Tape: Tape,
    FileSystem: FileSystem,
    Position: Position,
    File: File,
    DiskMediaFile: DiskMediaFile,
    TapeMediaFile: TapeMediaFile,
    CharsetMediaFile: CharsetMediaFile,
    CharsetDisplayMode: CharsetDisplayMode,
    CharsetColorMethod: CharsetColorMethod,
    SpriteMediaFile: SpriteMediaFile,
    SidMediaFile: SidMediaFile
};
