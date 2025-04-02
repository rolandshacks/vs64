//
// Sorted Array
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Logger } = require('utilities/logger');
const logger = new Logger("Cache");

//-----------------------------------------------------------------------------------------------//
// Sorted Array
//-----------------------------------------------------------------------------------------------//

class SortedArray {

    constructor(options) {
        this._options = options;

        this._less = options ? options.less : null;
        this._key = options ? options.key : null;

        this._min = null;
        this._max = null;
        this._elements = [];
    }

    [Symbol.iterator]() {
        var index = -1;
        var data  = this._elements;

        return {
          next: () => ({ value: data[++index], done: !(index in data) })
        };
    };

    #less(a, b) {
        if (null == a) return (b != null);
        if (null == b) return false;
        if (this._less) {
            return this._less(a, b);
        } else {
            return (this.#key(a) < this.#key(b));
        }
    }

    #key(a) {
        if (null == a) return null;
        if (this._key) {
            const k = this._key(a);
            return (k != null) ? k : a;
        } else {
            return a;
        }
    }

    #compare(a, b) {
        if (null == a && null == b) return true;
        if (null == a || null == b) return false;

        const key_a = this.#key(a);
        const key_b = this.#key(b);

        return this.#compareRaw(key_a, key_b);
    }

    #compareRaw(a, b) {
        if (null == a && null == b) return true;
        if (null == a || null == b) return false;

        if (a < b) {
            return -1;
        } else if (a > b) {
            return 1;
        } else {
            return 0;
        }
    }

    get length() {
        return this._elements.length;
    }

    get elements() {
        return this._elements;
    }

    get(idx) {
        if (this.length < 1) return null;
        return this._elements[idx];
    }

    clear() {
        this._elements.length = 0;
    }

    indexOf(element) {
        if (null == element) return -1;
        const element_key = this.#key(element);
        return this.#binarySearch(element_key);
    }

    findKey(key) {
        const idx = this.#indexOfKey(key);
        if (-1 == idx) return null;
        return this.get(idx);
    }

    #indexOfKey(key) {
        return this.#binarySearch(key);
    }

    #binarySearch(element_key) {
        // perform binary search

        if (null == element_key) return -1;

        const elements = this._elements;
        const len = elements.length;

        let l = 0;
        let r = len-1;
        let m = 0;

        let foundPos = -1;

        while (l <= r) {
            m = Math.floor((l+r)/2);
            let e = elements[m];
            let key_e = this.#key(e);
            const comp = this.#compareRaw(element_key, key_e);
            if (comp == 0) {
                foundPos = m;
                break;
            } else if (comp < 0) {
                r = m - 1;
            } else {
                l = m + 1;
            }
        }

        return foundPos;
    }

    #indexOfEqualOrMore(element) {

        if (!this._min || this.#less(element, this._min)) {
            return 0;
        }

        if (!this._max || !this.#less(element, this._max)) {
            return -1;
        }

        const elements = this._elements;
        const len = elements.length;

        // perform binary search

        let l = 0;
        let r = len-1;
        let m = 0;

        while (r - l > 2) {
            m = Math.floor((l+r)/2);
            let e = elements[m];

            if (this.#less(element, e)) {
                r = m - 1;
            } else {
                l = m;
            }
        }

        let foundPos = -1;

        while (l < len) {
            const e = elements[l];
            if (!this.#less(e, element)) {
                foundPos = l;
                break; // equal or bigger than existing, found position
            }
            ++l;
        }

        return foundPos;

    }

    push(element) {

        let pos = null;

        if (!this._min || this.#less(element, this._min, element)) {
            this._min = element;
            pos = 0;
        }

        if (!this._max || !this.#less(element, this._max)) {
            this._max = element;
            pos = -1;
        }

        if (null == pos) {
            pos = this.#indexOfEqualOrMore(element);
        }

        if (pos >= 0) {
            // insert
            this._elements.splice(pos, 0, element);
        } else {
            // append
            this._elements.push(element);
        }

        return element;
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    SortedArray: SortedArray
};
