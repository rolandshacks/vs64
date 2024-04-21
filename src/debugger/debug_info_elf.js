//
// Debug Info - Elf/Dwarf
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

//const { Utils } = require('utilities/utils');
const { Elf, ElfSymbol } = require('elf/elf');
const { DebugSymbol, DebugAddressInfo } = require('debugger/debug_info_types');

class ElfDebugInfo {
    static load(debug_info, project, filename) {

        let elf = null;

        try {
            elf = new Elf();
            elf.load(filename);
        } catch (err) {
            if (err.code == 'ENOENT') {
                throw("ELF file " + filename + " does not exist");
            } else {
                throw("unable to read debug database file '" + filename + "'");
            }
        }

        { // load source line information

            const section = elf.getSection(".debug_line");
            if (section) {
                const entries = section.entries;
                if (entries) {
                    for (const entry of entries) {

                        const addressInfo = new DebugAddressInfo(
                            entry.address,
                            entry.address_end,
                            entry.source,
                            entry.line
                        );

                        /*
                            console.log(
                                "$" + addressInfo.address.toString(16) +
                                "-$" + addressInfo.address_end.toString(16) +
                                ", " + addressInfo.source +
                                ":" + addressInfo.line
                            );
                        */

                        addressInfo.globalRef = debug_info._addresses.length;
                        debug_info._addresses.push(addressInfo);

                        for (let addr = addressInfo.address; addr <= addressInfo.address_end; addr++) {
                            debug_info._addressMap[addr] = addressInfo;
                        }

                        const normalizedPath = addressInfo.normalizedPath;

                        let currentSourceRef = debug_info.getOrCreateLineList(normalizedPath);
                        addressInfo.localRef = currentSourceRef.length;
                        addressInfo.localRefTable = currentSourceRef;
                        currentSourceRef.push(addressInfo);
                    }
                }
            }
        }

        {  // load symbol table

            const section = elf.getSection(".symtab");
            if (section) {
                const numSymbols = section.getSymbolCount();
                for (let i=0; i<numSymbols; i++) {
                    const symbol = section.getSymbol(i);
                    if (symbol.name && symbol.type == ElfSymbol.TypeObject) {
                        //console.log("Symbol: " + symbol.name + "  Value: " + symbol.value + "  Size: " + symbol.size);
                        debug_info.storeSymbol(new DebugSymbol(
                            symbol.name,
                            symbol.value,
                            true,
                            null,
                            0,
                            0, // data size type (8bit, 16bit, ...) is unknown (TODO)
                            symbol.size
                        ));
                    }
                }
            }
        }
    }
}


//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    ElfDebugInfo: ElfDebugInfo
}
