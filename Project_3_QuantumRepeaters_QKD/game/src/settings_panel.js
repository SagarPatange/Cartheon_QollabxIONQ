/**
 * A slide-in settings panel: one card per setting, with its name, its value in a chip, a slider, and the slider's
 * smallest and largest values underneath. Looks live in styles/settings_panel.css; the page decides what the settings
 * mean.
 *
 * Writes only inside the given rows element.
 */

import { createElement } from "./page_helpers.js";

const PERCENT = 100;


/**
 * Draw one card per setting spec and report every change.
 *
 * @param {HTMLElement} rowsElement - the panel's empty rows container.
 * @param {{id: string, label: string, min: number, max: number, step: number}[]} specs
 * @param {Object<string, number>} settings - current values by id.
 * @param {(spec: object, value: number) => string} formatValue - how a value reads on screen.
 * @param {(id: string, value: number) => void} onChange - called on every slider move.
 */
export function buildSettingsRows(rowsElement, specs, settings, formatValue, onChange) {
    for (const spec of specs) {
        const valueElement = createElement("span", "setting-value");
        const sliderElement = buildSlider(spec, settings[spec.id]);
        showSliderValue(sliderElement, valueElement, spec, formatValue);
        sliderElement.addEventListener("input", () => {
            showSliderValue(sliderElement, valueElement, spec, formatValue);
            onChange(spec.id, Number(sliderElement.value));
        });

        const cardElement = createElement("label", "setting-card");
        cardElement.dataset.settingId = spec.id;
        cardElement.append(
            buildCardHead(spec.label, valueElement), sliderElement, buildRangeLabels(spec, formatValue),
        );
        rowsElement.append(cardElement);
    }
}


/**
 * The card's top line: the setting's name on the left, its value chip on the right.
 */
function buildCardHead(label, valueElement) {
    const headElement = createElement("span", "setting-head");
    const nameElement = createElement("span", "setting-name");
    nameElement.textContent = label;
    headElement.append(nameElement, valueElement);
    return headElement;
}


/**
 * A range input set to the spec's limits and the current value.
 */
function buildSlider(spec, value) {
    const sliderElement = createElement("input", "setting-slider");
    Object.assign(sliderElement, { type: "range", min: spec.min, max: spec.max, step: spec.step });
    sliderElement.value = String(value);
    return sliderElement;
}


/**
 * The slider's smallest and largest values, under each end of it.
 */
function buildRangeLabels(spec, formatValue) {
    const rangeElement = createElement("span", "setting-range");
    const minElement = createElement("span", "setting-range-end");
    minElement.textContent = formatValue(spec, spec.min);
    const maxElement = createElement("span", "setting-range-end");
    maxElement.textContent = formatValue(spec, spec.max);
    rangeElement.append(minElement, maxElement);
    return rangeElement;
}


/**
 * Write the slider's value into its chip, and fill the track up to the thumb.
 */
function showSliderValue(sliderElement, valueElement, spec, formatValue) {
    const value = Number(sliderElement.value);
    valueElement.textContent = formatValue(spec, value);
    const filledPercent = ((value - spec.min) / (spec.max - spec.min)) * PERCENT;
    sliderElement.style.setProperty("--fill", `${filledPercent}%`);
}


/**
 * Mark one setting's row (or none) for a guided tour, and scroll it into view.
 *
 * @param {HTMLElement} rowsElement - the panel's rows container, filled by buildSettingsRows.
 * @param {string | null} settingId - the setting to point at, or null for none.
 */
export function highlightSettingRow(rowsElement, settingId) {
    for (const cardElement of rowsElement.querySelectorAll(".setting-card")) {
        const isHighlighted = cardElement.dataset.settingId === settingId;
        cardElement.classList.toggle("is-highlighted", isHighlighted);
        if (isHighlighted) {
            cardElement.scrollIntoView({ block: "nearest" });
        }
    }
}
