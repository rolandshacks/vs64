//
// Debug Info - Oscar64
//

const fs = require('fs');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { DebugSymbol, DebugAddressInfo } = require('debugger/debug_info_types');

class BasicDebugInfo {
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

        const parser = new BasicMapParser(project, src);
        const dbg = parser.parse();

        if (!dbg || !dbg.sources) throw("unable to read basic source map file");

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
                    entry.startLine + 1
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

class BasicMapParser {

    constructor(project, src) {
        this.project = project;
        this.src = src;

        // dbg data
        this.sources = [];
        this.labels = [];
        this.addr = [];
    }

    parse() {

        const src = this.src;

        let currentSource = null;

        const sourceSet = new Set()
        let fileIndex = 0;

        let lines = src.split("\n");
        for (const rawLine of lines) {

            let line = null;

            const pos = rawLine.indexOf('#');
            if (pos != -1) {
                line = rawLine.substring(0, pos).trim();
            } else {
                line = rawLine.trim();
            }

            if (line.length < 1) continue; // skip empty line

            const firstChar = line[0];

            if (firstChar >= '0' && firstChar <= '9') {
                if (currentSource == null) continue;

                const lineItems = line.split(",");
                if (lineItems.length != 5) continue;

                let i = 0;
                const startAddr = parseInt(lineItems[i++], 10);
                const endAddr = parseInt(lineItems[i++], 10);
                const _basicLine_ = parseInt(lineItems[i++], 10);
                const sourceLine = parseInt(lineItems[i++], 10);
                const lineLen = parseInt(lineItems[i++], 10);

                const addr = {

                    startAddr: startAddr,
                    endAddr: endAddr,
                    fileIndex: fileIndex,
                    startLine: sourceLine,
                    startPosition: 0,
                    endLine: sourceLine,
                    endPosition: lineLen

                };

                this.addr.push(addr);

            } else {
                currentSource = line;
                if (!sourceSet.has(currentSource)) {
                    sourceSet.add(currentSource);
                    this.sources.push(currentSource);
                    fileIndex = this.sources.length - 1;
                } else {
                    fileIndex = this.sources.indexOf(currentSource);
                }
            }
        }

        return {
            sources: this.sources,
            labels: this.labels,
            addr: this.addr
        };

    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    BasicDebugInfo: BasicDebugInfo
}
