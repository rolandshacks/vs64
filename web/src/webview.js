/**
 * Web View
 * @module Web
 */

/* global document window */

import { Point, Size } from "./imports.js";
import { Factory } from "./factory.js";

const WEB_VIEW_CLASSNAME = "view.web";

const DEFAULT_SCALE_MIN = 1;
const DEFAULT_SCALE_MAX = 16;

const _HtmlElementMap = new Map();

/**
 * Get DOM element.
 * @param {string} id - The ID of the element to locate. The ID is a
 *                      case-sensitive string which is unique within the
 *                      document; only one element should have any given ID.
 * @returns {element} - An Element object describing the DOM element object
 *                      matching the specified ID, or null if no matching
 *                      element was found in the document.
 */
function $(id) {
    const m = _HtmlElementMap;

    let element = m.get(id);
    if (element) {
        return element;
    }

    element = document.getElementById(id);
    if (element) {
        m.set(id, element);
    }

    return element;
}

/**
 * Get wrapped DOM element.
 * @param {string|object} element - A DOM element or ID of the element to locate.
 *                      The ID is a case-sensitive string which is unique within
 *                      the document; only one element should have any given ID.
 * @returns {element} - A WebElement object wrapping the DOM element object
 *                      matching the specified ID, or null if no matching
 *                      element was found in the document.
 */
function $$(element, parent=null) {
    return WebElement.bind(element, parent);
}

/**
 * WebElement.
 */
class WebElement {
    constructor(element, parent=null) {
        this._parent = parent;
        this._element = element;
        this._mouseListener = null;
        this._ctx = null;
    }

    static bind(element, parent=null) {
        if (null == element) return null;

        let instance = null;

        if (typeof element == "string") {
            const elementObj = $(element);
            if (null == elementObj) return null;
            instance = new WebElement(elementObj, parent);
        } else {
            instance = new WebElement(element, parent);
        }

        return instance;
    }

    get element() { return this._element; }

    // attributes
    get width() { return this._element.width; }
    set width(w) { this._element.width = w; }
    get height() { return this._element.height; }
    set height(h) { this._element.height = h; }
    get value() { return this._element.value; }
    set value(v) { this._element.value = v; }
    get min() { return this._element.min; }
    set min(v) { this._element.min = v; }
    get max() { return this._element.max; }
    set max(v) { this._element.max = v; }
    get innerHTML() { return this._element.innerHTML; }
    set innerHTML(h) { this._element.innerHTML = h; }
    get style() { return this._element.style; }
    get innerText() { return this._element.innerText; }
    set innerText(t) { this._element.innerText = t; }

    // event handlers
    set onclick(f) { this._element.onclick = f; }
    set onchange(f) { this._element.onchange = f; }

    // additional attributes
    get visible() { return this._element.style.display == "block"; }
    set visible(v) { this._element.style.display = (v ? "block" : "none"); }

    get ctx() {
        if (null == this._ctx) {
            const element = this._element;
            if (null != element && element.tagName == "CANVAS") {
                this._ctx = element.getContext("2d");
                this._ctx.imageSmoothingEnabled = false;
            }
        }
        return this._ctx;
    }

    enableMouseListener(onDragMoveFn) {
        this._mouseListener = new MouseListener();
        const mouseListener = this._mouseListener;
        mouseListener.dragMove = (position, delta) => { onDragMoveFn(position, delta); }
    }

    enableWheelListener(onWheelFn) {
        const element = this._element;
        if (null == element) return;
        this._wheelListener = new WheelListener(element.parentElement);
        const wheelListener = this._wheelListener;
        wheelListener.wheel = (position, delta) => { onWheelFn(position, delta); }
    }

}

/**
 * Media view UI.
 */
class WebUi {
    constructor(view) {
        this._view = view;
        this._locked = false;
    }

    get locked() { return this._locked == true; }

    lock() {
        this._locked = true;
    }

    unlock() {
        this._locked = false;
    }
}

/**
 * Abstract view.
 */
class WebView {
    constructor(app, ..._args) {
        this._app = app;
        this._options = app.options;
        this._document = null;
        this._scale = DEFAULT_SCALE_MIN;
        this._scaleMin = DEFAULT_SCALE_MIN;
        this._scaleMax = DEFAULT_SCALE_MAX;
        this.ui = new WebUi();
    }

    get document() { return this._document; }
    get options() { return this._options; }
    get scale() { return this._scale; }

    static createInstance(...args) {
        return new WebView(...args);
    }

