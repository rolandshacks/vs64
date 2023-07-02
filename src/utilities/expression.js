//
// Expression Parser
//


//-----------------------------------------------------------------------------------------------//
// Init module
//-----------------------------------------------------------------------------------------------//
// eslint-disable-next-line
BIND(module);

//-----------------------------------------------------------------------------------------------//
// Required Modules
//-----------------------------------------------------------------------------------------------//

//-----------------------------------------------------------------------------------------------//
// Expression Parser
//-----------------------------------------------------------------------------------------------//

class ExpressionLanguage {
    constructor() {
    }

    isWhitespace(c) {
        return (" \r\n\t".indexOf(c) >= 0);
    }

    isScopeBegin(c) {
        return ("(".indexOf(c) >= 0);
    }

    isScopeEnd(c) {
        return (")".indexOf(c) >= 0);
    }

    isOperand(c) {
        return (this.getOperandPrecedence(c) >= 0);
    }

    getOperandPrecedence(c) {
        return "+-*/".indexOf(c);
    }

    isAlpha(c) {
        return ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'));
    }

    isNumeric(c, base) {
        if (base == 2) {
            return (c == '0' || c == '1');
        } else if (base == 16) {
            return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
        }
        return (c >= '0' && c <= '9')
    }

    isSymbol(c) {
        return this.isAlpha(c) || this.isNumeric(c) || c == '_' || c == '.';
    }

    isExit(c) {
        return c == ',' || c == ';' || c == '\0';
    }

}

function _dumpTokens_(t) {
    if (null == t) console.log("null");
    let i=0;

    console.log("--------------------------");

    for (const e of t) {
        console.log(i + ": [" + e.type + "] '" + e.value + "'");
        ++i;
    }

}

function _dump_(o) {
    if (null == o) console.log("null");
    let i=0;

    console.log("--------------------------");

    for (const e of o) {
        console.log(i + ": '" + e + "'");
        ++i;
    }
}

class Expression {
    constructor(expr, onGetSymbolValue, options) {
        this._expr = expr;

        /*
            Options:
                language = Custom language syntax
                map  = Symbol map
                onGetSymbolValue = Symbol resolver
        */

        options ||= {};

        this._language = options.language || new ExpressionLanguage();
        this._symbolMap = null;
        if (options.symbols) {
            if (options.symbols instanceof Map) {
                this._symbolMap = options.symbols;
            } else {
                this._symbolMap = new Map(Object.entries(options.symbols));
            }
        }

        this._onResolveSymbol = onGetSymbolValue || options.onGetSymbolValue;

        this._tokens = null;
    }

    eval() {
        this.#parse();
        return this.#resolve();
    }

    #parse() {
        const expr = this._expr;
        if (!expr) return;

        const lang = this._language;

        let i=0;
        let len = expr.length;

        const tokens = [];
        let exit = false;

        while (!exit) {

            let token = null;
            const pos = i;
            const c = (i<len) ? expr[pos] : '\0';

            if (c == null || lang.isExit(c)) {
                token = {type: 'e', value: c};
                i++;
                exit = true;
            } else if (lang.isScopeBegin(c)) {
                token = {type: 'b', value: c};
                i++;
            } else if (lang.isScopeEnd(c)) {
                token = {type: 'e', value: c};
                i++;
            } else if (lang.isOperand(c)) {
                token = {type: 'o', value: c};
                i++;
            } else if (lang.isAlpha(c) || c == '_' || c == '.') {
                const start = i++;
                while (i<len && lang.isSymbol(expr[i]) && !lang.isExit(expr[i])) { ++i; }
                const slice = expr.substring(start, i);
                const numericValue = this.#symbolValueOf(slice);
                token = {type: 'n', value: numericValue};
            } else if (lang.isNumeric(c) || c == '$' || c == '%') {
                const start = i++;
                let base = 10;
                if (c == '$') {
                    base = 16;
                } else if (c == '%') {
                    base = 2;
                }
                while (i<len && lang.isNumeric(expr[i], base) && !lang.isExit(expr[i])) { ++i; }
                const slice = expr.substring(start, i);
                const numericValue = this.#numericValueOf(slice);
                token = {type: 'n', value: numericValue};
            } else {
                i++;
            }

            if (token != null) {
                token.position = pos;
                tokens.push(token);
            }

        }

