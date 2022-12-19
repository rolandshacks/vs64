// eslint-disable-next-line
const vscode = acquireVsCodeApi();

class DisassemblyView {
    constructor() {
        this._content = document.getElementById("idContent");   // eslint-disable-line no-undef
        if (!this._content) {
            throw("content element not fount");
        }

        const instance = this;

        window.addEventListener('message', async e => {         // eslint-disable-line no-undef
            const message = e.data;
            if (message) {
                const type = message.type;
                if (type == 'init') {
                    //console.log("INIT");
                    instance.setContent(message.html);
                } else if (type == 'update') {
                    //console.log("UPDATE");
                    instance.setContent(message.html);
                }
            }
        });

        vscode.postMessage({ type: 'ready' });
    }

    setContent(content) {
        this._content.innerHTML = content||"";
    }

}

let view = null;

function __init() {
    view = new DisassemblyView();
}

if (window) {                      // eslint-disable-line no-undef
    window.onload = function() {   // eslint-disable-line no-undef
        //console.log("ONLOAD");
        __init();
    }
} else {
    __init();
}
