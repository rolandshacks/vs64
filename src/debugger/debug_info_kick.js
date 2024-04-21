//
// Debug Info - KickAssembler
//

const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Utils } = require('utilities/utils');
const { DebugSymbol, DebugAddressInfo } = require('debugger/debug_info_types');

const KickDebugSectionTypes = {
    UNKNOWN :        0,
    LIBRARIES :      1,
    DIRECTIVES :     2,
    PPDIRECTIVES :   3,
    ERRORS :         4,
    SYNTAX :         5,
    FILES :          6,
    VERSION :        7
};

class KickDebugInfo {
    static load(debug_info, project, filename) {
        let src = null;

        try {
            src = fs.readFileSync(filename, "utf8");
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("label file " + filename + " does not exist");
            } else {
                throw("unable to read debug database file '" + filename + "'");
            }
        }

        const parser = new KickDebugParser(project, src);
        const dbg = parser.parse();

        if (!dbg || !dbg.sources) throw("unable to read debug database file");

        for (const entry of dbg.sources) {
            const normalizedPath = debug_info.getRefName(entry);
            debug_info.getOrCreateLineList(normalizedPath);
        }

        if (dbg.addr) {
            for (const entry of dbg.addr) {

                const filename = dbg.sources[entry.fileIndex];

                const addressInfo = new DebugAddressInfo(
                    entry.startAddr,
                    entry.endAddr,
                    filename,
                    entry.startLine
                );

                addressInfo.globalRef = debug_info._addresses.length;
                debug_info._addresses.push(addressInfo);

                for (let addr = addressInfo.address; addr <= addressInfo.address_end; addr++) {
                    debug_info._addressMap[addr] = addressInfo;
                }

                const normalizedPath = debug_info.getRefName(filename);
                const currentSourceRef = debug_info.getOrCreateLineList(normalizedPath);
                if (null != currentSourceRef) {
                    addressInfo.localRef = currentSourceRef.length;
                    addressInfo.localRefTable = currentSourceRef;
                    currentSourceRef.push(addressInfo);
                }

            }
        }

        if (dbg.labels) {
            for (const entry of dbg.labels) {
                debug_info.storeSymbol(new DebugSymbol(
                    entry.name,
                    entry.addr,
                    true
                ));
            }
        }
    }
}

class KickDebugParser {

    constructor(project, src) {
        this.project = project;
        this.src = src;

        // dbg data
        this.sources = [];
        this.labels = [];
        this.addr = [];
    }

    parse() {

        const thisInstance = this;

        const src = this.src;

        let data = null;

        try {
            const parser = new XMLParser();
            const xml = parser.parse(src);
            if (xml) data = xml.C64debugger;
        } catch (err) {
            throw("unable to read debug database file: " + err);
        }

        if (!data) throw("unable to read debug database file");

        this.visit(data.Sources, (sources) => {
            const sourceEntries = sources.split('\n');
            for (const src of sourceEntries) {
                const pos = src.indexOf(',');
                if (pos == -1) continue;
                //const fileIndex = parseInt(src.substring(0, pos).trim(), 10);
                const fileName = src.substring(pos+1).trim();
                if (!fileName.toLowerCase().startsWith("kickass.jar:")) {
                    const normalizedFileName = Utils.normalizePath(fileName);
                    this.sources.push(normalizedFileName);
                } else {
                    this.sources.push(fileName);
                }
            }
        });

        this.visit(data.Labels, (labels) => {
            const labelEntries = labels.split('\n');
            for (const label of labelEntries) {
                const info = label.split(',');
                if (!info || info.length < 3) continue;

                const segment = info[0].trim().toLowerCase();
                const addr = parseInt(info[1].substring(1).trim(), 16);
                const name = info[2].trim();

                this.labels.push({
                    segment: segment,
                    addr: addr,
                    name: name
                });
            }
        });

        this.visit(data.Segment, (segment) => {
            thisInstance.visit(segment.Block, (blocks) => {
                const blockEntries = blocks.split('\n');
                for (const block of blockEntries) {

                    const info = block.split(',');
                    if (!info || info.length < 7) return;

                    const startAddr = parseInt(info[0].trim().substring(1), 16);
                    const endAddr = parseInt(info[1].trim().substring(1), 16);
                    const fileIndex = parseInt(info[2].trim(), 10);
                    const startline = parseInt(info[3].trim(), 10);
                    const startposition = parseInt(info[4].trim(), 10);
                    const endline = parseInt(info[5].trim(), 10);
                    const endposition = parseInt(info[6].trim(), 10);

                    const addr = {

                        startAddr: startAddr,
                        endAddr: endAddr,
                        fileIndex: fileIndex,
                        startLine: startline,
                        startPosition: startposition,
                        endLine: endline,
                        endPosition: endposition

                    };

                    thisInstance.addr.push(addr);
                }

            })
        });

        return {
            sources: this.sources,
            labels: this.labels,
            addr: this.addr
        };

    }

    visit(itemOrArray, visitor) {
        if (!itemOrArray) return;

        if (Array.isArray(itemOrArray)) {
            for (const childItem of itemOrArray) {
                if (childItem) visitor(childItem);
            }
        } else {
            visitor(itemOrArray);
        }
    }

}

