//
// Vice Debugger / Binary Monitor Connector
//

const net = require('net');

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Utils } = require('utilities/utils');
const { Logger } = require('utilities/logger');
const { DebugProcess, DebugInterface, CpuState, Breakpoint, DebugInterruptReason, DebugStepType, MemoryType } = require('debugger/debug');

const logger = new Logger("ViceDebug");

//-----------------------------------------------------------------------------------------------//
// Constants
//-----------------------------------------------------------------------------------------------//

const RequestType = {

    RESPONSE_JAM: 0x61,
    RESPONSE_STOPPED: 0x62,
    RESPONSE_RESUMED: 0x63,
    RESPONSE_CHECKPOINT: 0x11,

    CMD_MEMORY_GET: 0x1,
    CMD_MEMORY_SET: 0x2,
    CMD_CHECKPOINT_GET: 0x11,
    CMD_CHECKPOINT_SET: 0x12,
    CMD_CHECKPOINT_DELETE: 0x13,
    CMD_CHECKPOINT_LIST: 0x14,
    CMD_CHECKPOINT_TOGGLE: 0x15,
    CMD_CHECKPOINT_CONDITION_SET: 0x22,
    CMD_REGISTERS_GET: 0x31,
    CMD_REGISTERS_SET: 0x32,
    CMD_DUMP: 0x41,
    CMD_UNDUMP: 0x42,
    CMD_RESOURCE_GET: 0x51,
    CMD_RESOURCE_SET: 0x52,
    CMD_ADVANCE_INSTRUCTIONS: 0x71,
    CMD_KEYBOARD_FEED: 0x72,
    CMD_EXECUTE_UNTIL_RETURN: 0x73,
    CMD_PING: 0x81,
    CMD_BANKS_AVAILABLE: 0x82,
    CMD_REGISTERS_AVAILABLE: 0x83,
    CMD_DISPLAY_GET: 0x84,
    CMD_VICE_INFO: 0x85,
    CMD_PALETTE_GET: 0x91,
    CMD_JOYPORT_SET: 0xa2,
    CMD_USERPORT_SET: 0xb2,
    CMD_EXIT: 0xaa,
    CMD_QUIT: 0xbb,
    CMD_RESET: 0xcc,
    CMD_AUTOSTART: 0xdd

};

function getRequestTypeName(id) {
    const keys = Object.keys(RequestType);
    for (const key of keys) {
        const item_id = RequestType[key];
        if (item_id == id) {
            return key;
        }
    }
    return null;
}

const RECEIVE_BUFFER_SIZE = 256 * 1024;
const RECEIVE_QUEUE_SIZE = 64;

class Color {
    constructor(r, g, b) {
        this.red = r || 0;
        this.green = g || 0;
        this.blue = b || 0;
    }

    set(r, g, b) {
        this.red = r;
        this.green = g;
        this.blue = b;
    }
}

class Palette {
    constructor() {
        this.colors = null;
    }

    set(colors) {
        this.colors = [];
        for (let color of colors) {
            this.colors.push(color);
        }
    }

    get length() {
        return this.colors ? this.colors.length : 0;
    }

    get(idx) {
        if (!this.colors) return null;
        if (idx < 0 || idx >= this.length) return null;
        return this.colors[idx];
    }
}

class ScreenInfo {
    constructor() {
        this.debugWidth = 0;
        this.debugHeight = 0;
        this.xOffset = 0;
        this.yOffset = 0;
        this.innerWidth = 0;
        this.innerHeight = 0;
        this.bitsPerPixel = 0;
        this.size = 0;
    }

    set(info) {
        const i = this;
        i.debugWidth = info.debugWidth;
        i.debugHeight = info.debugHeight;
        i.xOffset = info.xOffset;
        i.yOffset = info.yOffset;
        i.innerWidth = info.innerWidth;
        i.innerHeight = info.innerHeight;
        i.bitsPerPixel = info.bitsPerPixel;
        i.size = info.size;
    }
}

class _Screen_ {
    constructor() {
        this.screenInfo = new ScreenInfo();
        this.frameBuffer = null;
        this.palette = null;
    }

    setInfo(info) {
        this.screenInfo.set(info);
    }

    setPixels(buffer, ofs, len) {
        if (this.frameBuffer && this.frameBuffer.length == len) {
            buffer.copy(this.frameBuffer, 0, ofs, ofs + len);
        } else {
            this.frameBuffer = buffer.slice(ofs, ofs + len);
        }
    }

    setPalette(colors) {
        if (!this.palette) {
            this.palette = new Palette();
        }
        this.palette.set(colors);
    }

    getPaletteSize() {
        return this.palette ? this.palette.length : 0;
    }
}

class Cpu {
    constructor() {
        this._cpuState = new CpuState();
    }

    getState() {
        return this._cpuState;
    }

}

class Token {

    constructor(cmd) {
        this._uid = ++Token.uid_counter;
        this._cmd = cmd;

        const obj = this;

        this._promise = new Promise((resolve, reject) => {
            obj.resolveFn = resolve;
            obj.rejectFn = reject;
        });
    }

    resolve(data) {
        //logger.trace("request resolve: " + getRequestTypeName(this._cmd) + " (" + Utils.formatHex(this._cmd, 2, "0x") + ") / " + this._uid);
        this.resolveFn(data);
    }

    reject(error) {
        logger.error("request reject: " + getRequestTypeName(this._cmd) + " (" + Utils.formatHex(this._cmd, 2, "0x") + ") / " + this._uid + " : " + error);
        this.rejectFn("request failed: " + error);
    }
}

Token.uid_counter = 0; // declare class property

class ViceMonitorClient {

