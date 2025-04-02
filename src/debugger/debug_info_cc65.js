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

const { SortedArray } = require('utilities/sorted_array');
const { DebugSymbol, DebugAddressInfo, DebugLineTypes, DebugDataType } = require('debugger/debug_info_types');

class Cc65DebugInfo {
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

        const dbg = Cc65DebugParser.parse(project, src);

        const addressInfos = dbg.addressInfos;

        for (const addressInfo of addressInfos) {

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

        if (null != dbg.symbols) {
            for (const sym of dbg.symbols) {
                debug_info.storeSymbol(sym);
            }
        }

        if (null != dbg.functions) {
            for (const func of dbg.functions) {
                debug_info.storeFunction(func);
            }
        }

        debug_info.setSpans(dbg.spans);

        debug_info._supportsScopes = true;
    }
}

class Cc65DebugParser {

    static getNumber(map, key, defaultValue) {
        const value = map.get(key);
        if (!value) return defaultValue;
        return parseInt(value);
    }

    static getNumberHex(map, key, defaultValue) {
        const value = map.get(key);
        if (!value) return defaultValue;
        return parseInt(value, 16);
    }

    static getNumbers(map, key, defaultValue) {
        const values = map.get(key);
        if (!values) return defaultValue;
        const valueArr = values.split('+');
        const numbers = [];
        for (const value of valueArr) {
            numbers.push(parseInt(value));
        }
        if (numbers.length < 1) return defaultValue;
        return numbers;
    }

    static decode(key, value) {
        if (!key || !value) return null;

        let result = null;

        if (value.length >= 2 && value[0]=='\"' && value[value.length-1]=='\"') {
            return value.substring(1, value.length-1);
        }

        if (key == "name") {
            result = value;
        } else if (key == "addsize") {
            result = value; // absolute | zeropage (??)
        } else {
            if (value.indexOf('+') >= 0) {
                const list = value.split('+');
                const values = [];
                for (const element of list) {
                    values.push(parseInt(element));
                }
                if (values.length > 0) result = values;
            } else {
                if (value.startsWith('0x')) {
                    result = parseInt(value.substring(2), 16);
                } else if (value.startsWith('$')) {
                    result = parseInt(value.substring(1), 16);
                } else {
                    let isNumber = true;
                    for (const c of value) {
                        if (c < '0' || c > '9') {
                            isNumber = false;
                            break;
                        }
                    }

                    if (isNumber) {
                        result = parseInt(value);
                    } else {
                        result = value;
                    }

                }
            }
        }

        return result;

    }

    static parseLine(line) {
        if (!line || line.length < 1) return null;

        let pos = line.indexOf('\t');
        if (pos < 0) pos = line.indexOf(' ');
        if (pos < 0) return null;

        const key = line.substring(0, pos);
        const data = line.substring(pos+1);
        const elements = data.split(',');
        const attributes = new Map();
        for (const element of elements) {
            const [k, v] = element.split('=');
            if (k && v) {
                const rawValue = v.trim();
                const decodedValue = Cc65DebugParser.decode(k, rawValue);
                if (decodedValue != null) attributes.set(k, decodedValue);
            }
        }

        let statement = {
            key: key
        };

        for (const [k, v] of attributes) {
            statement[k] = v;
        }

        return statement;
    }

    static addLineToSpan(span, lineInfo) {

        if (!span.lineInfos) {
            span.lineInfos = new SortedArray({ key: (a) => { return a.line; } });
        }

        span.lineInfos.push(lineInfo);
    }

    static addScopeToSpan(span, scopeInfo) {
        if (!span.scopeInfos) {
            span.scopeInfos = [];
        }
        span.scopeInfos.push(scopeInfo);
    }

    static addCSymToScope(csym, scope) {
        if (!scope.csymInfos) {
            scope.csymInfos = [];
        }
        scope.csymInfos.push(csym);
    }

    static scan(src) {

        const data = {
            csyms: [],
            files: [],
            libs: [],
            lines: [],
            mods: [],
            segs: [],
            spans: [],
            scopes: [],
            syms: [],
            types: []
        };

        let lines = src.split("\n").filter(s => (s.trim().length > 0));
        for (let line of lines) {
            const statement = Cc65DebugParser.parseLine(line);
            if (!statement || !statement.key) continue;

            const collection = data[statement.key + "s"];
            if (!collection) {
                //console.log("unknown type: " + statement.key + "s");
                continue;
            }

            collection.push(statement);
        }

        return data;

    }

