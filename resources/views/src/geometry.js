/**
 * Geometry
 * @module Web
 *
 */

class Vector2 {
    constructor(x, y) {
        this.x = x||0;
        this.y = y||0;
    }

    static from(x, y) {
        const v = new Vector2();
        v.set(x, y);
        return v;
    }

    set(x, y) {

        // support both tuple (x, y) as well as vector/size/point objects

        if (null == x) {
            this.x = 0;
            this.y = 0;
            return;
        }

        if (null != x) {
            if (typeof x == "object") {
                this.x = x.x;
                this.y = x.y;
                return;
            } else {
                this.x = x;
            }
        }

        if (null != y) {
            this.y = y;
        }
    }

    toString() {
        return "(" + this.x + ", " + this.y + ")";
    }

    static add(a, b) {
        return Vector2.from(a.x + b.x, a.y + b.y);
    }

    static sub(a, b) {
        return Vector2.from(a.x - b.x, a.y - b.y);
    }

    static scale(a, b) {
        return Vector2.from(a.x * b, a.y * b);
    }
}

class Point extends Vector2 {
}

class Size extends Vector2 {
    get width() { return this.x; }
    get height() { return this.y; }
}

/**
 * Rectangle
 */
class Rectangle {
    constructor(x, y, width, height) {
        this.set(x, y, width, height);
    }

    get top() { return this.y; }
    get bottom() { return this.y + this.height; }
    get left() { return this.x; }
    get right() { return this.x + this.width; }

    static from(x, y, width, height) {
        return new Rectangle(x, y, width, height);
    }

    toString() {
        return "(" + this.x + ", " + this.y + "," + this.width + ", " + this.height + ")";
    }

    set(x, y, width, height) {
        this.x = x||0;
        this.y = y||0;
        this.width = width||0;
        this.height = height||0;
    }

    clone() {
        return new Rectangle(this.x, this.y, this.width, this.height);
    }

    getSize() {
        return new Size(this.width, this.height);
    }

    setSize(x, y) {
        this.width = x;
        this.height = y;
    }

    setPosition(x, y) {
        this.x = x||0;
        this.y = y||0;
    }

    getLeftTop() {
        return new Point(this.left, this.top);
    }

    getRightBottom() {
        return new Point(this.right, this.bottom);
    }

}

export {
    Vector2, Point, Size, Rectangle
};