    constructor() {

        this._tokenList = [];
        this._tokenMap = new Map();

        this._client = null;
        this._disconnecting = false;

        this._registerIdMap = new Map();
        this._bankIdMap = new Map();

        this._cpu = new Cpu();

        this._messageBuffer = Buffer.alloc(RECEIVE_BUFFER_SIZE);
        this._messageBufferOffset = 0;
        this._messageBufferUsage = 0;

        this._eventFn = null;
        this._errorFn = null;
    }

    async connect(hostname, port) {

        this._tokenList = [];
        this._tokenMap = new Map();

        this.disconnect();
        this.clearBuffer();

        this._disconnecting = false;

        const app = this;

        this._client = new net.Socket();
        const client = this._client;

        client.on('data', (data) => {
            app.onData(data);
        });

        const ignoreCloseEventListener = function() { ; };
        client.on('close', ignoreCloseEventListener);

        let connected = false;
        let fatalError = null;

        const connectErrorEventListener = function(err) {
            if (err.code == 'ECONNREFUSED') {
                logger.trace("peer not ready when trying to connect: " + err);
            } else {
                logger.trace("error while trying to connect: " + err);
                if (err.code == 'ENOENT' || err.code == 'ENOTFOUND') {
                    fatalError = err;
                }
            }

        };
        client.on('error', connectErrorEventListener);

        client.on('connect', () => {
            logger.trace("connected");
            connected = true;
        })

        const timeout = 5000;
        let retryCount = timeout / 250;

        while (!connected && !fatalError) {

            client.connect(port, hostname);

            if (retryCount <= 0) break;
            retryCount--;

            await Utils.sleep(250);
        }

        if (!connected || fatalError) {
            client.destroy();
            throw("failed to connect to emulator process" + (fatalError ? ": " + fatalError : ""));
        }

        client.off('close', ignoreCloseEventListener);
        client.on('close', () => {
            app.onClose();
        });

        client.off('error', connectErrorEventListener);
        client.on('error', (e) => {
            logger.error(e);
            app.onClose();
            app.fireError(e);
        });

        client.setNoDelay(true);

        await app.cmdRegistersAvailable(0x0);
        await app.cmdBanksAvailable();

    }

    async deleteAllBreakpoints() {
        const checkpointList = await this.cmdCheckpointList();
        if (checkpointList && checkpointList.checkpoints) {
            for (const checkpoint of checkpointList.checkpoints) {
                await this.cmdCheckpointDelete(checkpoint.checkpointNumber);
            }
        }
    }

    isConnected() {
        if (this._client != null && this._disconnecting == false);
    }

    async disconnect(destroyClient) {

        const client = this._client;

        if (client) {

            if (!this._disconnecting) {
                this._disconnecting = true;
                destroyClient = true;
                await this.deleteAllBreakpoints();
                await this.cmdExit();
                this.clearBuffer();
            }

            if (destroyClient) {
                this._client = null;
                client.destroy();
            }

        } else {
            this.clearBuffer();
        }

    }

    clearBuffer() {
        this._messageBufferOffset = 0;
        this._messageBufferUsage = 0;
    }

    onData(buffer) {

        let buf = this._messageBuffer;

        buffer.copy(buf, this._messageBufferOffset + this._messageBufferUsage, 0, buffer.length);
        this._messageBufferUsage += buffer.length;

        const responseHeaderLength = 12;

        while (this._messageBufferUsage >= responseHeaderLength) {

            let valid = true;

            let ofs = this._messageBufferOffset;

            if (buf[ofs++] != 0x2) valid = false; // 0x2 STC
            if (buf[ofs++] != 0x2) valid = false; // version

            if (!valid) {
                logger.warn("invalid message header");
                this.clearBuffer();
                break;
            }

            const bodyLength =
                (buf[ofs++]<<0) +
                (buf[ofs++]<<8) +
                (buf[ofs++]<<16) +
                (buf[ofs++]<<24);

            const messageLength = responseHeaderLength + bodyLength;

            if (this._messageBufferUsage < messageLength) {
                break;
            }

            let response = buf.subarray(this._messageBufferOffset, this._messageBufferOffset + messageLength);

            this.onResponseMessage(response);

            this._messageBufferOffset += messageLength;
            this._messageBufferUsage -= messageLength;
            if (this._messageBufferUsage > 0) {
                buf.copy(buf, 0, this._messageBufferOffset, this._messageBufferOffset + this._messageBufferUsage);
            }
            this._messageBufferOffset = 0;
        }

    }

    onResponseMessage(buffer) {
        //logger.trace("Received: " + buffer.length + " bytes");

        const responseHeaderLength = 12;
        if (buffer.length < responseHeaderLength)  {
            return;
        }

        if (buffer.length < responseHeaderLength ||     // min length
            buffer[0] != 0x2 ||                         // STC
            buffer[1] != 0x2) {                         // version
            logger.warn("invalid response");
            return;
        }

        const bodyLength =
            (buffer[2]<<0) +
            (buffer[3]<<8) +
            (buffer[4]<<16) +
            (buffer[5]<<24);

        const responseType = buffer[6];
        const errorCode = buffer[7];

        const requestId =
            (buffer[8]<<0) +
            (buffer[9]<<8) +
            (buffer[10]<<16) +
            (buffer[11]<<24);

        const token = this.lookupToken(requestId);

        if (0x0 != errorCode) {
            if (token) {
                token.reject(errorCode);
            } else {
                logger.trace("received error response: " + errorCode);
            }
            return;
        }

        let body = null;
        if (bodyLength > 0) {
            body = buffer.subarray(responseHeaderLength, responseHeaderLength + bodyLength);
        }

        const keepToken = this.onResponse(token, responseType, requestId, body);

        if (token && !keepToken) {
            this.freeToken(token);
        }
    }