    create() {}

    setDocument(document) {
        this.invalidate();
        this._document = document;
        if (null != document) {
            this.unpack();
        }
        this.onDocument(document);
        this.show();
    }

    onDocument(_document) {}

    unpack() {
        // nothing to do by default
        // overload this method if you want to unpack
        // binary data and pre-render html
    }

    invalidate() {
        this._document = null;
    }

    show() {
        const element = this.element;
        if (null != element) {
            const document = this.document;
            if (null != document && null != document.html) {
                element.innerHTML = document.html;
            } else {
                element.innerHTML = "<p>no data.</p>";
            }
        }
    }

    resize(_width, _height) {}

    setScale(scale, scaleMin, scaleMax) {

        if (null != scaleMin) this._scaleMin = scaleMin;
        if (null != scaleMax) this._scaleMax = scaleMax;

        if (null != scale) {
            if (this._scaleMin != null && scale < this._scaleMin) scale = this._scaleMin;
            if (this._scaleMax != null && scale > this._scaleMax) scale = this._scaleMax;

            let delta = null;
            if (null != this._scale) {
                delta = scale - this._scale;
            }

            this._scale = scale;

            this.onScale(scale, delta);
        }

    }

    onScale(_scale_, _delta_) {}

    getViewSize() {
        const scrollElement = this.getScrollableElement();
        if (null == scrollElement) return null;
        return new Size(scrollElement.clientWidth, scrollElement.clientHeight);
    }

    getScaledViewSize() {
        const sz = this.getViewSize();
        if (null == sz) return sz;

        const devicePixelRatio = window.devicePixelRatio || 1;
        sz.x *= devicePixelRatio;
        sz.y *= devicePixelRatio;

        return sz;
    }

    getScrollableElement() {
        return document.documentElement;
    }

    handleWheel(position, deltaY) {

        /*
        const scrollElement = this.getScrollableElement();
        const scrollPos = Point.from(scrollElement.scrollLeft, scrollElement.scrollTop);
        //const scrollSize = Point.from(scrollElement.scrollWidth, scrollElement.scrollHeight);

        const relMousePos = Point.from(position.x, position.y);
        const absMousePos = Point.add(relMousePos, scrollPos);

        const oldScale = this.scale;
        const logAbsPos = Point.from(absMousePos.x / oldScale, absMousePos.y / oldScale);
        */

        if (0 != deltaY) {
            this.changeScale(deltaY);
        }

        return false;
    }

    onDragMove(_position_, delta) {
        const view = this;
        if (null == view) return;
        const scrollElement = view.getScrollableElement();
        if (null == scrollElement) return;
        scrollElement.scrollBy(-delta.x, -delta.y);
    }

    changeScale(delta) {
        this._scale -= Math.trunc(Math.sign(delta));
        if (this._scale < this._scaleMin) this._scale = this._scaleMin;
        if (this._scale > this._scaleMax) this._scale = this._scaleMax;
        this.onScale(this._scale, delta);
    }

    changeScaleFloat(delta) {
        const scaleDeltaMax = 0.20;

        let scaleDelta = -delta * 0.05;
        if (scaleDelta > scaleDeltaMax) scaleDelta = scaleDeltaMax;
        else if (scaleDelta < -scaleDeltaMax) scaleDelta = -scaleDeltaMax;

        this._scale *= (1.0 + scaleDelta);
        if (this._scale < this._scaleMin) this._scale = this._scaleMin;
        if (this._scale > this._scaleMax) this._scale = this._scaleMax;

        this.onScale(this._scale, delta);
    }

}

class EventListener {
    constructor(eventSource, eventNames, exclusive) {
        this._eventSource = eventSource || window;
        this._exclusive = exclusive;

        let options = undefined;
        if (exclusive) {
            options = {
                capture: true,
                passive: false
            };
        }

        this.state = {
            position: new Point()
        };

        this.handlers = {};

        const instance = this;

        if (this._eventSource && eventNames) {
            for (const eventtype of eventNames) {
                this._eventSource.addEventListener(
                    eventtype,
                    e => { instance.wrapDispatchEvent(e); },
                    options
                );
            }
        }

    }

    get eventSource() { return this._eventSource; }
    get exclusive() { return this._exclusive; }

    wrapDispatchEvent(event) {
        if (null == event) return;

        const result = this.dispatchEvent(event);

        if (this.exclusive) {
            if (undefined == result) {
                return false;
            } else {
                event.preventDefault();
                event.stopPropagation();
                event.returnValue = false;
                return false;
            }
        }

        return result;
    }

