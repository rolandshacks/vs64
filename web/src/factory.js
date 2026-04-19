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

        if (null == classname) return null;

        let createInstanceFn = null;

        let tryName = classname;
        while (tryName.length > 0) {
            createInstanceFn = Factory.classMap.get(tryName);
            if (null != createInstanceFn) break;

            const separator = tryName.lastIndexOf('.');
            if (separator < 0) break;

            tryName = tryName.substring(0, separator);
        }

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
