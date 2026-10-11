/**
 * Small DOM and formatting helpers shared by the repeater page and the QKD page.
 *
 * Reads elements from the current document; writes nothing.
 */

const PERCENT = 100;
// .track-scroller's padding on each side (styles/world.css).
const SCROLLER_SIDE_PADDING_PX = 16;
// The goal line types itself out at this speed, then stays this long before it fades away.
const GOAL_TYPING_MS_PER_CHARACTER = 45;
const GOAL_HOLD_MS = 5000;
// Room for the typing cursor, so the line does not wrap while it types.
const GOAL_CURSOR_ROOM_PX = 24;


/**
 * Make an element with one class name.
 *
 * @param {string} tagName - e.g. "div".
 * @param {string} className - the class to set.
 * @returns {HTMLElement}
 */
export function createElement(tagName, className) {
    const element = document.createElement(tagName);
    element.className = className;
    return element;
}


/**
 * Zoom a track so its towers fill the world's height, without getting wider than the window.
 *
 * @param {{trackElement: HTMLElement, worldElement: HTMLElement, scrollerElement: HTMLElement}} elements
 * @param {{trackHeightPx: number, trackMinWidthPx: number, reservedHeightPx: number}} trackSize - the track's
 *     natural size, and how much of the world's height to leave free (ground, status line).
 */
export function fitTrackToWorld(elements, trackSize) {
    const freeHeight = elements.worldElement.clientHeight - trackSize.reservedHeightPx;
    const availableWidth = elements.scrollerElement.clientWidth - 2 * SCROLLER_SIDE_PADDING_PX;
    const heightScale = freeHeight / trackSize.trackHeightPx;
    const widthScale = availableWidth / trackSize.trackMinWidthPx;
    const scale = Math.max(1, Math.min(heightScale, widthScale));
    elements.trackElement.style.zoom = String(scale);
    elements.trackElement.style.width = `${availableWidth / scale}px`;
}


/**
 * The level's goal line, shown once: it types itself out letter by letter, stays GOAL_HOLD_MS, then fades away.
 * With reduced motion the whole line appears at once. Resolves as soon as the line is fully typed, which is when the
 * level starts taking input.
 *
 * @param {HTMLElement} statusElement - the .sky-status line, holding the goal text.
 * @returns {Promise<void>}
 */
export async function playGoalIntro(statusElement) {
    const goalText = statusElement.textContent;
    statusElement.setAttribute("aria-label", goalText);
    // A live region would read out every letter; screen readers get the whole line from aria-label instead.
    const ariaLive = statusElement.getAttribute("aria-live");
    statusElement.removeAttribute("aria-live");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!prefersReducedMotion) {
        // Measure in the pixel font, not the fallback it shows while still loading.
        await document.fonts.ready;
        // Fix the width first, so the box does not grow as each letter arrives.
        const fullWidthPx = statusElement.getBoundingClientRect().width + GOAL_CURSOR_ROOM_PX;
        statusElement.style.width = `${fullWidthPx}px`;
        statusElement.classList.add("is-typing");
        statusElement.textContent = "";
        for (const character of goalText) {
            statusElement.textContent += character;
            await waitMs(GOAL_TYPING_MS_PER_CHARACTER);
        }
        statusElement.classList.remove("is-typing");
    }
    if (ariaLive !== null) {
        statusElement.setAttribute("aria-live", ariaLive);
    }
    setTimeout(() => statusElement.classList.add("is-faded"), GOAL_HOLD_MS);
}


/**
 * Resolve after ms milliseconds.
 */
function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}


/**
 * Fill a .key-hints line with keycaps and what each key does.
 *
 * @param {HTMLElement} hintsElement - the empty #key-hints line.
 * @param {{key: string, action: string}[]} hints - in the order to show them.
 */
export function renderKeyHints(hintsElement, hints) {
    // Levels redraw many times a second; rebuilding unchanged keycaps would restart their bounce every frame.
    const hintsSignature = JSON.stringify(hints);
    if (hintsElement.dataset.signature === hintsSignature) {
        return;
    }
    hintsElement.dataset.signature = hintsSignature;
    hintsElement.replaceChildren();
    for (const hint of hints) {
        const hintElement = createElement("span", "key-hint");
        const keycapElement = createElement("span", "keycap");
        keycapElement.textContent = hint.key;
        hintElement.append(keycapElement, document.createTextNode(hint.action));
        hintsElement.append(hintElement);
    }
}


/**
 * Look up elements by id, failing fast if the page is missing one.
 *
 * @param {Object<string, string>} idsByName - e.g. {nextButton: "next-button"}.
 * @returns {Object<string, HTMLElement>} the same keys, mapped to elements.
 */
export function findElementsById(idsByName) {
    const elements = {};
    for (const [name, elementId] of Object.entries(idsByName)) {
        const element = document.getElementById(elementId);
        if (element === null) {
            throw new Error(`the page is missing #${elementId}`);
        }
        elements[name] = element;
    }
    return elements;
}


/**
 * Read an integer seed from a text box; a broken value falls back to the default and is written back.
 *
 * @param {HTMLInputElement} seedInput
 * @param {number} defaultSeed
 * @returns {number}
 */
export function readSeed(seedInput, defaultSeed) {
    const seed = Number.parseInt(seedInput.value, 10);
    if (Number.isNaN(seed)) {
        seedInput.value = String(defaultSeed);
        return defaultSeed;
    }
    return seed;
}


/**
 * Set up a probability slider and keep its percent label in sync.
 *
 * @param {HTMLInputElement} slider
 * @param {HTMLElement} label - shows the value as a percent.
 * @param {{max: number, step: number, value: number, decimalCount?: number}} range - decimalCount is how many
 *     decimals the label shows (1 by default).
 */
export function setUpPercentSlider(slider, label, range) {
    slider.min = "0";
    slider.max = String(range.max);
    slider.step = String(range.step);
    slider.value = String(range.value);

    function showSliderValue() {
        label.textContent = formatPercent(Number(slider.value), range.decimalCount);
    }
    slider.addEventListener("input", showSliderValue);
    showSliderValue();
}


/**
 * 0.034 → "3.4%"; with decimalCount 2, 0.0025 → "0.25%".
 */
export function formatPercent(probability, decimalCount = 1) {
    return `${(probability * PERCENT).toFixed(decimalCount)}%`;
}