class KickAssemblerInfo {

    static read(filename) {
        const kickInfo = new KickAssemblerInfo();

        try {
            kickInfo.#parse(filename);
        } catch (err) {
            //logger.error(err);
            return null;
        }

        return kickInfo;
    }

    constructor() {
        this._sections = null;
        this._currenctSection = null;
        this._files = null;
    }

    getErrors() {
        return this.#getSection(KickDebugSectionTypes.ERRORS);
    }

    #getSection(sectionType) {
        if (!this._sections) return null;
        const sectionObj = this._sections.get(sectionType);
        if (!sectionObj || !sectionObj.elements || sectionObj.elements.length < 1) return null;
        return sectionObj.elements;
    }

    #getFile(fileIndex) {
        const files = this._files;
        if (!files || fileIndex < 0 || fileIndex >= files.length) return null;
        const fileObj = files[fileIndex];
        if (!fileObj) return null;
        return fileObj.path;
    }

    #parse(filename) {
        let src = null;
        try {
            src = fs.readFileSync(filename, "utf8");
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("assembler info file " + filename + " does not exist");
            } else {
                throw("unable to read assembler info file '" + filename + "'");
            }
        }
        this.#parseInfo(src);
    }

    #parseInfo(src) {

        this._sections = new Map();

        let lines = src.split("\n");
        for (let line of lines) {
            const l = line.trim();
            this.#parseLine(l);
        }

        this.#resolve();
    }

    #parseLine(line) {
        if (!line || line.length < 1) return;

        if (line[0] == '[') {
            const sectionName = line.substring(1, line.length-1).toLowerCase();
            let sectionType = KickDebugSectionTypes.UNKNOWN;

            if (sectionName == "libraries") sectionType = KickDebugSectionTypes.LIBRARIES
            else if (sectionName == "directives") sectionType = KickDebugSectionTypes.DIRECTIVES
            else if (sectionName == "ppdirectives") sectionType = KickDebugSectionTypes.PPDIRECTIVES
            else if (sectionName == "errors") sectionType = KickDebugSectionTypes.ERRORS
            else if (sectionName == "syntax") sectionType = KickDebugSectionTypes.SYNTAX
            else if (sectionName == "files") sectionType = KickDebugSectionTypes.FILES
            else if (sectionName == "version") sectionType = KickDebugSectionTypes.VERSION
            else {
                this.currentSection = null; // unknown section
            }

            const section = {
                name: sectionName,
                type: sectionType,
                elements: []
            };

            this._sections.set(sectionType, section);
            this._currenctSection = section;

            return;
        }

        const section = this._currenctSection;
        if (!section) return;

        const elements = section.elements;

        const sectionType = section.type;

        if (sectionType == KickDebugSectionTypes.FILES) {
            const pos = line.indexOf(';');
            if (pos == -1) return; // invalid line

            let fileIndex = parseInt(line.substring(0, pos));
            if (isNaN(fileIndex) || fileIndex < 0) return; // invalid index

            const fileName = line.substring(pos+1);

            //if (fileName.toLowerCase().startsWith("KickAss.jar")) return; // skip files in jar

            const element = {
                index: fileIndex,
                path: fileName
            }

            elements.push(element);

        } else if (sectionType == KickDebugSectionTypes.SYNTAX) {

            const pos = line.indexOf(';');
            if (pos == -1) return; // invalid line

            const operator = line.substring(0, pos);
            const rangeSpec = line.substring(pos+1);

            const element = {
                operator: operator,
                range: this.#parseRange(rangeSpec)
            };

            elements.push(element);

        } else if (sectionType == KickDebugSectionTypes.ERRORS) {

            // example: "Error;15,5,15,10,0;Invalid directive"

            const pos = line.indexOf(';');
            if (pos == -1) return; // invalid line

            const level = line.substring(0, pos).trim();

            const pos2 = line.indexOf(';', pos+1);
            if (pos2 <= pos) return; // invalid line

            const rangeSpec = line.substring(pos+1, pos2).trim();
            const message = line.substring(pos2+1).trim();

            const element = {
                level: level,
                range: this.#parseRange(rangeSpec),
                message: message,
                filename: null // unresolved
            };

            elements.push(element);
        }

    }

    #parseRange(rangeSpec) {

        if (!rangeSpec || rangeSpec.length < 1) return null;

        const rangeInfo = rangeSpec.split(',');
        if (!rangeInfo || rangeInfo.length < 5) return null;

        const range = {
            startLine: parseInt(rangeInfo[0]),
            startPosition: parseInt(rangeInfo[1]),
            endLine: parseInt(rangeInfo[2]),
            endPosition: parseInt(rangeInfo[3]),
            fileIndex: parseInt(rangeInfo[4])
        };

        return range;
    }

    #resolve() {
        this._currenctSection = null;
        this._files = this.#getSection(KickDebugSectionTypes.FILES);

        const errors = this.#getSection(KickDebugSectionTypes.ERRORS);
        if (errors && errors) {
            for (const error of errors) {
                if (!error.range) continue;
                error.filename = this.#getFile(error.range.fileIndex);
            }
        }
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    KickDebugInfo: KickDebugInfo,
    KickAssemblerInfo: KickAssemblerInfo
}
