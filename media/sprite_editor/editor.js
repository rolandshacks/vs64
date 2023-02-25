//
// Editor components
//

class State extends EventSource {
    constructor() {
        super();
    }
}

class EditorState extends State {
    constructor() {
        super();

        this._drawColor = 1;
        this._colorMap = [0, 1, 2, 3];
        this._toolMode = 'pen';

    }

    get drawColor() { return this._drawColor; }
    get colorMap() { return this._colorMap; }
    get toolMode() { return this._toolMode; }

    notifyChange(key, value) {
        const args = Array.prototype.slice.call(arguments, 2);
        this.fireEvent('change', key, value, ...args);
        this.fireEvent('change.' + key, value, ...args);
    }

    setDrawColor(color) {
        this._drawColor = color;
        this.notifyChange("drawcolor", color);
    }

    setToolMode(mode) {
        this._toolMode = mode;
        this.notifyChange("toolmode", mode);
    }

    setPaletteColor(color) {
        if (this._drawColor < 0 || this._drawColor >= this._colorMap.length) {
            return;
        }
        this._colorMap[this._drawColor] = color;
        this.notifyChange("palette", this._drawColor, color);
    }

}

class EditorView extends Canvas {
    constructor(elementId, parent, state) {
        super(elementId, parent);

        const element = this.element;
        this._zoom = 16;
        this._offset = new Point();
        this._contentRect = new Rectangle();
        this._scrollRect = new Rectangle();
        this._inputState = {
            mousePos: new Point(),
            mouseButton: null,
            shiftKey: false,
            ctrlKey: false
        }
        this._pixelPos = new Point(-1, -1);
        this._pixelPosLast = null;

        this._state = state;

        this.invalidate();
        this.onCreate();
    }

    get data() { return this._parent ? this._parent.data : null; }
    get zoom() { return Math.floor(this._zoom); }
    get offset() { return this._offset; }
    get pixelPos() { return (this._pixelPos.x >= 0) ? this._pixelPos : null; }
    get palette() { return this.parent.palette; }
    get input() { return this._inputState; }

    onCreate() {
        const thisInstance = this;

        {
            const element = this.element;

            element.onclick = function(e) {
                thisInstance.updateMouse(e);
                thisInstance.onClick(e);
            };

            element.onmousedown = function(e) {
                e.preventDefault();
                thisInstance.updateMouse(e);
                thisInstance.onMouseDown(e);
            }

            element.onmousemove = function(e) {
                thisInstance.updateMouse(e);
                thisInstance.onMouseMove(e);
            };

            element.onmouseup = function(e) {
                e.preventDefault();
                thisInstance.updateMouse(e);
                thisInstance.onMouseUp(e);
            }

            element.oncontextmenu = function(e) {
                e.preventDefault();
            }
        }

        {
            const parent = this._parent;
            const window = parent.window;

            window.addEventListener('resize', (event) => {
                thisInstance.onResize(event);
            });

            window.addEventListener('wheel', (event) => {
                event.preventDefault();
                thisInstance.onWheel(event);
                return false;
            }, {passive: false});

            window.addEventListener('keydown', (event) => {
                event.preventDefault();
                thisInstance.onKey(event, true);
                return false;
            }, {passive: false});

            window.addEventListener('keyup', (event) => {
                event.preventDefault();
                thisInstance.onKey(event, false);
                return false;
            }, {passive: false});
        }

        {
            const parent = this._parent;
            const state = this._state;
            for (let i=0; i<state.colorMap.length; i++) {
                const element = document.getElementById("color" + i);
                if (element) {
                    element.style.background = this.palette[state.colorMap[i]];
                }
            }
        }

        super.onCreate();

    }

    onPropertyChange(propertyName) {
        if (propertyName == 'palette') {
            this.redraw();
            console.log("VIEW: PROPERTY CHANGE / REDRAW");
        }
    }

    updateMouse(event) {

        this.updateInputState(event);

        const devicePixelRatio = this._devicePixelRatio;
        this._inputState.mousePos.set(event.clientX * devicePixelRatio, event.clientY * devicePixelRatio);

        const mousePos = this.input.mousePos;

        const sprite = this.data;
        if (!sprite) return;

        if (this._contentRect && this._contentRect.contains(mousePos.x, mousePos.y)) {

            this._pixelPos.set(
                Math.floor((mousePos.x - this._contentRect.left) / (this.zoom * sprite.pixelSize.x)),
                Math.floor((mousePos.y - this._contentRect.top) / (this.zoom * sprite.pixelSize.y))
            );

            //console.log("inside: " + this._pixelPos.x + " / " + this._pixelPos.y);

        } else {
            this._pixelPos.set(-1, -1);
        }
    }

