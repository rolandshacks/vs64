//
// MediaFile
//

const { MediaType, MediaClassId } = require('./mediatype');
const { BufferedReader } = require('./buffered_reader');

class MediaFile {
    constructor(name, data) {
        this._mediaType = MediaType.UNKNOWN;
        this._mediaClass = MediaType.classFromType(this._mediaType);
        this._name = name;
        this._data = data;
        this._reader = null;
        this._properties = new Map();
    }

    unpack() {}

    update(name, data) {
        this._name = name;
        this._data = data;
        this._reader = null;
        this._properties.clear();
    }

    get mediaType() { return this._mediaType; }
    get mediaClass() { return this._mediaClass || ""; }
    get name() { return this._name; }
    get data() { return this._data; }
    get properties() { return this._properties; }

    setMediaClass(mediaClass) {
        this._mediaClass = mediaClass;
    }

    getReader() {
        if (null == this._reader) {
            this._reader = new BufferedReader(this._data);
        }
        return this._reader;
    }

    makeKey(key) {
        let k = "";
        for (const c of key) {
            if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) k += c;
            else if (c >= 'A' && c <= 'Z') k += c.toLowerCase();
        }
        return k;
    }

    set(key, value, label=null, special=false) {
        const k = this.makeKey(key);
        const v = {
            key: k,
            value: value,
            label: label || key,
            special: special
        }
        this._properties.set(k, v);
    }

    get(key, defaultValue = null) {
        const k = this.makeKey(key);
        const v = this._properties.get(k);
        if (null == v) return defaultValue;
        return v.value;
    }

    entry(key) {
        return this._properties.get(key);
    }
}

MediaFile.ClassName = MediaClassId.UNKNOWN;

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    MediaFile: MediaFile,
    MediaType: MediaType
};
