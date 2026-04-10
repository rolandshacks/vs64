/**
 * Web UI
 * @module Web
 */

import {
    allComponents,
    provideFluentDesignSystem,
    baseLayerLuminance
} from '../../node_modules/@fluentui/web-components/dist/web-components.js';

/**
 * UI.
 */
export class UI {
    static init() {
        provideFluentDesignSystem()
            .withDesignTokenRoot(document.body)
            .register(allComponents);

        if (document.body.className == "vscode-light") {
            baseLayerLuminance.setValueFor(document.body, 0.9); // light
        } else {
            baseLayerLuminance.setValueFor(document.body, 0.1); // dark
        }
    }
}
