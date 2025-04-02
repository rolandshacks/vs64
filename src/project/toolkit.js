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

        this.builtInDefines = null;

        this.#init();
    }

    #init() {
        if (null == this.name) return;

        switch (this.name) {
            case "acme":
                this.builtInDefines = [ "__acme__"];
                break;
            case "kick":
                this.builtInDefines = [ "__kick__"];
                break;
            case "llvm":
                this.builtInDefines = [ "__llvm__", "__clang__"];
                break;
            case "cc65":
                this.builtInDefines = [ "__cc65__"];
                break;
            case "oscar64":
                this.builtInDefines = [ "__oscar64__"];
                break;
            case "basic":
                this.builtInDefines = [ "__basic__"];
                break;
            default:
                break;
        }

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
