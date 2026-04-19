//
// Disk
//

const fs = require('fs');

const { VirtualDeviceIO } = require('./device');

//-----------------------------------------------------------------------------------------------//
// Disk IO
//-----------------------------------------------------------------------------------------------//

class DeviceIO extends VirtualDeviceIO {
    writeFile(filename, buffer) {
        fs.writeFileSync(filename, buffer, 'binary');
    }

    readFile(filename) {
        return fs.readFileSync(filename);
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    DeviceIO: DeviceIO
};
