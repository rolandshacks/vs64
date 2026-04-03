/**
 * Web View
 * @module Web
 */

/* global document window */

import { $, Timer } from "./utilities.js";
import { Point, Size } from "./geometry.js";
import { Factory } from "./factory.js";

const WEB_VIEW_CLASSNAME = "view.web";

const DEFAULT_SCALE_MIN = 1;
const DEFAULT_SCALE_MAX = 16;

/**
 * Abstract view.
 */
class WebView {
    constructor(element, options) {
        this._element = element;
        this._document = null;
        this._options = options;
        this._timer = null;
        this._scale = DEFAULT_SCALE_MIN;
        this._scaleMin = DEFAULT_SCALE_MIN;
        this._scaleMax = DEFAULT_SCALE_MAX;
        this._autoScale = true;
        this._autoScroll = false;

        this._mouseListener = null;
        this._wheelListener = null;
        this._hoverListener = null;
    }

    static createInstance(...args) {
        return new WebView(...args);
    }

    enableMouseListener() {
        const instance = this;
        this._mouseListener = new MouseListener();
        const mouseListener = this._mouseListener;
        mouseListener.dragMove = (position, delta) => { instance.onDragMove(position, delta); }
    }

    enableWheelListener(autoScroll=false) {
        this._autoScroll = autoScroll;
        const instance = this;
        const element = this._element;
        if (null == element) return;
        this._wheelListener = new WheelListener(element.parentElement);
        const wheelListener = this._wheelListener;
        wheelListener.wheel = (position, delta) => { instance.handleWheel(position, delta); }
    }

    enableHoverListener() {
        const instance = this;
        const element = this._element;
        if (null == element) return;
        this._hoverListener = new HoverListener(null, [ "content-header", "content-container", "content-body" ]);
        const hoverListener = this._hoverListener;
        hoverListener.hover = (element, position) => { instance.onHover(element, position); }
        hoverListener.unhover = (element) => { instance.onUnhover(element); }
        hoverListener.hoverMove = (element, position) => { instance.onHoverMove(element, position); }
    }

    enableAllListeners() {
        this.enableMouseListener();
        this.enableWheelListener();
        this.enableHoverListener();
    }

    get element() { return this._element; }
    get document() { return this._document; }
    get options() { return this._options; }
    get scale() { return this._scale; }
    get autoScale() { return this._autoScale; }
    get autoScroll() { return this._autoScroll; }

    get timer() {
        if (null == this._timer) {
            this._timer = new Timer();
        }

        return this._timer;
    }

    create() {
    }

    setDocument(document) {
        this.invalidate();
        this._document = document;

        if (null != document) {
            this.unpack();
        }

        this.show();
    }

    unpack() {
        // nothing to do by default
        // overload this method if you want to unpack
        // binary data and pre-render html
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

    resize(_width, _height) {
        if (this._hoverListener) {
            this._hoverListener.hide();
        }

        if (this.autoScale) {
            this.layout();
        }
    }

    layout(_algorithm_, _layoutOptions_) {
        this._autoScale = true;
    }

    invalidate() {
        this._document = null;
        this._autoScale = true;
    }

    setScale(scale, scaleMin, scaleMax) {
        if (null != scale) this._scale = scale;
        if (null != scaleMin) this._scaleMin = scaleMin;
        if (null != scaleMax) this._scaleMax = scaleMax;
    }

    onScale(_scale_, _delta_) {
        this._autoScale = false;
    }

    getViewSize() {
        const element = this.getScrollableElement();
        if (null == element) return null;
        return new Size(element.clientWidth, element.clientHeight);
    }

    getScrollableElement() {
        return document.documentElement;
    }

    handleWheel(position, deltaY) {

        const scrollElement = this.getScrollableElement();
        const scrollPos = Point.from(scrollElement.scrollLeft, scrollElement.scrollTop);
        //const scrollSize = Point.from(scrollElement.scrollWidth, scrollElement.scrollHeight);

        const relMousePos = Point.from(position.x, position.y);
        const absMousePos = Point.add(relMousePos, scrollPos);

        const oldScale = this.scale;
        const logAbsPos = Point.from(absMousePos.x / oldScale, absMousePos.y / oldScale);

        if (0 != deltaY) {
            if (this._hoverListener) {
                this._hoverListener.hide();
            }
            this.changeScale(deltaY);
        }

        if (this._autoScroll) {
            const scale = this.scale;
            const logRelPosNew = Point.from(relMousePos.x / scale, relMousePos.y / scale);
            const logScrollNew = Point.sub(logAbsPos, logRelPosNew);
            const pixScrollNew = Point.from(logScrollNew.x * scale, logScrollNew.y * scale);
            scrollElement.scroll(pixScrollNew.x, pixScrollNew.y);
        }

        return false;
    }

    setTooltipContent(tooltip, element) {
        const wrapperElement = element.ownerRef;
        if (null == wrapperElement) return false;

        const node = wrapperElement.nodeRef;
        if (null == node) return false;

        const data = node.ref;
        if (null == data) return false;

        tooltip.style.textAlign = "center";

        let s = "";

        s += (data.node_type ? data.node_type + " " : "") + "<b>" + data.name + "</b>";
        s += "<hr>"

        if (data.location) {
            s += data.location.source_file;
        }

        tooltip.innerHTML = s;

        return true;
    }

    onHover(element, position) {

        console.log(position.y);

        const tooltip = $("idTooltip");
        if (null == tooltip) return;

        if (false == this.setTooltipContent(tooltip, element)) return;

        const rect = element.getBoundingClientRect();

        const padding = 4;
        let tx = 0;

        const cx = Math.floor(rect.x + rect.width / 2);
        if (cx >= window.innerWidth / 2) {
            tx = rect.x - padding;
            tooltip.style.transform = "translate(-100%, -50%)";
            tooltip.classList.remove("tooltip-left");
            tooltip.classList.add("tooltip-right");
        } else {
            tx = rect.x + rect.width + padding;
            tooltip.style.transform = "translate(0%, -50%)";
            tooltip.classList.remove("tooltip-right");
            tooltip.classList.add("tooltip-left");
        }

        tooltip.style.opacity = 1;
        tooltip.style.left = Math.floor(tx) + "px";
        tooltip.style.top = Math.floor(position.y) + "px";
        this.#fixElementPos(tooltip);

        tooltip.style.display = "block";

    }

    #fixElementPos(element) {
        const scrollbarSize = this.options.scrollbarSize;
        const boundingRect = element.getBoundingClientRect();
        const ofsY = Math.floor(boundingRect.height / 2);
        const minY = 0;
        const maxY = window.innerHeight - scrollbarSize.height - boundingRect.height;

        if (boundingRect.top > maxY) {
            element.style.top = Math.floor(maxY + ofsY)  + "px";
        }

        if (boundingRect.top < minY) {
            element.style.top = Math.floor(minY + ofsY)  + "px";
        }

        //console.log("tooltip: " + element.style.left + " / " + element.style.top + "  > " + boundingRect.top + " / " + (boundingRect.top + boundingRect.height / 2));

        //console.log("tooltip: " + element.style.top);

    }

