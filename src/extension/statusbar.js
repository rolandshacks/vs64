//
// Status Bar Item
//

const vscode = require('vscode');
//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

//-----------------------------------------------------------------------------------------------//
// Status Bar
//-----------------------------------------------------------------------------------------------//

class StatusBar {
    constructor(context) {
        this._context = context;
    }

    subscribe() {
        const context = this._context;
        if (!context) return;

        const subscriptions =  context.subscriptions;
        if (!subscriptions) return;

        const typeList = [
            "StatusBarItem",
            "StatusBarButton",
            "StatusBarNotifier"
        ];

        for (const value of Object.values(this)) {
            if (value == null || value.constructor == null) continue;

            const typeName = value.constructor.name;
            if (!typeName) continue;

            if (typeList.indexOf(typeName) >= 0) {
                subscriptions.push(value);
            }
        }
    }

}

StatusBar.AlignLeft = -1;
StatusBar.AlignNone = 0;
StatusBar.AlignRight = 1;

//-----------------------------------------------------------------------------------------------//
// Status Bar Item
//-----------------------------------------------------------------------------------------------//

class StatusBarItem {
    constructor(commandId, options) {
        this._commandId = commandId;
        this._options = options||{};
        this._item = null;
        this._timerHandle = null;

        this.#create();
    }

    get item() { return this._item; }
    get options() { return this._options; }

    setText(text) {
        const options = this._options;
        options.text = text;
        this.#refresh(true);
    }

    setIcon(icon) {
        const options = this._options;
        options.icon = icon;
        this.#refresh(true);
    }

    setAnimation(animation) {
        const options = this._options;
        options.animation = animation;
        this.#refresh(true);
    }

    setSpinning(spinning) {
        const options = this._options;
        options.spinning = spinning;
        this.#refresh(true);
    }

    setTooltip(tooltip) {
        const options = this._options;
        options.tooltip = tooltip;
        this._item.tooltip = tooltip;
    }

    refresh() {
        this.#refresh();
    }

    show(show) {
        const item = this._item;
        if (show == null || show == true) item.show(); else item.hide();
    }

    hide() {
        this.show(false);
    }

    onCreate() {
        // default action: none
    }

    onTimer() {
        // default action: none
    }

    #create() {

        const options = this._options;

        const alignment = (
            options.alignment == StatusBar.AlignRight ?
            vscode.StatusBarAlignment.Right :
            vscode.StatusBarAlignment.Left
        );

        const priority = (
            options.priority != null ? options.priority :
            (alignment == vscode.StatusBarAlignment.Left ? -999999 : 1000)
        );

        const item = vscode.window.createStatusBarItem(alignment, priority);
        this._item = item;

        item.command = this._commandId;
        item.tooltip = options.tooltip;

        this.onCreate();

        this.#refresh(true);
    }

    #refresh(resetTimer) {
        this.#clearTimer();

        const item = this._item;
        item.text = this.#formatText();
        if (!item.text) {
            this.hide();
            return;
        }

        item.show();

        if (resetTimer) {
            this.#setTimer();
        }
    }

    #formatText() {
        const options = this._options;

        let text = "";

        if (options.spinning) {
            text += "$(sync~spin)";
        } else if (options.icon) {
            text += "$(" + options.icon;
            if (options.animation) text += "~" + options.animation;
            text += ")";
        }

        if (options.text) text += (text == "" ? "" : " ") + options.text;

        if (text.length < 1) return null;

        return text;
    }

    #setTimer() {
        const options = this._options;
        if (!options.timer) return;
        const timerDelay = options.timer;

        const thisInstance = this;
        setTimeout(() => {
            thisInstance.#clearTimer();
            thisInstance.onTimer();
        },  timerDelay);
    }

    #clearTimer() {
        if (this._timerHandle) {
            clearTimeout(this._timerHandle);
            this._timerHandle = null;
        }
    }

}

//-----------------------------------------------------------------------------------------------//
// Status Bar Button
//-----------------------------------------------------------------------------------------------//

class StatusBarButton extends StatusBarItem {
    constructor(commandId, options) {

        options ||= {};
        options.priority ||= 999999;
        options.alignment ||= StatusBar.AlignLeft;

        //options.timer ||= 5000;

        super(commandId, options);

        //this._item.color = new vscode.ThemeColor("statusBarItem.warningForeground");
        //this._item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");

        this._item.show();
    }

    onTimer() {
        const options = this.options;
        options.animation = null;
        this.refresh();
    }
}

//-----------------------------------------------------------------------------------------------//
// Status Bar Notifier
//-----------------------------------------------------------------------------------------------//

class StatusBarNotifier extends StatusBarItem {
    constructor(commandId) {
        super(commandId, {
            alignment: StatusBar.AlignRight,
            priority: 1000,
            timer: 3000
        });
    }

    onTimer() {
        this.hide();
    }

}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    StatusBar: StatusBar,
    StatusBarNotifier: StatusBarNotifier,
    StatusBarButton: StatusBarButton
};
