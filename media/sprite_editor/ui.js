//
// Editor user interface components
//

class Event {
    constructor(event, source, args) {
        this._event = event;
        this._source = source;
        this._args = args;
    }

    get event() { return this._event; }
    get source() { return this._source; }
    get args() { return this._args; }
}

class EventSource {
    constructor() {
        this._element = null;
        this._eventMap = null;
        this._customEventList = null;
    }

    on(event, fn) {
        this.addEventListener(event, fn);
    }

    addEventListener(event, fn) {
        if (this.isCustomEvent(event)) {
            this.addCustomEventListener(event, fn);
        } else {
            this._element.addEventListener(event, fn);
        }
    }

    removeEventListener(event, fn) {
        if (this.isCustomEvent(event)) {
            this.removeCustomEventListener(event, fn);
        } else {
            this.element.removeEventListener(event, fn);
        }
    }

    declareCustomEvents(customEvents) {
        this._customEventList = customEvents;
    }

    isCustomEvent(event) {
        if (!this._element) return true;
        return (this._customEventList && this._customEventList.indexOf(event) >= 0);
    }

    addCustomEventListener(event, fn) {
        if (null == this._eventMap) {
            this._eventMap = new Map();
        }

        const eventList = this._eventMap.get(event);
        if (eventList) {
            eventList.push(fn);
        } else {
            this._eventMap.set(event, [ fn ]);
        }
    }

    removeCustomEventListener(event, fn) {
        if (null == this._eventMap) return;

        const eventList = this._eventMap.get(event);
        if (eventList) {
            const idx = eventList.indexOf(event);
            if (idx >= 0) eventList.splice(idx, 1);
            if (eventList.length == 0) this._eventMap.delete(event);
        }

        if (this._eventMap.size == 0) this._eventMap = null;
    }

    fireEvent(event) {
        if (null == this._eventMap) return;

        const args = Array.prototype.slice.call(arguments, 1);
        const eventObject = new Event(event, this, args);

        const eventList = this._eventMap.get(event);
        if (eventList) {
            for (const fn of eventList) {
                fn(eventObject, ...args);
            }
        }
    }

}

class UiElement extends EventSource {
    constructor(elementId, parent, index) {
        super();

        this._id = elementId;
        this._uid = Utils.getUid();
        this._index = index;
        this._parent = parent;

        if (elementId) {
            this._element = document.getElementById(elementId); // eslint-disable-line no-undef
            if (!this._element) {
                throw("element not found: " + elementId);
            }
        } else {
            this._element = null;
        }

        this._propertyName = this.getPropertyName();

        this.fetchValue();
    }

    get id() { return this._id; }
    get parent() { return this._parent; }
    get index() { return this._index || 0; }
    get propertyName() { return this._propertyName; }

    static fromHtmlElement(element, parent, index) {
        const e = new UiElement(null, parent, index);
        e.setDomElement(element);
        return e;
    }

    hasValue() { return (this._value != null); }
    get value() { return this._value; }

    setDomElement(element) {
        this._element = element;
        this.fetchValue();
    }

    getPropertyName() {
        const element = this._element;
        if (!element || !element.attributes) return null;

        const attribute = element.attributes["data-property"];
        if (!attribute || !attribute.nodeValue) return null;

        return attribute.nodeValue;
    }

    fetchValue() {
        const element = this.element;

        let value = this.getElementValue(element);

        if (value == null || value == '') {
            if (this._index != null) value = this._index;
        }

        this._value = value;
    }

    getElementValue(element) {
        if (!element) return null;

        let value = element.value;
        if (value == null || value == '') {
            if (element.innerText && element.innerText.length > 0) {
                value = element.innerText;
            }
        }

        if (value == null || value == '') {
            value = element.id;
        }

        return value;
    }

    equals(e) {
        return (this._uid == e._uid);
    }

    get uid() {
        return this._uid;
    }

    get type() {
        if (this._element) return null;
        const nodeName = this._element.nodeName;
        if (!nodeName) return null;
        return nodeName.toLowerCase();
    }

    get element() { return this._element; }
    get parent() { return this._parent; }

}

class Window extends UiElement {
    constructor() {
        super();
        this._element = window;
    }

    get devicePixelRatio() {
        return this._element.devicePixelRatio||1.0;
    }

}

class Toolbar extends UiElement {
    constructor(elementId) {
        super(elementId);

        this._value = null;
        this._currentElement = null;

        this.declareCustomEvents([ "change", "click", "longclick" ]);

        const thisInstance = this;

        this._children = null;

        const element = this._element;
        if (element) {

            element.oncontextmenu = function(e) {
                e.preventDefault();
            }

            this.registerButtons(element);

            if (this._children != null) {
                for (let child of this._children) {
                    const eventObject = child;
                    const childElement = child.element;

                    childElement.onmousedown = function(event) {
                        thisInstance.onMouseDown(eventObject, event);
                    }

                    childElement.onmouseup = function(event) {
                        thisInstance.onMouseUp(eventObject, event);
                    }

                    /*
                    childElement.onclick = function(event) {
                        thisInstance.onClick(eventObject, event);
                    }
                    */

                }
            }
        }

        this.select(null);
    }