    onClick(event) {
    }

    onMouseDown(event) {
        this._inputState.mouseButton = event.button || 0;

        this._pixelPosLast = new Point(this._pixelPos.x, this._pixelPos.y);
        this.doPenAction();
    }

    onMouseUp(event) {
        this._inputState.mouseButton = null;
        this._pixelPosLast = null;
    }

    onMouseMove(event) {
        if (this.input.mouseButton != null && this._pixelPosLast) {
            if (!this._pixelPosLast.equals(this._pixelPos)) {
                this.doPenAction();
                this._pixelPosLast.set(this._pixelPos.x, this._pixelPos.y);
            }
        }
    }

    updateInputState(event) {
        this._inputState.shiftKey = event.shiftKey;
        this._inputState.ctrlKey = event.ctrlKey;
    }

    onKey(keyEvent, keyDown) {
        if (!keyDown) return;

        const key = keyEvent.key;

        this.updateInputState(keyEvent);

        const shiftKey = this.input.shiftKey;

        switch (key) {
            case '+':
                this.setZoom(this._zoom + 1)
                break;
            case '-':
                this.setZoom(this._zoom - 1)
                break;
            case 'ArrowLeft':
                this.scroll(1, 0, !shiftKey);
                break;
            case 'ArrowRight':
                this.scroll(-1, 0, !shiftKey);
                break;
            case 'ArrowUp':
                this.scroll(0, 1, !shiftKey);
                break;
            case 'ArrowDown':
                this.scroll(0, -1, !shiftKey);
                break;
            default:
            break;
        }
    }

    doPenAction() {

        const sprite = this.data;
        const pixelPos = this.pixelPos;

        const state = this._state;
        const alternativeMode = (this.input.shiftKey);

        const drawColor = (this.input.mouseButton == 0) ? state.drawColor : 0;

        if (pixelPos && sprite) {
            if (state.toolMode == 'pen') {
                sprite.setPixel(pixelPos.x, pixelPos.y, drawColor);
            } else if (state.toolMode == 'erase') {
                sprite.setPixel(pixelPos.x, pixelPos.y, 0);
            } else if (state.toolMode == 'fill') {
                console.log("FILL");
                const color = sprite.getPixel(pixelPos.x, pixelPos.y);
                sprite.fill(pixelPos.x, pixelPos.y, drawColor, alternativeMode);
            }

            this.asyncRedraw();
        }

    }

    layout() {
        super.layout();

        const sprite = this.data;
        if (sprite) {
            const zoom = this.zoom;
            const offset = this.offset;
            const viewport = this._rect;

            const w = zoom * sprite.width * sprite.pixelSize.x;
            const h = zoom * sprite.height * sprite.pixelSize.y;
            const x = Math.floor(offset.x) + Math.floor((viewport.width - w)/2);
            const y = Math.floor(offset.y) + Math.floor((viewport.height - h)/2);

            this._contentRect.set(x, y, w, h);
            this._scrollRect.set(this._contentRect.union(this._rect));

            /*
            const r = this._scrollRect;
            console.log(
                "Rect: " +
                r.left + "/" +
                r.top + "/" +
                r.right + "/" +
                r.bottom + "/" +
                r.width + "/" +
                r.height
            );
            */
        }

    }

    setZoom(zoom) {
        if (zoom < 1) zoom = 1;
        if (zoom > 128) zoom = 128;
        if (zoom != this._zoom) {
            this._zoom = zoom;
            this.invalidate();
        }
    }

    scroll(deltaX, deltaY, logicalSteps) {
        const viewportSize = this.rect.getSize();

        if (logicalSteps) {
            deltaX = Math.floor(deltaX * viewportSize.x / 24);
            deltaY = Math.floor(deltaY * viewportSize.y / 24);
        }

        this._offset.x += deltaX;
        this._offset.y += deltaY;
        this.invalidate();
    }

