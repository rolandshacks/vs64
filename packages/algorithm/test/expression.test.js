//
// Expression test
//

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//
const { Expression } = require('algorithm/expression');

//-----------------------------------------------------------------------------------------------//
// Tests
//-----------------------------------------------------------------------------------------------//

describe('expression', () => {
    test("expression_basics", () => {

        const str = "1 + ( $2 * 3 + aaa) + 5";
        //const str = "$1F8+2";

        const expr = new Expression(str, (name) => {
            if (name == "aaa") return "4";
            return 0;
        });

        const result = expr.eval();

        expect(result).toBe(16);

    });

});  // describe