    registerButtons(parent) {
        if (!parent) return;
        if (!parent.children || parent.children.length == 0) return;

        for (const child of parent.children) {
            if (child.nodeName == "BUTTON") {
                if (null == this._children) this._children = [];
                const childElement = UiElement.fromHtmlElement(child, null, this._children.length);
                this._children.push(childElement);
            } else {
                this.registerButtons(child);
            }
        }

    }

    hasValue() { return (this._value != null); }
    get value() {
        return this._value;
    }

    setValue(value) {
        if (value == this._value) return;
        const child = this.findByValue(value);
        this.select(child);
    }

    find(element) {
        if (!this._children) return null;
        for (const child of this._children) {
            if (child.element == element) return child;
        }
        return null;
    }

    findByValue(value) {
        if (!this._children) return null;

        for (const child of this._children) {
            if (child.value == value) return child;
        }

        return null;
    }

    select(item) {
        if (item == this._currentElement) return;
        if (!this._children) return;

        for (const child of this._children) {
            if (item && item.equals(child)) {
                continue;
            }

            const childElement = child.element;
            if (childElement) {
                childElement.classList.remove("selected");
            }
        }

        let newValue = null;

        if (item) {
            const element = item.element;
            if (element) {
                element.classList.add("selected");
            }

            newValue = item.value;
        }

        if (newValue != this._value) {
            this._value = newValue;
            this.notifyChange();
        }

    }

    onMouseDown(elementObj) {

        if (this.mouseTimer) {
            window.clearTimeout(this.mouseTimer);
            this.mouseElement = null;
            this.mouseTimer = null;
        }

        if (!elementObj) return;


        const thisInstance = this;
        this.mouseElement = elementObj;

        this.mouseTimer = window.setTimeout(function() {
            thisInstance.onMouseTimer(this.mouseElement);
        }, 1000);

    }

    onMouseUp(elementObj) {

        if (this.mouseTimer) {
            window.clearTimeout(this.mouseTimer);
            this.mouseTimer = null;
        }

        if (this.mouseElement) {
            this.onClick(this.mouseElement);
            this.mouseElement = null;
        }

    }

    onMouseTimer(element) {

        this.mouseTimer = null;

        if (this.mouseElement) {
            this.onLongClick(this.mouseElement);
            this.mouseElement = null;
        }

    }

    onClick(element) {

        if (!element) return;

        const retVal = this.fireEvent("click", element);
        if (retVal === false) return;

        this.select(element);
    }

    onLongClick(element) {
        this.fireEvent("longclick", element);
    }

    notifyChange() {
        this.fireEvent("change", this.propertyName, this.value);
    }
}

class Painter {
    constructor(element) {
        this._element = element;
        this._context = element ? element._element.getContext("2d") : null;

        const context = this._context;
        if (context) {
            context.lineWidth = 1;
            context.imageSmoothingEnabled = false;
        }
    }

    get context() { return this._context; }
    get rect() { return this._element.rect; }

    begin() {
        this.context.save();
    }

    end() {
        this.context.restore();
    }

    setForeground(col) {
        this.context.fillStyle = col;
        this.context.strokeStyle = col;
    }

    fillRect(x, y, w, h, col) {
        if (arguments.length < 3) {
            const r = arguments[0];
            if (arguments.length == 2) this.setForeground(arguments[1]);
            this.context.fillRect(Math.floor(r.left), Math.floor(r.top), Math.floor(r.width), Math.floor(r.height));
        } else {
            if (col) this.setForeground(col);
            this.context.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
        }
    }

    drawPixel(x, y, col) {
        this.fillRect(x, y, 1, 1, col);
    }

    drawLine(x1, y1, x2, y2, col) {
        if (col) this.setForeground(col);

        const context = this.context;
        context.beginPath();
        context.moveTo(Math.floor(x1)+0.5, Math.floor(y1)+0.5);
        context.lineTo(Math.floor(x2)+0.5, Math.floor(y2)+0.5);
        context.stroke();
    }

}

class Canvas extends UiElement {
    constructor(elementId, parent) {
        super(elementId, parent);
        this._painter = new Painter(this);
        this._rect = new Rectangle();
        this._devicePixelRatio = window.devicePixelRatio||1.0;
    }

    get painter() { return this._painter; }
    get rect() { return this._rect; }

    onCreate() {
        this.invalidate();
    }

    onResize() {
        this.invalidate();
    }

    onWheel() {
    }

    onKey() {
    }

    layout() {

        const element = this.element;

        const devicePixelRatio = this._devicePixelRatio;
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;

        const rect = this.rect;
        rect.setSize(viewWidth * devicePixelRatio, viewHeight * devicePixelRatio);

        element.width = rect.width;
        element.height = rect.height;

        element.style.width = (viewWidth) + "px";
        element.style.height = (viewHeight) + "px";
    }

    invalidate() {
        this.layout();
        this.redraw();
    }

    asyncRedraw() {

        if (this._redrawTimer) return;

        const thisInstance = this;

        this._redrawTimer = window.setTimeout(function() {
            thisInstance.redraw();
        }, 25);

    }

    redraw() {
        if (this._redrawTimer) {
            window.clearTimeout(this._redrawTimer);
            this._redrawTimer = null;
        }

        const painter = this.painter;
        painter.begin();
        this.draw();
        painter.end();
    }

    draw() {

    }

}
