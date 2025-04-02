const { defineConfig } = require("eslint/config");
const globals = require("globals");

module.exports = defineConfig([
	{
		files: [
			"src/**/*.js",
			"test/**/*.js"
		],

		ignores: [
			"build/**/*",
			"tools/**/*",
			"node_modules/**/*"
		],

		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "commonjs",
			globals: {
				...globals.jest,
				...globals.node,
				BIND: false,
				__dirname: false,
				__context: false
			}
		},

		linterOptions: {
			reportUnusedDisableDirectives: false
		},

		rules: {
			"no-const-assign": "warn",
			"no-this-before-super": "warn",
			"no-undef": "warn",
			"no-unreachable": "warn",
			"no-unused-vars": [
				"warn", {
					"vars": "all",
					"varsIgnorePattern": "^_",
					"args": "after-used",
					"argsIgnorePattern": "^_",
					"ignoreRestSiblings": false,
					"caughtErrors": "all",
					"caughtErrorsIgnorePattern": "^_"
				}
			],
			"constructor-super": "warn",
			"valid-typeof": "warn"
		}
	},
]);
