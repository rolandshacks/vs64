/**
 * View
 * @module Web
 */

/**
 * Factory.
 */
class Factory {
    static register(classOrClassname, createInstanceFn) {
        if (typeof classOrClassname == "string") {
            if (null == createInstanceFn) {
                throw "Create instance function missing for  class '" + classOrClassname + "'";
            }
            Factory.classMap.set(classOrClassname, createInstanceFn);
        } else {
            const createFn = classOrClassname.createInstance||createInstanceFn;
            if (null == createFn) {
                throw "Create instance method or function missing for  class '" + classOrClassname.ClassName + "'";
            }
            Factory.classMap.set(classOrClassname.ClassName, createFn);
        }
    }

    static createInstance(classname, ...args) {

        const createInstanceFn = Factory.classMap.get(classname);
        if (null == createInstanceFn) {
            throw "Unknown class '" + classname + "'";
        }

        const instance = createInstanceFn(...args);
        if (null == instance) {
            throw "Failed to create instance of class '" + classname + "'";
        }

        return instance;
    }
}

Factory.classMap = new Map();

export {
    Factory
};