    onClose() {
        logger.trace('Connection closed');
        this._disconnecting = true;
        this.disconnect(true);
    }

    onError(e) {
        logger.trace('Error: ' + e);
    }

    write(data) {
        this._client.write(data);
    }

    onResponse(token, responseType, requestId, body) {

        logger.trace(
            "dispatching response " + getRequestTypeName(responseType) +
            " for request " + (token ? getRequestTypeName(token._cmd) : "none")
        )

        let keepToken = false;

        const bodyLen = body ? body.length : 0;

        let eventObj = null;

        let noResolve = false;

        if (responseType == RequestType.CMD_MEMORY_GET) { // get memory

            logger.trace("memory get");
            let ofs = 0;
            let len = body[ofs]+(body[ofs+1]<<8); ofs+=2;
            if (len == 0) len = bodyLen - ofs;

            // make a copy of the data to avoid race conditions with parallel requests
            const mem = Buffer.alloc(len);
            body.copy(mem, 0, ofs, ofs+len);

            eventObj = {
                type: responseType,
                memory: mem
            };

        } else if (responseType == RequestType.CMD_DISPLAY_GET) { // display
            logger.trace("display get");
            let ofs = 0;

            const headerLen = body[ofs] + (body[ofs+1]<<8) + (body[ofs+2]<<16) + (body[ofs+3]<<24); ofs+=4; // 13

            let screenInfo = new ScreenInfo();

            screenInfo.debugWidth = body[ofs]+(body[ofs+1]<<8); ofs+=2;   // 504 pixels
            screenInfo.debugHeight = body[ofs]+(body[ofs+1]<<8); ofs+=2;  // 312 pixels
            screenInfo.xOffset = body[ofs]+(body[ofs+1]<<8); ofs+=2;      // 136 pixels
            screenInfo.yOffset = body[ofs]+(body[ofs+1]<<8); ofs+=2;      // 51 pixels
            screenInfo.innerWidth = body[ofs]+(body[ofs+1]<<8); ofs+=2;   // 320 pixels
            screenInfo.innerHeight = body[ofs]+(body[ofs+1]<<8); ofs+=2;  // 200 pixels
            screenInfo.bitsPerPixel = body[ofs++];                        // 8 bpp

            screenInfo.size = body[ofs] + (body[ofs+1]<<8) + (body[ofs+2]<<16) + (body[ofs+3]<<24); ofs+=4;  // 157248 bytes
            ofs = headerLen;

            eventObj = {
                type: responseType,
                info: screenInfo,
                pixels: body,
                offset: ofs
            };

        } else if (responseType == RequestType.CMD_PALETTE_GET) { // display
            logger.trace("palette get");

            let ofs = 0;
            const paletteSize = body[ofs]+(body[ofs+1]<<8); ofs+=2;   // 16
            let idx = 0;

            let colors = [];

            while (idx < paletteSize && ofs < bodyLen) {
                let pos = ofs;
                const sz = body[ofs++];
                const red = body[ofs++];
                const green = body[ofs++];
                const blue = body[ofs++];

                colors.push(new Color(red, green, blue));

                ofs = pos + sz + 1;
                idx++;
            }

            eventObj = {
                type: responseType,
                palette: colors
            };

        } else if (responseType == RequestType.CMD_REGISTERS_GET) { // registers

            logger.trace("registers get");

            let ofs = 0
            const numArrayItems = body[ofs] + (body[ofs+1]<<8); ofs+=2;
            let idx = 0;

            let cpuState = this._cpu._cpuState;

            while (idx < numArrayItems && ofs < bodyLen) {
                let pos = ofs;
                const sz = body[ofs++];
                const id = body[ofs++];
                const val = body[ofs]+(body[ofs+1]<<8); ofs+=2;
                ofs = pos + sz + 1;
                idx++;

                if (this._registerIdMap.size < 1) continue;

                const registerName = this._registerIdMap.get(id);
                if (null != registerName) {
                    if (registerName == "a") {
                        cpuState.cpuRegisters.A = val;
                    } else if (registerName == "x") {
                        cpuState.cpuRegisters.X = val;
                    } else if (registerName == "y") {
                        cpuState.cpuRegisters.Y = val;
                    } else if (registerName == "pc") {
                        cpuState.cpuRegisters.PC = val;
                    } else if (registerName == "sp") {
                        cpuState.cpuRegisters.S = val;
                    } else if (registerName == "fl") {
                        cpuState.cpuFlags.N = ((val & 0x80) != 0) ? 1 : 0;
                        cpuState.cpuFlags.V = ((val & 0x40) != 0) ? 1 : 0;
                        cpuState.cpuFlags.B = ((val & 0x10) != 0) ? 1 : 0;
                        cpuState.cpuFlags.D = ((val & 0x8) != 0) ? 1 : 0;
                        cpuState.cpuFlags.I = ((val & 0x4) != 0) ? 1 : 0;
                        cpuState.cpuFlags.Z = ((val & 0x2) != 0) ? 1 : 0;
                        cpuState.cpuFlags.C = ((val & 0x1) != 0) ? 1 : 0;
                    } else if (registerName == "00") {
                        cpuState.cpuInfo.zero0 = val;
                    } else if (registerName == "01") {
                        cpuState.cpuInfo.zero1 = val;
                    } else if (registerName == "lin") {
                        cpuState.cpuInfo.rasterLine = val;
                    } else if (registerName == "cyc") {
                        cpuState.cpuInfo.rasterCycle = val;
                    } else {
                        logger.warn("unknown register: " + registerName);
                    }

                } else {
                    logger.warn("unknown register id: " + id);
                }

            }

            eventObj = {
                type: responseType,
                state: cpuState
            };

        } else if (responseType == RequestType.CMD_BANKS_AVAILABLE) { // banks available

            logger.trace("banks available");

            this._bankIdMap.clear();

            let ofs = 0;
            const numArrayItems = body[ofs] + (body[ofs+1]<<8); ofs+=2;

            let idx = 0;
            while (idx < numArrayItems && ofs < bodyLen) {
                let pos = ofs;
                const sz = body[ofs++];
                const id = body[ofs]+(body[ofs+1]<<8); ofs+=2;
                const nameLen = body[ofs++];
                let name = "";
                for (let i=0; i<nameLen; i++) {
                    name +=  String.fromCharCode(body[ofs++]);
                }

                this._bankIdMap.set(name.toLowerCase(), id);
                ofs = pos + sz + 1;
                idx++;
            }

        } else if (responseType == RequestType.CMD_REGISTERS_AVAILABLE) { // registers available

            logger.trace("registers available");

            this._registerIdMap.clear();

            let ofs = 0;
            const numArrayItems = body[ofs] + (body[ofs+1]<<8); ofs+=2;
            let idx = 0;
            while (idx < numArrayItems && ofs < bodyLen) {
                let pos = ofs;
                const sz = body[ofs++];
                const id = body[ofs++];
                const _bits_ = body[ofs++];
                const nameLen = body[ofs++];
                let name = "";
                for (let i=0; i<nameLen; i++) {
                    name +=  String.fromCharCode(body[ofs++]);
                }

                this._registerIdMap.set(id, name.toLowerCase());
                ofs = pos + sz + 1;
                idx++;
            }
        } else if (responseType == RequestType.CMD_CHECKPOINT_DELETE) { // checkpoint delete
            logger.trace("checkpoint delete response");
            eventObj = { type: responseType };
        } else if (responseType == RequestType.CMD_CHECKPOINT_LIST) { // checkpoint list
            logger.trace("checkpoint list response");
            let ofs = 0;
            const checkpointCount = body[ofs] + (body[ofs+1]<<8) + (body[ofs+2]<<16) + (body[ofs+3]<<24); ofs+=4;

            let checkpoints = null;
            if (token && token.checkpoints) {
                checkpoints = [];
                for (const c of token.checkpoints.values()) {
                    checkpoints.push(c);
                }
            }

            eventObj = {
                type: responseType,
                count: checkpointCount,
                checkpoints: checkpoints
            };
        } else if (responseType == RequestType.RESPONSE_CHECKPOINT) { // checkpoint
            logger.trace("checkpoint response");
            let ofs = 0;
            const checkpointNumber = body[ofs] + (body[ofs+1]<<8) + (body[ofs+2]<<16) + (body[ofs+3]<<24); ofs+=4;
            const currentlyHit = (body[ofs++] == 0x1);
            const startAddr = body[ofs]+(body[ofs+1]<<8); ofs += 2;
            const endAddr = body[ofs]+(body[ofs+1]<<8); ofs += 2;
            const stopWhenHit = (body[ofs++] == 0x1);
            const enabled = (body[ofs++] == 0x1);
            const triggerOperation = body[ofs++];
            const temporary = (body[ofs++] == 0x1);
            const hitCount = body[ofs] + (body[ofs+1]<<8) + (body[ofs+2]<<16) + (body[ofs+3]<<24); ofs+=4;
            const ignoreCount = body[ofs] + (body[ofs+1]<<8) + (body[ofs+2]<<16) + (body[ofs+3]<<24); ofs+=4;
            const hasCondition = (body[ofs++] == 0x1);
            const memorySpace = body[ofs++];

            const checkpoint = {
                checkpointNumber: checkpointNumber,
                currentlyHit: currentlyHit,
                startAddr: startAddr,
                endAddr: endAddr,
                stopWhenHit: stopWhenHit,
                enabled: enabled,
                triggerOperation: triggerOperation,
                temporary: temporary,
                hitCount: hitCount,
                ignoreCount: ignoreCount,
                hasCondition: hasCondition,
                memorySpace: memorySpace
            };

            if (token && token._cmd == RequestType.CMD_CHECKPOINT_LIST && token._uid == requestId) {
                noResolve = true;
                if (!token.checkpoints) token.checkpoints = new Map();
                token.checkpoints.set(checkpoint.checkpointNumber, checkpoint);
            } else {
                eventObj = {
                    type: responseType,
                    checkpoint: checkpoint
                };
            }

        } else if (responseType == RequestType.CMD_ADVANCE_INSTRUCTIONS) { // advance instructions (step)
            eventObj = { type: responseType };
        } else if (responseType == RequestType.CMD_QUIT) { // quit
            eventObj = { type: responseType };
        } else if (responseType == RequestType.CMD_EXIT) { // exit
            eventObj = { type: responseType };
        } else if (responseType == RequestType.CMD_RESET) { // exit
            eventObj = { type: responseType };
        } else if (responseType == RequestType.RESPONSE_STOPPED) { // stopped
            const pc = body[0]+(body[1]<<8);
            eventObj = {
                type: responseType,
                pc: pc
            };
        } else if (responseType == RequestType.RESPONSE_RESUMED) { // resumed
            const pc = body[0]+(body[1]<<8);
            eventObj = {
                type: responseType,
                pc: pc
            };
        } else if (responseType == RequestType.CMD_AUTOSTART) { // autostart
            eventObj = { type: responseType };
        } else if (responseType == RequestType.CMD_EXECUTE_UNTIL_RETURN) { // execute until return
            eventObj = { type: responseType };
        } else if (responseType == RequestType.CMD_KEYBOARD_FEED) { // keyboard feed
            eventObj = { type: responseType };
        } else if (responseType == RequestType.CMD_MEMORY_SET) { // memory set
            eventObj = { type: responseType };
        } else {
            logger.warn("Unhandled response type " + responseType + ", request id " + requestId + ", body: " + bodyLen + " payload bytes");
        }

        if (token) {
            if (!noResolve) {
                token.resolve(eventObj);
            } else {
                keepToken = true;
            }
        } else {
            this.fireEvent(eventObj);
        }

        return keepToken;
    }

