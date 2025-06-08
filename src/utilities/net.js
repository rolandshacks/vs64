//
// Networking
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
const logger = new Logger("Net");

//-----------------------------------------------------------------------------------------------//
// ClientSocket
//-----------------------------------------------------------------------------------------------//

class ClientSocket {
    constructor(listener) {
        this._instanceId = ++ClientSocket.instanceId;

        this._listener = listener;
        this._socket = null;
        this._disconnecting = false;
        this._destroyed = false;
    }

    get disconnecting() {
        return this._disconnecting;
    }

    destroy() {
        this.disconnect();
    }

    async connect(hostname, port, timeout) {

        if (this._destroyed) {
            return;
        }

        // capture *this
        const instance = this;

        // init state
        this._destroyed = false;
        this._disconnecting = false;

        // create socket
        this._socket = new net.Socket();
        const socket = this._socket;

        // state and error indicators
        let connected = false;
        let fatalError = null;

        // register data receiver
        socket.on('data', (data) => {
            instance.onData(data);
        });

        const connectCloseEventListener = () => {};

        const connectErrorEventListener = (err) => {
            if (err.code == 'ECONNREFUSED') {
                logger.trace("peer not ready when trying to connect: " + err);
            } else {
                logger.trace("error while trying to connect: " + err);
                if (err.code == 'ENOENT' || err.code == 'ENOTFOUND') {
                    fatalError = err;
                }
            }

        };

        const connectConnectedEventListener = () => {
            logger.trace("connected");
            connected = true;
        };

        // register initial listeners (during connect)
        socket.on('close', connectCloseEventListener);
        socket.on('error', connectErrorEventListener);
        socket.on('connect', connectConnectedEventListener)

        // connect loop with timeout/retries
        let retryCount = (timeout * 1000) / 250;
        while (!connected && !fatalError) {
            logger.trace("socket connect (instance: " + instance._instanceId + ")");

            socket.connect(port, hostname);
            if (retryCount <= 0) break;
            retryCount--;
            await Utils.sleep(250);
        }

        // check errors
        if (!connected || fatalError) {
            socket.destroy();
            throw("failed to connect to emulator process" + (fatalError ? ": " + fatalError : ""));
        }

        logger.trace("socket connected (instance: " + instance._instanceId + ")");

        // set socket mode
        socket.setNoDelay(true);

        // unregister initial listeners
        socket.off('close', connectCloseEventListener);
        socket.off('error', connectErrorEventListener);

        // register operational listeners

        socket.on('close', () => {
            logger.trace("socket onclose (instance: " + instance._instanceId + ")");
            instance.onClose();
        });

        socket.on('error', (e) => {
            logger.trace("socket onerror (instance: " + instance._instanceId + ")");
            logger.error(e);
            instance.onClose();
            instance.fireError(e);
        });

    }

    disconnect() {
        if (this._destroyed || this._disconnecting) {
            return;
        }

        logger.trace("socket disconnect (instance: " + this._instanceId + ")");

        this._disconnecting = true;
        this._destroyed = true;

        const socket = this._socket;
        this._socket = null;

        if (null != socket) {
            // destroy TCP socket
            logger.trace("socket destroy (instance: " + this._instanceId + ")");
            socket.destroy();
        }
    }

    write(data) {
        if (this._destroyed || this._disconnecting) {
            return;
        }

        this._socket.write(data);
    }

    onData(data) {
        if (this._listener && !this._destroyed && !this._disconnecting) {
            this._listener.onData(data);
        }
    }

    onClose() {
        if (this._destroyed || this._disconnecting) {
            return;
        }

        if (this._listener && !this._destroyed) {
            this._listener.onClose();
        }

        this.disconnect();
    }

    fireError(e) {
        if (this._listener && !this._destroyed) {
            this._listener.fireError(e);
        }
    }

}

ClientSocket.instanceId = 0;

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    ClientSocket: ClientSocket
};
