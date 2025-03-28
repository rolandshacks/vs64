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
        this.isOscar64 = (name == "oscar64");
        this.isLLVM = (name == "llvm");
        this.isBasic = (name == "basic");

        this.isCpp = (this.isLLVM || this.isCC65 || this.isOscar64);
        this.isAssembler = (this.isAcme || this.isKick);

        this.hasProblemMatcher = (this.isOscar64 || this.isKick);
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