    allocToken(id) {
        if (this._tokenList.length > RECEIVE_QUEUE_SIZE) {
            const oldestToken = this._tokenList[0];
            this._tokenMap.delete(oldestToken.uid);
            this._tokenList.shift();
        }

        const token = new Token(id);
        this._tokenList.push(token);
        this._tokenMap.set(token._uid, token);

        return token;
    }

    freeToken(token) {
        if (!token) return;

        this._tokenMap.delete(token.uid);
    }

    lookupToken(uid) {
        return this._tokenMap.get(uid);
    }

    setOnEvent(fn) {
        this._eventFn = fn;
    }

    fireEvent(event) {
        if (this._eventFn) {
            this._eventFn(event);
        }
    }

    setOnError(fn) {
        this._errorFn = fn;
    }

    fireError(err) {
        if (this._errorFn) {
            this._errorFn(err);
        }
    }

    sendCommand(id, data) {

        const token = this.allocToken(id);
        const requestId = token._uid;

        const len = (data != null) ? data.length : 0;

        let message = [
            0x2, // STX
            0x2, // API version ID

            ((len >> 0) & 0xff),
            ((len >> 8) & 0xff),
            ((len >> 16) & 0xff),
            ((len >> 24) & 0xff),

            ((requestId >> 0) & 0xff),
            ((requestId >> 8) & 0xff),
            ((requestId >> 16) & 0xff),
            ((requestId >> 24) & 0xff),

            id
        ];

        if (null != data) {
            message.push(...data);
        }

        let messageBuffer = new Uint8Array(message);

        this._client.write(messageBuffer);

        return token._promise;
    }

