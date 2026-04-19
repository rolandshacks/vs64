//
// Arguments test
//

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Color } = require('graphics/color');

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('color', () => {
    test("color_basics", () => {

        const c0 = Color.fromCss("#123456");
        expect(c0.r).toBe(0x12);
        expect(c0.g).toBe(0x34);
        expect(c0.b).toBe(0x56);
        expect(c0.a).toBe(0xff);

        const c1 = Color.fromCss("rgb(12,34,56)");
        expect(c1.r).toBe(12);
        expect(c1.g).toBe(34);
        expect(c1.b).toBe(56);
        expect(c1.a).toBe(255);

        const c2 = Color.fromCss("rgb(12,34,56,78)");
        expect(c2.r).toBe(12);
        expect(c2.g).toBe(34);
        expect(c2.b).toBe(56);
        expect(c2.a).toBe(78);

        const c3 = Color.blend(Color.from(90,80,70,60), Color.from(0,0,0,0), 0.1);
        expect(c3.r).toBe(9);
        expect(c3.g).toBe(8);
        expect(c3.b).toBe(7);
        expect(c3.a).toBe(6);

    });

});  // describe
