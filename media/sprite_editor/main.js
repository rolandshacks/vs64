//
// Sprite editor
//

let vscode = null;
let devMode = false;

try {
    // eslint-disable-next-line
    vscode = acquireVsCodeApi();
} catch (err) {
    devMode = true;
    vscode = {
        postMessage: function(obj) {
            console.log("postMessage");
        }
    };
}

let editor = null;

function __init() {

    editor = new Editor();

    if (devMode) {
        const sprite = new Sprite();
        sprite.setPixelData(spriteData);
        editor.setData(sprite);
    }
}

if (window) {                      // eslint-disable-line no-undef
    window.onload = function() {   // eslint-disable-line no-undef
        //console.log("ONLOAD");
        __init();
    }
} else {
    __init();
}