    onWheel(wheelEvent) {
        //console.log("Wheel");

        this.updateInputState(wheelEvent);

        const delta = -wheelEvent.deltaY;
        this.setZoom(this._zoom + delta * 0.05);

        /*
        const deltaMode = wheelEvent.deltaMode;
        let pixels = delta;
        if (deltaMode == 0x1) pixels *= 16;
        else if (deltaMode == 0x2) pixels *= 128;
        */

    }

    drawSprite(sprite, rect) {

        const painter = this.painter;

        const xofs = rect.left;
        const yofs = rect.top;
        const scaleX = Math.floor(rect.width / sprite.width);
        const scaleY = Math.floor(rect.height / sprite.height);
        const scale = Math.min(scaleX, scaleY);

        const colorMap = this._state.colorMap;

        const displayWidth = sprite.width * scaleX;
        const displayHeight = sprite.height * scaleY;

        const gridWidth = 8;
        const gridHeight = 8;

        if (this.gridPattern == null) {
            const patternCanvas = document.createElement("canvas");
            const patternContext = patternCanvas.getContext("2d");

            patternCanvas.width = gridWidth * 2;
            patternCanvas.height = gridHeight * 2;

            patternContext.fillStyle = Palette.checker[0];
            patternContext.fillRect(0, 0, patternCanvas.width, patternCanvas.height);
            patternContext.fillStyle = Palette.checker[1];
            patternContext.fillRect(0, 0, gridWidth, gridHeight);
            patternContext.fillRect(gridWidth, gridHeight, gridWidth, gridHeight);

            this.gridPattern = painter.context.createPattern(patternCanvas, "repeat");
        }

        {
            painter.begin();
            painter.context.fillStyle = this.gridPattern;
            painter.fillRect(xofs, yofs, displayWidth, displayHeight);
            painter.end();
        }

        for (let y=0; y<sprite.height; y++) {
            const ypos = yofs + y * scaleY;
            for (let x=0; x<sprite.width; x++) {
                const col = sprite ? sprite.getPixel(x, y) : null;
                let rgb = null;
                if (null != col && 0 != col) {
                    const paletteIndex = colorMap[col];
                    rgb = this.palette[paletteIndex];
                } else {
                    //const background = (y*sprite.width+x + (y&0x1))&0x1;
                    //rgb = Palette.checker[background];
                }

                if (null != rgb) {
                    const xpos = xofs + x * scaleX;
                    painter.fillRect(xpos, ypos, scaleX, scaleY, rgb);
                }
            }

        }

        if (scale >= 8) {

            painter.setForeground("#00000020");

            for (let y=0; y<sprite.height; y++) {
                const ypos = yofs + y * scaleY;
                painter.drawLine(xofs, ypos, xofs + sprite.width * scaleX, ypos);
            }

            for (let x=0; x<sprite.width; x++) {
                const xpos = xofs + x * scaleX;
                painter.drawLine(xpos, yofs, xpos, yofs + sprite.height * scaleY);
            }
        }

    }