    async cmdMemorySet(startAddress, endAddress, memoryType, haveEffect, memoryBlock) {
        if (!endAddress) endAddress = startAddress; // write 1 byte

        let bankId = 0x0;
        if (this._bankIdMap) {
            let bankName = 'default';
            if (memoryType) {
                if (memoryType == MemoryType.Default) bankName = 'default';
                else if (memoryType == MemoryType.Cpu) bankName = 'cpu';
                else if (memoryType == MemoryType.Ram) bankName = 'ram';
                else if (memoryType == MemoryType.Rom) bankName = 'rom';
                else if (memoryType == MemoryType.Io) bankName = 'io';
                else if (memoryType == MemoryType.Cartridge) bankName = 'cart';
            }
            bankId = this._bankIdMap.get(bankName)||0x0;
        }

        const memorySpace = 0x0; // main memory

        let body = [
            haveEffect ? 0x1 : 0x0,
            ((startAddress>>0) & 0xff), ((startAddress>>8) & 0xff),
            ((endAddress>>0) & 0xff), ((endAddress>>8) & 0xff),
            memorySpace,
            ((bankId>>0) & 0xff), ((bankId>>8) & 0xff)
        ];

        body.push(...memoryBlock);

        const result = await this.sendCommand(RequestType.CMD_MEMORY_SET, body);

        return result;

    }

    async cmdMemoryGet(startAddress, endAddress, memoryType, haveEffect) {

        if (!endAddress) endAddress = startAddress; // read 1 byte

        let bankId = 0x0;
        if (this._bankIdMap) {
            let bankName = 'default';
            if (memoryType) {
                if (memoryType == MemoryType.Default) bankName = 'default';
                else if (memoryType == MemoryType.Cpu) bankName = 'cpu';
                else if (memoryType == MemoryType.Ram) bankName = 'ram';
                else if (memoryType == MemoryType.Rom) bankName = 'rom';
                else if (memoryType == MemoryType.Io) bankName = 'io';
                else if (memoryType == MemoryType.Cartridge) bankName = 'cart';
            }
            bankId = this._bankIdMap.get(bankName)||0x0;
        }

        const memorySpace = 0x0; // main memory

        let body = [
            haveEffect ? 0x1 : 0x0,
            ((startAddress>>0) & 0xff), ((startAddress>>8) & 0xff),
            ((endAddress>>0) & 0xff), ((endAddress>>8) & 0xff),
            memorySpace,
            ((bankId>>0) & 0xff), ((bankId>>8) & 0xff)
        ];

        const result = await this.sendCommand(RequestType.CMD_MEMORY_GET, body);

        return result;
    }

    async cmdDisplayGet() {
        let body = [
            0x1, // use VIC (flag just used for C128)
            0x0 // format: indexed, 8bit
        ];

        const result = await this.sendCommand(RequestType.CMD_DISPLAY_GET, body);

        return result;
    }

    async cmdPaletteGet() {
        let body = [
            0x1 // use VIC (flag just used for C128)
        ];

        const result = await this.sendCommand(RequestType.CMD_PALETTE_GET, body);

        return result;
    }

    async cmdPing(_memspace_) {
        await this.sendCommand(RequestType.CMD_PING, null);
    }

    async cmdRegistersGet(memspace) {
        await this.sendCommand(RequestType.CMD_REGISTERS_GET, [ memspace & 0xff ]);
    }

    async cmdRegistersAvailable(memspace) {
        await this.sendCommand(RequestType.CMD_REGISTERS_AVAILABLE, [ memspace & 0xff ]);
    }

    async cmdBanksAvailable() {
        await this.sendCommand(RequestType.CMD_BANKS_AVAILABLE, null);
    }

