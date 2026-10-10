/**
 * A slide-in settings panel: one labelled slider per setting, its value beside the label. Looks live in
 * styles/settings_panel.css; the page decides what the settings mean.
 *
 * Writes only inside the given rows element.
 */

import { createElement } from "./page_helpers.js";


/**
 * Draw one slider row per setting spec and report every change.
 *
 * @param {HTMLElement} rowsElement - the panel's empty rows container.
 * @param {{id: string, label: string, min: number, max: number, step: number}[]} specs
 * @param {Object<string, number>} settings - current values by id.
 * @param {(spec: object, value: number) => string} formatValue - how a value reads on screen.
 * @param {(id: string, value: number) => void} onChange - called on every slider move.
 */
export function buildSettingsRows(rowsElement, specs, settings, formatValue, onChange) {
    for (const spec of specs) {
        const rowElement = createElement("label", "settings-row");
        const headElement = createElement("span", "settings-row-head");
        const nameElement = createElement("span", "settings-name");
        nameElement.textContent = spec.label;
        const valueElement = createElement("span", "settings-value");
        valueElement.textContent = formatValue(spec, settings[spec.id]);
        headElement.append(nameElement, valueElement);

        const sliderElement = createElement("input", "settings-slider");
        Object.assign(sliderElement, { type: "range", min: spec.min, max: spec.max, step: spec.step });
        sliderElement.value = String(settings[spec.id]);
        sliderElement.addEventListener("input", () => {
            const value = Number(sliderElement.value);
            valueElement.textContent = formatValue(spec, value);
            onChange(spec.id, value);
        });
        rowElement.append(headElement, sliderElement);
        rowsElement.append(rowElement);
    }
}