        this._tokens = tokens;
    }

    #resolve() {

        const lang = this._language;
        const tokens = this._tokens;
        const op_stack = [];
        const val_stack = [];

        for (let i=0; i<tokens.length; i++) {
            const token = tokens[i];

            switch (token.type) {
                case 'o': {
                    // operand
                    op_stack.push(token.value);
                    break;
                }
                case 'b': {
                    // scope begin
                    op_stack.push(token.value);
                    break;
                }
                case 'e': {
                    // scope end

                    const compute_queue = [];

                    for (;;) {
                        //dump(op_stack);
                        //dump(val_stack);

                        if (op_stack.length == 0 && compute_queue.length == 0) {
                            break;
                        }

                        let precedence = -1;
                        const op =  (op_stack.length > 0) ? op_stack[op_stack.length-1] : null;
                        if (op != null && op != '(') {
                            precedence = lang.getOperandPrecedence(op);
                        }

                        let prev_precedence = -1;
                        const prev_op = (op_stack.length > 1) ? op_stack[op_stack.length-2] : null;
                        if (prev_op != null && prev_op != '(') {
                            prev_precedence = lang.getOperandPrecedence(prev_op);
                        }

                        let next_precedence = -1;
                        const next_op = (compute_queue.length > 0) ? compute_queue[0] : null;
                        if (next_op != null && next_op != '(') {
                            next_precedence = lang.getOperandPrecedence(next_op);
                        }

                        if (precedence >= prev_precedence && precedence > next_precedence) {

                            op_stack.pop();
                            let b = val_stack.pop();
                            let a = val_stack.pop();
                            const scopeValue = this.#compute(a, b, op);
                            val_stack.push(scopeValue)

                        } else {

                            if (next_precedence > -1 && next_precedence >= prev_precedence) {
                                compute_queue.shift();
                                let b = val_stack.pop();
                                let a = compute_queue.shift();
                                const scopeValue = this.#compute(b, a, next_op);
                                val_stack.push(scopeValue)
                            } else if (precedence >= 0) {
                                compute_queue.push(op_stack.pop());
                                compute_queue.push(val_stack.pop());
                            } else {
                                if (op == '(') op_stack.pop();
                                break; // done (reached end or "(")
                            }
                        }

                    }

                    break;
                }
                default: {
                    // value
                    val_stack.push(token.value);
                    break;
                }
            }

        }

        const value = val_stack.pop();

        return value;
    }

    #compute(operand_a, operand_b, operation) {

        let result = 0;
        switch (operation) {
            case '+': {
                result = (operand_a + operand_b);
                break;
            }
            case '-': {
                result = (operand_a - operand_b);
                break;
            }
            case '*': {
                result = (operand_a * operand_b);
                break;
            }
            case '/': {
                if (operand_b != 0) result = (operand_a / operand_b);
                break;
            }
            default: {
                break;
            }
        };
        return result;
    }

    #numericValueOf(numstr) {
        if (!numstr || numstr.length < 1) return 0;
        if (numstr[0] == "$") return parseInt(numstr.substring(1), 16);
        if (numstr[0] == "%") return parseInt(numstr.substring(1), 2);
        if (numstr.startsWith("0x")) return parseInt(numstr.substring(2), 16);
        if (numstr.startsWith("0b")) return parseInt(numstr.substring(2), 2);
        return parseInt(numstr, 10);
    }

    #symbolValueOf(name, defaultValue) {

        if (!name || name.length < 1) return 0;

        let value = null;

        if (this._onResolveSymbol) {
            value = this._onResolveSymbol(name);
        }

        if (null == value && this._symbolMap) {
            value = this._symbolMap.get(name);
        }

        if (null == value) {
            return (defaultValue||0);
        }

        if ((typeof value === 'string') || (value instanceof String)) {
            return this.#numericValueOf(value);
        }

        return value;
    }
}

//-----------------------------------------------------------------------------------------------//
// Module Exports
//-----------------------------------------------------------------------------------------------//

module.exports = {
    Expression: Expression
};
