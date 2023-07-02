//
// Toolkit
//

//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

class Toolkit {
    constructor(name) {

        this.name = name;

        this.isAcme = (name == "acme");
        this.isKick = (name == "kick");
        this.isCC65 = (name == "cc65");
        this.isLLVM = (name == "llvm");

        this.isCpp = (this.isCC65 || this.isLLVM);
        this.isAssembler = (this.isAcme || this.isKick);
    }

    static fromName(name) {
        return new Toolkit(name);
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Toolkit: Toolkit
}