    async cmdExit() {
        await this.sendCommand(RequestType.CMD_EXIT, null);
    }

    async cmdAdvanceInstructions(stepOverSubroutines, numSteps) {
        await this.sendCommand(RequestType.CMD_ADVANCE_INSTRUCTIONS, [
            stepOverSubroutines ? 0x1 : 0x0,
            ((numSteps>>0) & 0xff), ((numSteps>>8) & 0xff)
        ]);
    }

    async cmdExecuteUntilReturn() {
        await this.sendCommand(RequestType.CMD_EXECUTE_UNTIL_RETURN, null);
    }

    async cmdReset(hardReset) {
        await this.sendCommand(RequestType.CMD_RESET, [ hardReset ? 0x1 : 0x0 ]);
    }

    async cmdAutostart(filename, run) {
        let body = [
            run ? 0x1 : 0x0,
            0x0, 0x0, // file index
            filename.length,
        ];

        for (let i=0; i<filename.length; i++) {
            body.push(filename.charCodeAt(i) & 0xff);
        }

        await this.sendCommand(RequestType.CMD_AUTOSTART, body);
    }

    async cmdCheckpointGet(checkpointNumber) {
        let body = [
            ((checkpointNumber >> 0) & 0xff),
            ((checkpointNumber >> 8) & 0xff),
            ((checkpointNumber >> 16) & 0xff),
            ((checkpointNumber >> 24) & 0xff)
        ];

        const result = await this.sendCommand(RequestType.CMD_CHECKPOINT_GET, body);

        return result;
    }

    async cmdCheckpointSet(startAddress, endAddress) {

        if (!endAddress) endAddress = startAddress + 1;

        let body = [
            ((startAddress>>0) & 0xff), ((startAddress>>8) & 0xff),
            ((endAddress>>0) & 0xff), ((endAddress>>8) & 0xff),
            0x1, // stop when hit (0=no stop, 1=stop)
            0x1, // enabled (1=enabled, 0=disabled)
            0x4, // trigger operation (1=load, 2=store, 4=exec)
            0x0, // not temporary
            0x0  // memory space (0=main memory)
        ];

        const result = await this.sendCommand(RequestType.CMD_CHECKPOINT_SET, body);

        return result;
    }

    async cmdCheckpointDelete(checkpointNumber) {
        let body = [
            ((checkpointNumber >> 0) & 0xff),
            ((checkpointNumber >> 8) & 0xff),
            ((checkpointNumber >> 16) & 0xff),
            ((checkpointNumber >> 24) & 0xff)
        ];

        const result = await this.sendCommand(RequestType.CMD_CHECKPOINT_DELETE, body);

        return result;
    }

    async cmdCheckpointList() {
        const result = await this.sendCommand(RequestType.CMD_CHECKPOINT_LIST, null);

        return result;
    }

    async cmdKeyboardFeed(text) {

        let body = [
            text.length & 0xff
        ];

        for (let i=0; i<text.length; i++) {
            body.push(text.charCodeAt(i) & 0xff);
        }

        const result = await this.sendCommand(RequestType.CMD_KEYBOARD_FEED, body);

        return result;
    }

    async cmdKeyboardFeedByte(keycode) {

        let body = [
            0x01,
            keycode & 0xff
        ];

        const result = await this.sendCommand(RequestType.CMD_KEYBOARD_FEED, body);

        return result;
    }

    getState() {
        return this._cpu._cpuState;
    }

}

//-----------------------------------------------------------------------------------------------//
// Vice Process
//-----------------------------------------------------------------------------------------------//

class ViceProcess extends DebugProcess {
    constructor() {
        super();
        this._supportsRelaunch = true;
    }

    static createDebugInterface(session) {
        return new ViceConnector(session);
    }

    stdout(data) {
        if (!data) return;
        if (data == "Sync reset\r") {
            logger.trace(data);
            return;
        }

        super.stdout(data);
    }

    async spawn(executable, port, params, options) {

        const args = [];
        args.push("+remotemonitor");
        args.push("-binarymonitor");

        if (port) {
            args.push("-binarymonitoraddress"); args.push("ip4://127.0.0.1:" + port);
        }

        args.push("-autostartprgmode"); args.push("1");

        if (params) {
            args.push(...Utils.splitQuotedString(params));
        }

        await super.spawn_exec(executable, args, options);

    }
}

//-----------------------------------------------------------------------------------------------//
// Vice Connector
//-----------------------------------------------------------------------------------------------//

class ViceConnector extends DebugInterface {
    constructor(session) {
        super(session);
        this._vice = null;
        this._initialized = false;
        this._stopped = false;
        this._activeBreakpoint = null;
        this._runFlags = null;
        this._memoryCache = null;
    }

    init() {
        super.init();
        this._initialized = false;
        this._stopped = false;
        this._activeBreakpoint = null;
        this._runFlags = null;
        this._memoryCache = null;
    }

    async connect(hostname, port) {
        if (this._vice) return;

        const vice = new ViceMonitorClient();
        await vice.connect(hostname, port);
        this._vice = vice;

        this.#invalidateMemoryCache();

        logger.trace("connected to vice binary monitor port");

        const instance = this;

        vice.setOnEvent((event) => {
            instance.onEvent(event);
        });

        vice.setOnError((err) => {
            instance.onError(err);
        });

    }

    async disconnect() {
        if (this._vice) {
            this._vice.disconnect();
            this._vice = null;

            logger.trace("disconnected from vice binary monitor port");
        }
    }

    onError(/* err */) {
        this.fireEvent('stopped', DebugInterruptReason.FAILED);
    }

