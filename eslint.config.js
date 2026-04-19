const { defineConfig } = require("eslint/config");
const globals = require("globals");

module.exports = defineConfig([
	{
		ignores: [
			"build/**",
			"dist/**",
			"tools/**",
			"node_modules/**"
		]
	},
	{
		files: [
			"src/**/*.js",
			"test/**/*.js",
			"packages/**/*.js"
		],

		languageOptions: {
			ecmaVersion: "latest",
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
	{
		files: [
			"web/**/*.js"
		],

		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				console: false,
				document: false,
				window: false,
				getComputedStyle: false,
				fetch: false
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