    onUnhover() {
        const tooltip = $("idTooltip");
        if (null == tooltip) return;

        tooltip.style.opacity = 0;
        //tooltip.style.display = "none";

    }

    onHoverMove(element, position) {

        const tooltip = $("idTooltip");
        if (null == tooltip) return;

        tooltip.style.top = Math.floor(position.y) + "px";

        this.#fixElementPos(tooltip);
    }

    onDragMove(_position_, delta) {
        const view = this;
        if (null == view) return;

        const scrollable = view.getScrollableElement();
        if (null == scrollable) return;

        if (this._hoverListener) {
            this._hoverListener.hide();
        }

        scrollable.scrollBy(-delta.x, -delta.y);

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

/**
 * Hover event listener.
 */
class HoverListener extends EventListener {
    constructor(eventSource, filter) {
        super(eventSource, [ "mouseover", "mouseout", "mousemove" ]);

        this._filter = filter;

        this.state.hoverElement = null;
        this._timer = new Timer();
        this._delay = 250; // milliseconds
    }

    get active() { return this.state.hoverElement != null; }

    // set event handlers
    set hover(fn) { this.handlers.hover = fn; }
    set unhover(fn) { this.handlers.unhover = fn; }
    set hoverMove(fn) { this.handlers.hoverMove = fn; }

    dispatchEvent(event) {
        if (null == event) return;

        const state = this.state;
        state.position.set(event.clientX, event.clientY);

        if (event.target == document.documentElement) return;

        const eventType = event.type;

        const timer = this._timer;
        const instance = this;

        if (eventType == "mousemove") {
            instance.handleHoverMove();
        } else if (eventType == "mouseover") {
            timer.once(() => {
                if (null != this.state.hoverElement) {
                    instance.handleUnhover(event);
                }
                instance.handleHover(event);
            }, this._delay);

        } else if (eventType == "mouseout") {
            timer.stop();
            if (null != this.state.hoverElement) {
                instance.handleUnhover();
            }
        }
    }

    hide() {
        const timer = this._timer;
        timer.stop();
        if (null != this.state.hoverElement) {
            this.handleUnhover();
        }
    }

    handleHoverMove() {
        const element = this.state.hoverElement;
        if (null == element) return;
        if (this.handlers.hoverMove) this.handlers.hoverMove(element, this.state.position);
    }

    handleHover(event) {
        const element = this.#getHoverElementFromEvent(event);
        this.state.hoverElement = element;
        if (null == element) return;

        if (this.handlers.hover) this.handlers.hover(element, this.state.position);
    }

    handleUnhover() {
        const element = this.state.hoverElement;
        this.state.hoverElement = null;
        if (this.handlers.unhover) this.handlers.unhover(element);
    }

    #getHoverElementFromEvent(event) {
        let element = event.target;

        const filter = this._filter;
        if (null == filter) return element;

        let foundElement = null;

        while (null != element) {
            if (null != element.classList) {
                for (const clazz of element.classList) {
                    if (filter.indexOf(clazz) != -1) {
                        foundElement = element;
                        break;
                    }
                }
            }
            element = element.parentElement;
        }

        return foundElement;
    }
}

WebView.ClassName = WEB_VIEW_CLASSNAME;

Factory.register(WebView);

export {
    WebView,
    MouseListener,
    HoverListener,
    WheelListener
};