    onEvent(event) {

        if (!this._initialized) {
            return;
        }

        const session = this._session;
        const debugInfo = session._debugInfo;

        if (event.type == RequestType.RESPONSE_STOPPED) {

            const stepMode = (this._runFlags != null && this._runFlags.debugStepType != null);

            const vice = this._vice;
            if (vice) {
                if (!this._basicMode && stepMode) {
                    // get current pc
                    const cpuState = this.getCpuState();
                    const pc = cpuState.cpuRegisters.PC;

                    // check if stop happend on real code line (or somewhere between)
                    const runFlags = this._runFlags;
                    const stepStartAddress = runFlags.stepStartAddress;
                    const addressInfo = debugInfo.getAddressInfo(pc);
                    const pauseRequest = runFlags.pauseRequest;

                    let stopRun = false;
                    if (addressInfo) {
                        if (stepStartAddress) {
                            if (pc < stepStartAddress.address || pc > stepStartAddress.address_end) {
                                stopRun = true;
                            }
                        } else {
                            stopRun = true;
                        }
                    } else if (pauseRequest && !debugInfo.hasAddresses) {
                        // if pause is requested and no address info is available, just stop
                        stopRun = true;
                    }

                    if (stopRun) {
                        this._runFlags = null;
                        this._stopped = true;
                        if (pauseRequest) this.fireEvent('break', pc);
                        this.fireEvent('stopped', pauseRequest ? DebugInterruptReason.PAUSE : DebugInterruptReason.BREAKPOINT);
                    } else {
                        const stepOverSubroutines = true; //(addressInfo != null);
                        vice.cmdAdvanceInstructions(stepOverSubroutines, 1);
                    }

                } else if (this._activeBreakpoint) {
                    // stopped due to hitting a breakpoint
                    // signal event to listeners

                    const breakpoint = this._activeBreakpoint;

                    if (breakpoint.isBasic) {

                        this.readMemory(0x39, 0x3e).then((mem) => {
                            const currentLineNumber = mem[1] != 0xff ? mem[0] + (mem[1]<<8) : 0;
                            const currentStatement = mem[4] + (mem[5]<<8) + 1;

                            if (breakpoint.basicBreakpoints) {

                                if (currentLineNumber == 0 || currentStatement < 0x801) {
                                    vice.cmdExit();
                                    return
                                }

                                let hitBreakpoint = null;

                                if (!stepMode) {
                                    for (const basicBreakpoint of breakpoint.basicBreakpoints) {
                                        if (basicBreakpoint.address == currentStatement) {
                                            hitBreakpoint = basicBreakpoint;
                                            break;
                                        }
                                    }
                                } else {
                                    hitBreakpoint = debugInfo.getAddressInfo(currentStatement);
                                }

                                if (null == hitBreakpoint) {
                                    vice.cmdExit();
                                    return;
                                }

                                this._stopped = true;
                                const basicBreakpoint = {
                                    isBasic: true,
                                    address: currentStatement,
                                    basicLine: currentLineNumber,
                                    source: hitBreakpoint.source,
                                    line: hitBreakpoint.line
                                }

                                this.fireEvent('breakpoint', basicBreakpoint);
                                this.fireEvent('stopped', DebugInterruptReason.BREAKPOINT);
                                this._activeBreakpoint = null;
                            } else {
                                // end of program or BREAK or ERROR
                                if (currentLineNumber != 0 || currentStatement != 0x801) {
                                    this._stopped = true;
                                    this.fireEvent('stopped', DebugInterruptReason.EXIT);
                                    this._activeBreakpoint = null;
                                } else {
                                    this._stopped = false;
                                    this._activeBreakpoint = null;
                                    vice.cmdExit();
                                }

                            }
                        });
                    } else {
                        this._stopped = true;
                        this.fireEvent('breakpoint', breakpoint);
                        this.fireEvent('stopped', DebugInterruptReason.BREAKPOINT);
                        this._activeBreakpoint = null;
                    }
                } else {
                    // any command after initialization (during emulation run)
                    // will trigger a "stopped" event, we have to immediately
                    // resume to continue execution (as this is different to
                    // manual terminal/monitor interaction)

                    if (this._stopped) {
                        this._stopped = false;
                        vice.cmdExit();
                    }
                }
            }

        } else if (event.type == RequestType.RESPONSE_CHECKPOINT) {

            this.#invalidateMemoryCache();

            const checkpoint = event.checkpoint;
            if (checkpoint.currentlyHit) {
                if (this._initialized && !this._stopped) {
                    const session = this._session;
                    const breakpoints = session._breakpoints;
                    const addr = checkpoint.startAddr;
                    const breakpoint = breakpoints.findByAddress(addr);
                    if (breakpoint) {
                        this._activeBreakpoint = breakpoint;
                    } else {
                        if (!session.isBasic) {
                            this._activeBreakpoint = new Breakpoint(
                                checkpoint.startAddr, null,
                                null, 0, null
                            );
                        } else {
                            this._activeBreakpoint = null;
                        }
                    }
                }
            } else {
                logger.debug("not hit checkpoint");
            }

        } else if (event.type == RequestType.RESPONSE_RESUMED) {
            this._stopped = false;
        } else if (event.type == RequestType.CMD_REGISTERS_GET) {
            // do nothing
        } else {
            logger.trace("vice event: " + Utils.formatHex(event.type, 2, "0x"));
        }
    }