    static resolve(project, data) {

        let codeSegmentId = 0;
        let dataSegmentId = -1;
        let zeropageStartAddr = 0x02; // default

        for (const segment of data.segs) {
            if (segment.name == "CODE") {
                codeSegmentId = segment.id;
            } else if (segment.name == "DATA") {
                dataSegmentId = segment.id;
            } else if (segment.name == "ZEROPAGE") {
                zeropageStartAddr = parseInt(segment.start);
            }
        }

        for (const file of data.files) {
            if (project) {
                const filePath = project.resolveFile(file.name);
                if (!filePath) {
                    continue;
                }
            }
        }

        for (const scope of data.scopes) {
            if (scope.span == null) continue;

            if (scope.parent != null) {
                const parent = data.scopes[scope.parent];
                if (parent) {
                    scope.parentScope = parent;
                    scope.scopeLevel = parent.scopeLevel + 1;
                    if (!parent.childScopes) {
                        parent.childScopes = [];
                    }
                    parent.childScopes.push(scope);
                }
            } else {
                scope.scopeLevel = 0;
            }

            if (Array.isArray(scope.span)) {
                for (const spanId of scope.span) {
                    const span = data.spans[spanId];
                    Cc65DebugParser.addScopeToSpan(span, scope);
                }
            } else {
                const span = data.spans[scope.span];
                Cc65DebugParser.addScopeToSpan(span, scope);
                scope.spanInfo = span;
            }
        }

        for (const line of data.lines) {
            if (line.span == null) continue;

            if (Array.isArray(line.span)) {
                for (const spanId of line.span) {
                    const span = data.spans[spanId];
                    Cc65DebugParser.addLineToSpan(span, line);
                }
            } else {
                const span = data.spans[line.span];
                Cc65DebugParser.addLineToSpan(span, line);
            }
        }

        const addresses = new SortedArray({
            less: (a, b) => {
                if (a.type == DebugLineTypes.C && b.type == DebugLineTypes.ASM) return true;
                return (a.address < b.address);
            },
            key: (a) => { return a.address; }
        });

        const spans = new SortedArray({ key: (a) => { return a.address; }});

        for (const span of data.spans) {

            if (span.seg == null) continue;

            const segment = data.segs[span.seg];
            span.segment = segment;
            span.address = segment.start + span.start;

            if (span.seg == codeSegmentId) {
                spans.push(span);
            }

            if (!span.lineInfos) continue;

            for (const lineInfo of span.lineInfos) {

                if (!lineInfo || lineInfo.file == null) {
                    continue;
                }

                const seg = data.segs[span.seg];
                const addr = seg.start + span.start;
                const addrEnd = addr + span.size - 1;
                const size = span.size;

                const file = data.files[lineInfo.file];
                if (project && !project.isSource(file.name)) {
                    continue; // ignore non-project files
                }

                const line = lineInfo.line;

                const addrInfo = new DebugAddressInfo(
                    addr,
                    addrEnd,
                    file.name,
                    line
                );

                addrInfo.lineType = lineInfo.type;
                addrInfo.size = size;
                addrInfo.span = span;

                addresses.push(addrInfo);
            }

        }

        const symbols = [];

        {  // add stack pointer
            symbols.push(new DebugSymbol("Stack Pointer", 0x0002, true, null, null, 2, 2, null, DebugDataType.UINT16));
        }

        for (const sym of data.syms) {
            // get global variables (symbols in DATA segment at module scope)
            if (sym.scope == 0 && sym.seg == dataSegmentId && sym.val != null && sym.type == "lab") {
                // global variable
                // value represents the symbol start address
                const addr = parseInt(sym.val);
                symbols.push(new DebugSymbol(sym.name, addr, true));
            }
        }

        const functions = [];

        for (const csym of data.csyms) {
            if (csym.scope == null) continue;
            const scope = data.scopes[csym.scope];
            if (scope == null) continue;

            if (csym.sym != null) {
                const sym = data.syms[csym.sym];
                if (sym != null && sym.seg == codeSegmentId) {
                    // function

                    if (scope.span != null) {
                        const seg = data.segs[sym.seg];
                        const span = data.spans[scope.span];
                        if (seg != null && span != null) {

                            const addr = seg.start + span.start;
                            const addr_end = addr + span.size - 1;
                            //const size = span.size;

                            const addrInfo = addresses.findKey(addr);

                            const funcInfo = new DebugAddressInfo(
                                addr,
                                addr_end,
                                (null != addrInfo) ? addrInfo.source : "",
                                (null != addrInfo) ? addrInfo.line : 0,
                                csym.name
                            );

                            functions.push(funcInfo);

                            // attach function info to scope
                            scope.function = funcInfo;
                        }
                    }

                }
            }
        }

        for (const csym of data.csyms) {
            if (csym.scope == null) continue;
            const scope = data.scopes[csym.scope];
            if (scope == null) continue;
            if (csym.sym != null) continue;

            Cc65DebugParser.addCSymToScope(csym, scope);

            if (scope.function != null) {
                const funcInfo = scope.function;

                const offset = (null != csym.offs ? parseInt(csym.offs) : 0x0);

                const debugSymbol = new DebugSymbol(csym.name, offset, true);

                // first two bytes of used zero page range are
                // the address of stack pointer
                const stackPointerAddr = zeropageStartAddr;
                debugSymbol.setStackPointerAddress(stackPointerAddr);

                funcInfo.addDebugSymbol(debugSymbol);

                for (let symbol of funcInfo.debugSymbols) {
                    if (-offset > symbol.stack_pointer_offset) {
                        symbol.stack_pointer_offset = -offset;
                    }
                }
            }

        }


        const dbg = {
            spans: spans,
            addressInfos: addresses.elements,
            symbols: symbols,
            functions: functions
        };

        return dbg;
    }

    static parse(project, src) {

        const data = Cc65DebugParser.scan(src);
        const dbg = Cc65DebugParser.resolve(project, data);

        return dbg;
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Cc65DebugInfo: Cc65DebugInfo
}
