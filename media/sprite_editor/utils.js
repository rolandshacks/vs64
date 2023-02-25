//
// Utility functions
//

class Utils {
    static equalsIgnoreCase(a, b) {
        if (null == a && null == b) return true;
        if (null == a || null == b) return false;

        const cmp = a.localeCompare(b, undefined, {sensitivity: "base"});
        return (0 == cmp);
    }

    static clamp(num, min, max) {
        return Math.min(Math.max(num, min), max);
    }

    static getUid() {
        const uid = ++Utils._uid_counter;
        return uid;
    }

}

Utils._uid_counter = 0;

class Point {
    constructor(x, y) {
        this.x = x||0;
        this.y = y||0;
    }

    get width() { return this.x; }
    get height() { return this.y; }
    set width(w) { this.x = w; }
    set height(h) { this.y = h; }

    set(x, y) {
        if (arguments.length == 1 && arguments[0] instanceof Point) {
            const point = arguments[0];
            this.x = point.x;
            this.y = point.y;
        } else {
            this.x = x;
            this.y = y;
        }
    }

    translate(pointDelta) {
        if (arguments.length == 2) {
            // overload, support (x, y)
            this.x += arguments[0];
            this.y += arguments[1];
        } else {
            this.x += pointDelta.x;
            this.y += pointDelta.y;
        }
    }

    clamp(rect) {
        if (this.x < rect.left) this.x = rect.left;
        else if (this.x > rect.right) this.x = rect.right;
        if (this.y < rect.top) this.y = rect.top;
        else if (this.y > rect.bottom) this.y = rect.bottom;
    }

    equals(point) {
        return (this.x == point.x && this.y == point.y);
    }
}

class Dimension extends Point {
    constructor(width, height) {
        super(width, height);
    }

}

class Rectangle {
    constructor(left, top, width, height) {
        this._left = left||0;
        this._top = top||0;
        this._width = width||0;
        this._height = height||0;
    }

    get x() { return this._left; }
    get y() { return this._top; }

    get left() { return this._left; }
    get top() { return this._top; }
    get width() { return this._width; }
    get height() { return this._height; }
    get right() { return this._left + this._width; }
    get bottom() { return this._top + this._height; }

    getLocation() { return new Point(this.left, this.top); }
    getSize() { return new Dimension(this.width, this.height); }

    set(left, top, width, height) {
        if (arguments.length == 1 && arguments[0] instanceof Rectangle) {
            const rect = arguments[0];
            this.setLocation(rect.left, rect.top);
            this.setSize(rect.width, rect.height);
        } else {
            this.setLocation(left, top);
            this.setSize(width, height);
        }
    }

    setLeft(left) {
        this._left = left;
    }

    setRight(right) {
        this._width = Math.max(0, right - this.left);
    }

    setWidth(width) {
        this._width = width;
    }

    setTop(top) {
        this._top = top;
    }

    setBottom(bottom) {
        this._height = Math.max(0, bottom - this.top);
    }

    setHeight(height) {
        this._height = height;
    }

    setLocation(left, top) {
        this._left = left;
        this._top = top;
    }

    setSize(width, height) {
        this._width = width;
        this._height = height;
    }

    contains(x, y) {
        return (x >= this.left && x < this.right && y >= this.top && y < this.bottom);
    }

    intersects(rect) {
        if (this.top > rect.bottom || this.bottom < rect.top) return false;
        if (this.left > rect.right || this.right < rect.left) return false;
        return true;
    }

    intersection(rect) {

        const r = new Rectangle();
        r._left = Math.max(this.left, rect.left);
        r._top = Math.max(this.top, rect.top);

        const right = Math.min(this.right, rect.right);
        r._width = Math.max(0, right - r.left);

        const bottom = Math.min(this.bottom, rect.bottom);
        r._height = Math.max(0, bottom - r.top);

        return r;
    }

    union(rect) {

        const r = new Rectangle();
        r._left = Math.min(this.left, rect.left);
        r._top = Math.min(this.top, rect.top);

        const right = Math.max(this.right, rect.right);
        r._width = Math.max(0, right - r.left);

        const bottom = Math.max(this.bottom, rect.bottom);
        r._height = Math.max(0, bottom - r.top);

        return r;
    }

    addPoint(x, y) {
        if (x < this.left) this.setLeft(x);
        if (x > this.right) this.setRight(x);
        if (y < this.top) this.setTop(y);
        if (y > this.bottom) this.setBottom(y);
    }

}
