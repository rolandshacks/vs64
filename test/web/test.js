/**
 * Test helper
 * @module Web
 *
 */

//import { testData } from "./sidtestdata.js";
import { testData } from "./ctmtestdata.js";
//import { testData } from "./ctmtiletestdata.js";
//import { testData } from "./ctmhirestestdata.js";
//import { testData } from "./spdtestdata.js";

const TEST_DATA_TYPE = "ctm";

let _testenv = null;

/**
 * Test environment.
 */
class TestEnvironment {
    constructor(app) {
        this._app = app;
        this._data = testData;
        this.init();
    }

    static get instance() { return _testenv; }
    get app() { return this._app; }
    get data() { return this._data; }

    init() {
        const app = this.app;
        const data = this.data;
        const name = "testdata." + TEST_DATA_TYPE;

        const content = {
            name: name,
            uri: { path: "/folder/" + name },
            data: data,
            html: null,
            text: null,
            json: null
        };

        app.createView();
        app.setContent(content);
    }

}

// mock-up content message
function testMain(app) {
    _testenv = new TestEnvironment(app);
}

export {
    testMain
};
