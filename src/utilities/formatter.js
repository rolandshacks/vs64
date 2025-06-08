//
// Formatter
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

const { Utils } = require('utilities/utils');

//-----------------------------------------------------------------------------------------------//
// Formatter
//-----------------------------------------------------------------------------------------------//

let Formatter = {
    formatValue: function(value, plain) {
        return Formatter.formatU16(value, plain);
    },

    formatAddress: function(value, plain) {
        return Formatter.formatU16(value, plain);
    },

    formatBit: function(value, plain) {
        if (plain) return (0 == value) ? "0" : "1";
        return (0 == value) ? "0 (unset)" : "1 (set)";
    },

    formatBitset: function(value, len, plain) {
        if (null == len || len == 0) len = 8;
        if (plain) return "%" + Utils.fmt(value.toString(2), len);
        return "%" + Utils.fmt(value.toString(2), len) + " ($" + Utils.fmt(value.toString(16), len/4) + ")";
    },

    formatBool: function(value) {
        return (0 == value) ? "false" : "true";
    },

    formatU4: function(value, plain) {
        if (plain) return "$" + Utils.fmt(value.toString(16), 1);
        return "$" + Utils.fmt(value.toString(16), 1) + " (" + value.toString() + ")";
    },

    formatU8: function(value, plain) {
        if (plain) return "$" + Utils.fmt(value.toString(16), 2);
        return "$" + Utils.fmt(value.toString(16), 2) + " (" + value.toString() + ")";
    },

    formatU8dec: function(value, plain) {
        if (plain) return value.toString();
        return value.toString() + " ($" + Utils.fmt(value.toString(16), 2) + ")";
    },

    formatU16: function(value, plain) {
        if (plain) return "$" + Utils.fmt(value.toString(16), 4);
        return "$" + Utils.fmt(value.toString(16), 4) + " (" + value.toString() + ")";
    },

    formatU16dec: function(value, plain) {
        if (plain) return value.toString();
        return value.toString() + " ($" + Utils.fmt(value.toString(16), 4) + ")";
    },

    formatU32: function(value, plain) {
        if (plain) return "$" + Utils.fmt(value.toString(16), 8);
        return "$" + Utils.fmt(value.toString(16), 8) + " (" + value.toString() + ")";
    },

    formatU32dec: function(value, plain) {
        if (plain) return value.toString();
        return value.toString() + " ($" + Utils.fmt(value.toString(16), 8) + ")";
    },

    formatMemory: function(mem, ofs, num, elementSize, prefix, separator) {
        return Utils.formatMemory(mem, ofs, num, elementSize, prefix, separator);
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Formatter: Formatter
};
