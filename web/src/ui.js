/**
 * Web UI
 * @module Web
 */

import '@fluentui/web-components/web-components.js';
import { setTheme } from '@fluentui/web-components';
import { webLightTheme, webDarkTheme } from '@fluentui/tokens';
//import document from '../../src/views/document';

/**
 * UI.
 */
export class UI {
    static init() {
        const theme = document.body.classList.contains('vscode-light')
            ? webLightTheme
            : webDarkTheme;
        setTheme(theme, document.body);
    }
}