    draw() {

        const painter = this.painter;
        const viewport = this.rect;
        const scrollRect = this._scrollRect;

        const showHorizontalBar = scrollRect ? (viewport.width < scrollRect.width) : false;
        const showVerticalBar = scrollRect ? (viewport.height < scrollRect.height) : false;
        const scrollBarSize = 32;

        painter.fillRect(viewport, "#202020");

        const contentRect = this._contentRect;
        const sprite = this.data;
        if (sprite) {
            this.drawSprite(sprite, contentRect);

            /*
            // DRAW SPRITE LIST
            const w = 24 * 4;
            const h = 21 * 4;
            for (let i=0; i<8; i++) {
                let x = viewport.right - w - 16 - (showVerticalBar ? 40 : 0);
                let y = 16 + (h + 1) * i;
                this.drawSprite(sprite, new Rectangle(x, y, w, h));
            }
            */
        }

        if (scrollRect) {

            const barForeground = "#ffffff20";
            const barBackground = "#20202040";

            if (showHorizontalBar) {
                // horizontal scrollbar

                const barWidth = viewport.width - (showVerticalBar ? scrollBarSize : 0);
                const barHeight = scrollBarSize;

                painter.setForeground(barBackground);
                painter.fillRect(0, viewport.height-barHeight, barWidth, barHeight);

                const factor = (scrollRect.width > 0) ? barWidth / scrollRect.width : 1;
                const barLeft = (viewport.left - scrollRect.left) * factor;
                const barRight = barWidth - (scrollRect.right - viewport.right) * factor;
                const barSliderSize = barRight - barLeft;
                painter.setForeground(barForeground);
                painter.fillRect(barLeft, viewport.height-barHeight, barSliderSize, barHeight);
            }

            if (showVerticalBar) {
                // vertical scrollbar

                const barWidth = scrollBarSize;
                const barHeight = viewport.height - (showHorizontalBar ? scrollBarSize : 0);

                painter.setForeground(barBackground);
                painter.fillRect(viewport.width-barWidth, 0, barWidth, barHeight);

                const factor = (scrollRect.height > 0) ? barHeight / scrollRect.height : 1;
                const barTop = (viewport.top - scrollRect.top) * factor;
                const barBottom = barHeight - (scrollRect.bottom - viewport.bottom) * factor;
                const barSliderSize = barBottom - barTop;
                painter.setForeground(barForeground);
                painter.fillRect(viewport.width-barWidth, barTop, barWidth, barSliderSize);
            }

        }

        painter.setForeground("#ff40ff");

        painter.fillRect(0, viewport.height/2, 4, 4);
        painter.fillRect(viewport.width-4, viewport.height/2, 4, 4);
        painter.fillRect(viewport.width/2, 0, 4, 4);
        painter.fillRect(viewport.width/2, viewport.height-4, 4, 4);

    }
}

class Editor {
    constructor() {
        this._state = new EditorState();
        const state = this._state;

        this._palette = Palette.community;
        this._data = null;
        this._window = new Window();
        this._view = new EditorView("idCanvas", this, state);

        this._toolbars = {
            topPanel: new Toolbar("idTopPanel"),
            colorsPanel: new Toolbar("idColorsPanel"),
            leftPanel: new Toolbar("idLeftPanel"),
            palettePanel: new Toolbar("idPalettePanel")
        };

        this.onCreate();
    }

    get window() { return this._window; }
    get state() { return this._state; }
    get palette() { return this._palette; }

    onCreate() {
        const thisInstance = this;
        const state = this.state;

        const palette = this.palette;

        for (let col = 0; col < palette.length; col++) {
            const element = document.getElementById("palette" + col);
            if (element) {
                element.style.background = palette[col];
            }
        }

        const toolbars = this._toolbars;
        const view = this._view;

        state.on("change.toolmode", (event, mode) => {
            toolbars.leftPanel.setValue(mode);
        });

        state.on("change.drawcolor", (event, color) => {
            toolbars.colorsPanel.setValue(color);
            const paletteIdx = state.colorMap[color];
            toolbars.palettePanel.setValue(paletteIdx);
        });

        state.on("change.palette", (event, color, paletteIdx) => {
            toolbars.palettePanel.setValue(paletteIdx);
            view.invalidate();
        });

        toolbars.leftPanel.on("change", (event, key, value) => {
            state.setToolMode(value)
        });

        toolbars.colorsPanel.on("change", (event, key, value) => {
            const color = parseInt(value, 10);
            state.setDrawColor(color);
        });

        toolbars.colorsPanel.on("longclick", (event, element) => {
            console.log("LONG CLICK: colors");
        });

        toolbars.palettePanel.on("change", (event, key, value) => {
            const color = parseInt(value, 10);
            state.setPaletteColor(color);

            const element = document.getElementById("color" + state.drawColor);
            if (element) {
                element.style.background = this.palette[color];
            }

        });

        const window = this._window;

        window.addEventListener('message', async e => {         // eslint-disable-line no-undef
            const message = e.data;
            if (message) {
                const type = message.type;
                if (type == 'init') {
                    //console.log("INIT");
                    thisInstance.setData(message.data);
                } else if (type == 'update') {
                    //console.log("UPDATE");
                    thisInstance.setData(message.data);
                }
            }
        });

        state.setToolMode('pen');
        state.setDrawColor(1);

        vscode.postMessage({ type: 'ready' });
    }

    invalidate() {
        if (this._view) this._view.invalidate();
    }

    get data() { return this._data; }

    setData(data) {
        this._data = data;
        this.invalidate();
    }

}
