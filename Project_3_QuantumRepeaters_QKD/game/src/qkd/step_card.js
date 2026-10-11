/**
 * The card in Level 6's sky that says what is happening: the swap tutorial's step, or the step of a message being
 * played back. Fills the #step-card elements of qkd.html; looks live in styles/swap_tutorial.css.
 */

import { createElement } from "../page_helpers.js";
import { buildKet } from "../qubit_tower.js";


/**
 * Write one card into the sky: a counter, a title, and lines of text and logical kets. Null hides the card.
 *
 * @param {{cardElement: HTMLElement, counterElement: HTMLElement, titleElement: HTMLElement,
 *     bodyElement: HTMLElement}} card
 * @param {{counter: string, title: string, lines: Array<Array<string|{symbol: string, superscript?: string}>>,
 *     isPaused?: boolean, tone?: "win" | "lose" | null} | null} content - isPaused marks a lesson note, where the
 *     game waits for Space; tone colours the card for a message's result.
 */
export function showStepCard(card, content) {
    const isVisible = content !== null;
    card.cardElement.classList.toggle("is-visible", isVisible);
    card.cardElement.classList.toggle("is-paused", isVisible && content.isPaused === true);
    card.cardElement.classList.toggle("is-win", isVisible && content.tone === "win");
    card.cardElement.classList.toggle("is-lose", isVisible && content.tone === "lose");
    card.bodyElement.replaceChildren();
    if (!isVisible) {
        card.counterElement.textContent = "";
        card.titleElement.textContent = "";
        return;
    }
    card.counterElement.textContent = content.counter;
    card.titleElement.textContent = content.title;
    for (const line of content.lines) {
        const lineElement = createElement("p", "step-card-line");
        for (const part of line) {
            lineElement.append(typeof part === "string" ? part : buildKet(part));
        }
        card.bodyElement.append(lineElement);
    }
}
