//
// Color
//

//-----------------------------------------------------------------------------------------------//
// CSS parser
//-----------------------------------------------------------------------------------------------//

function parseCssColor(css) {
    css = css.trim();

    // clamp 0–255
    const clamp255 = (v) => Math.max(0, Math.min(255, v));

    // percent to 0–255
    const percentTo255 = (p) => clamp255(Math.round(parseFloat(p) * 2.55));

    // --- HEX #RGB ---
    let match = css.match(/^#([0-9a-fA-F]{3})$/);
    if (match) {
        const hex = match[1];
        return {
            r: parseInt(hex[0] + hex[0], 16),
            g: parseInt(hex[1] + hex[1], 16),
            b: parseInt(hex[2] + hex[2], 16),
            a: 255
        };
    }

    // --- HEX #RRGGBB ---
    match = css.match(/^#([0-9a-fA-F]{6})$/);
    if (match) {
        const hex = match[1];
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: 255
        };
    }

    // --- rgb / rgba ---
    match = css.match(/^rgba?\((.+)\)$/);
    if (match) {
        const parts = match[1].split(",").map(p => p.trim());

        if (parts.length < 3 || parts.length > 4) {
            return null;
        }

        const parseChannel = (val) => {
            if (val.endsWith("%")) {
                return percentTo255(val);
            }
            return clamp255(Number(val));
        };

        const r = parseChannel(parts[0]);
        const g = parseChannel(parts[1]);
        const b = parseChannel(parts[2]);

        let a = 255;
        if (parts.length === 4) {
            a = clamp255(parseFloat(parts[3]));
        }

        return { r, g, b, a };
    }

    return null;
}

function blendFn(a, b, ratio) {
    return Math.floor(a * ratio + b * (1.0 - ratio));
}

//-----------------------------------------------------------------------------------------------//
// Color
//-----------------------------------------------------------------------------------------------//

class Color {
    constructor(r=0, g=0, b=0, a=255) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }

    get red() { return this.r; }
    get green() { return this.g; }
    get blue() { return this.b; }
    get alpha() { return this.a; }

    toCss(withAlpha=false) {
        if (withAlpha) {
            return "rgb(" + this.r + "," + this.g + "," + this.b + "," + this.a + ")";
        } else {
            return "rgb(" + this.r + "," + this.g + "," + this.b + ")";
        }
    }

    static from(r, g, b, a=255) {
        return new Color(r, g, b, a);
    }

    static fromCss(css) {
        const rgba = parseCssColor(css);
        if (null == rgba) return null;
        return Color.from(rgba.r, rgba.g, rgba.b, rgba.a);
    }

    static blend(col0, col1, ratio) {
        ratio = Math.max(0, Math.min(255, ratio));
        return new Color(
            blendFn(col0.r, col1.r, ratio),
            blendFn(col0.g, col1.g, ratio),
            blendFn(col0.b, col1.b, ratio),
            blendFn(col0.a, col1.a, ratio)
        );
    }

}

Color.BLACK = Color.from(0, 0, 0);
Color.WHITE = Color.from(255, 255, 255);

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Color: Color
};