    #invalidateMemoryCache() {
        //logger.debug("invalidate memory cache");
        this._memoryCache = null;
    }

    async #getMemoryCache() {
        //logger.debug("get memory cache");

        const vice = this._vice;
        if (!vice) return null;

        if (this._memoryCache) {
            return this._memoryCache;
        }

        const result = await vice.cmdMemoryGet(0x0, 0xffff);
        if (!result) return null;

        this._memoryCache = result.memory;

        return this._memoryCache;
    }

    async readMemory(startAddress, endAddress, _memoryType_) {
        const memCache = await this.#getMemoryCache();
        if (!memCache) return null;

        if (startAddress == 0 && endAddress + 1 == memCache.length) {
            // no need to get a clone, directly use the cache
            return memCache;
        }

        const mem = memCache.subarray(startAddress, endAddress+1);
        return mem;
    }

    async writeMemory(startAddress, endAddress, data) {
        const vice = this._vice;
        if (!vice) return;

        endAddress = endAddress || startAddress;

        if (this._memoryCache) {
            // immediately update cache
            const len = endAddress + 1 - startAddress;
            for (let i=0; i<len; i++) {
                this._memoryCache[startAddress+i] = data[i];
            }
        }

        await vice.cmdMemorySet(startAddress, endAddress, 0x0, false, data);
    }

    async read(addr, size) {

        const memCache = await this.#getMemoryCache();
        if (!memCache) return null;

        let val = 0x0;

        if (size > 1) {
            val = (memCache[addr]&0xff) + (memCache[addr+1]<<8);
        } else {
            val = memCache[addr]&0xff;
        }

        return val;
    }

    async write(_addr_, _value_) {
        logger.warn("memory write not implemented for VICE debugger");

        const vice = this._vice;
        if (!vice) return;
    }

    async setBreakpoints(breakpoints) {

        const vice = this._vice;
        if (!vice) return;

        const wasStopped = this._stopped;

        // delete all checkpoints
        const checkpointList = await vice.cmdCheckpointList();
        if (checkpointList && checkpointList.checkpoints) {
            let id = null;
            for (const checkpoint of checkpointList.checkpoints) {
                if (null == id) id = checkpoint.checkpointNumber;
                const addr = checkpoint.startAddr;
                if (breakpoints.findByAddress(addr) == null) {
                    await vice.cmdCheckpointDelete(checkpoint.checkpointNumber)
                    .then(() => {
                        logger.info("deleted checkpoint: " + checkpoint.checkpointNumber)
                    })
                    .catch((_err_) => {
                        logger.warn("failed to delete checkpoint: " + checkpoint.checkpointNumber)
                    });
                } else {
                    id++;
                }
            }
        }

        for (const breakpoint of breakpoints.elements) {
            let exists = false;
            if (checkpointList && checkpointList.checkpoints) {
                for (const checkpoint of checkpointList.checkpoints) {
                    if (checkpoint.startAddr >= breakpoint.address &&
                        checkpoint.endAddr <= breakpoint.address_end + 1) {
                        exists = true;
                    }
                }
            }

            if (!exists) {
                logger.info("set breakpoint: " + breakpoint.address);
                const result = await vice.cmdCheckpointSet(
                    breakpoint.address,
                    breakpoint.address_end+1
                );
                if (!result) break;
            }

        }

        this._stopped = wasStopped;
        if (!wasStopped) {
            vice.cmdExit(); // restart if not in stopped mode
        }

    }

    async start() {

        this._initialized = false;
        this._activeBreakpoint = null;
        this._runFlags = null;

        this.#invalidateMemoryCache();

        super.start();

        const vice = this._vice;
        if (!vice) return;

        this._initialized = true;

        this.resume();

    }

    async resume() {
        this._activeBreakpoint = null;
        this._runFlags = null;

        this.#invalidateMemoryCache();

        const vice = this._vice;
        if (!vice) return;

        this._stopped = false;
        vice.cmdExit();

        this.fireEvent('started');
    }

    async pause() {
        this._stopped = true;
        this._activeBreakpoint = null;
        this._runFlags = null;

        this.#invalidateMemoryCache();

        super.stop();

        const vice = this._vice;
        if (!vice) return;

        this._runFlags = {
            pauseRequest: true,
            debugStepType: DebugStepType.STEP_IN
        };

        await vice.cmdRegistersGet(); // dummy command to activate monitor
    }

    async stop() {
        this._initialized = false;
        this._stopped = true;
        this._activeBreakpoint = null;
        this._runFlags = null;

        this.#invalidateMemoryCache();

        const vice = this._vice;
        if (!vice) return;

        this._stopped = false;

        if (vice.isConnected()) {
            vice.cmdExit();
        }

        super.stop();
    }

    async do_step(debugStepType) {

        this.#invalidateMemoryCache();

        this._activeBreakpoint = null;

        const cpuState = this.getCpuState();
        const pc = cpuState.cpuRegisters.PC;

        const session = this._session;
        const debugInfo = session._debugInfo;

        this._runFlags = {
            debugStepType: debugStepType,
            stepStartAddress: debugInfo.getAddressInfo(pc)
        }

        logger.trace("ViceConnector.step()");
        const vice = this._vice;

        this._initialized = true;

        if (this._basicMode) {
            await vice.cmdExit();
        } else if (debugStepType == DebugStepType.STEP_OUT) {
            await vice.cmdExecuteUntilReturn();
        } else {
            let stepOverSubroutines = true;
            if (debugStepType == DebugStepType.STEP_IN) {
                stepOverSubroutines = false;
            }
            await vice.cmdAdvanceInstructions(stepOverSubroutines, 1);
        }

    }

    async loadProgram(filename, _autoOffsetCorrection_, _forcedStartAddress_) {
        logger.trace("ViceConnector.loadProgram()");

        this.#invalidateMemoryCache();

        const vice = this._vice;
        if (!vice) return;

        this.init();

        await vice.cmdReset();
        await vice.cmdAutostart(filename, true);

    }

    getCpuState() {
        logger.trace("ViceConnector.getCpuState()");

        const vice = this._vice;
        if (!vice) return null;

        return vice.getState();
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    ViceProcess: ViceProcess
}
