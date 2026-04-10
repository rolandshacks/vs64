/**
 * Test bench
 * @module Web
 *
 */

import { Application } from "./app.js";

const TestData = {
    //PRG_FILE: "test/data/test.prg",
    //MEDIA_FILE: "test/res/spritemate.spm",
    //MEDIA_FILE: "test/res/spritepad1.spd",
    MEDIA_FILE: "test/res/charset.ctm",
    //MEDIA_FILE: "test/res/charset_big.ctm",
    //MEDIA_FILE: "test/res/testmusic.sid"
};

/**
 * Test environment.
 */
class TestBench extends Application {
    constructor(config) {
        super(config);
    }

    async loadFile(filename, toHtml) {
        const uri = "../../" + filename;

        let ext = "";
        const pos = uri.lastIndexOf('.');
        if (pos >= 0) ext = uri.substring(pos+1).toLowerCase();
        const isBinary = (ext != "spm");

        const response = await fetch(uri)

        let data = null;

        if (isBinary) {
            const blob = await response.blob();
            data = await blob.bytes();
        } else {
            data = await response.text();
        }

        let html = null;
        if (toHtml) {
            html = "";
            html += "<p>File</p>";
            html += "<p>Size: " + data.length + " bytes</p>";

            if (ext == "prg") {
                html += "<p>Start Address: $" + (data[0] + data[1]*256).toString(16) + "</p>";
            }
        }

        const content = {
            name: filename,
            uri: { path: uri },
            data: (isBinary) ? data : null,
            html: html,
            text: (isBinary) ? null : data,
            json: null
        };

        this.createView();
        this.setContent(content);
    }

    run() {
        const name = this.name.toLowerCase();
        let filename = null;
        if (name == "mediaview") {
            this.loadFile(TestData.MEDIA_FILE);
        } else if (name == "disassembly") {
            this.loadFile(TestData.PRG_FILE, true);
        }
    }
}

export {
    TestBench
};