    // dispatch events
    dispatchEvent(_event_) {
    }

}

class WheelListener extends EventListener {
    constructor(eventSource) {
        super(eventSource,  ["wheel"], true);
    }

    // set event handlers
    set wheel(fn) { this.handlers.wheel = fn; }

    dispatchEvent(event) {
        if (null == event) return true;

        // filter
        if (!event.ctrlKey) return undefined;

        const state = this.state;
        state.position.set(event.clientX, event.clientY);

        state.deltaY = event.deltaY||0;
        state.deltaMode = event.deltaMode||0;

        this.handleWheel();

        return true;
    }

    handleWheel() {
        if (this.handlers.wheel) {
            const state = this.state;
            if (state.deltaY != 0) {
                this.handlers.wheel(state.position, state.deltaY, state.deltaMode);
            }
        }
    }
}

/**
 * Mouse event listener.
 */
class MouseListener extends EventListener {
    constructor(eventSource) {
        super(eventSource, ["mousedown", "mouseup", "mousemove"]);
        const state = this.state;
        state.pressed = false;
        state.pressedStart = null;
        state.dragging = false;
        state.dragStart = null;
        state.dragMoveLast = null;
    }

    get pressed() { return this.state.pressed; }
    get dragging() { return this.state.dragging; }

    // set event handlers
    set mouseDown(fn) { this.handlers.mouseDown = fn; }
    set mouseUp(fn) { this.handlers.mouseUp = fn; }
    set mouseMove(fn) { this.handlers.mouseMove = fn; }
    set dragBegin(fn) { this.handlers.dragBegin = fn; }
    set dragEnd(fn) { this.handlers.dragEnd = fn; }
    set dragMove(fn) { this.handlers.dragMove = fn; }

    // dispatch events
    dispatchEvent(event) {
        if (null == event) return;

        // just handle left mouse button
        if (event.button != 0) return;

        // ignore if a special key is pressed
        if (event.altKey || event.metaKey || event.shiftKey || event.ctrlKey) return;

        const state = this.state;

        state.position.set(event.clientX, event.clientY);

        const eventType = event.type;

        if (eventType == "mousemove") {
            this.handleMouseMove(state.position);

            if (state.pressed) {

                if (!state.dragging) {
                    state.dragging = true;
                    state.dragStart = Point.from(state.position);
                    state.dragMoveDelta = Point.from(0, 0);
                    state.dragMoveLast = Point.from(state.position);
                    this.handleDragBegin(state.dragStart);
                }

                state.dragMoveDelta.set(state.position.x - state.dragMoveLast.x,
                                        state.position.y - state.dragMoveLast.y);

                if (state.dragMoveDelta.x != 0 || state.dragMoveDelta.y != 0) {
                    this.handleDragMove(state.position, state.dragMoveDelta);
                    state.dragMoveLast.set(state.position);
                }
            }
        } else if (eventType == "mousedown") {
            if (!state.pressed) {
                state.pressed = true;
                state.pressedStart = Point.from(state.position);
                this.handleMouseDown(state.position);

            }
        } else if (eventType == "mouseup") {
            if (state.pressed || state.dragging) {
                state.pressed = false;

                this.handleMouseUp(state.position);
                if (state.dragging) {
                    state.dragging = false;
                    this.handleDragEnd(state.position);
                }

                state.pressedStart = null;
                state.dragStart = null;
                state.dragMoveLast = null;
            }
        }
    }

    handleMouseDown(position) {
        if (this.handlers.mouseDown) this.handlers.mouseDown(position);
    }

    handleMouseUp(position) {
        if (this.handlers.mouseUp) this.handlers.mouseUp(position);
    }

    handleMouseMove(position) {
        if (this.handlers.mouseMove) this.handlers.mouseMove(position);
    }

    handleDragBegin(position) {
        if (this.handlers.dragBegin) this.handlers.dragBegin(position);
    }

    handleDragEnd(position) {
        if (this.handlers.dragEnd) this.handlers.dragEnd(position);
    }

    handleDragMove(position, delta) {
        if (this.handlers.dragMove) { this.handlers.dragMove(position, delta); }
    }
}

WebView.ClassName = WEB_VIEW_CLASSNAME;

Factory.register(WebView);

export {
    $,
    $$,
    WebElement,
    WebUi,
    WebView,
    MouseListener,
    WheelListener
};
