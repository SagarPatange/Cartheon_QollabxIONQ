/**
 * The glowing qubit tower used by Levels 1 and 2: a tower with a glass window holding vertical stacks of qubit orbs,
 * and a readout badge over its battlements. Looks live in styles/qubit_tower.css.
 *
 * Reads and writes nothing; returns new elements.
 */

import { createElement } from "./page_helpers.js";


/**
 * A tower whose window holds the given stacks, left to right.
 *
 * @param {string} towerName - shown on the pipe.
 * @param {{name: string, orbCount: number}[]} stackSpecs - e.g. [{name: "block", orbCount: 7}, {name: "link", ...}];
 *     each stack gets the class is-<name>.
 * @returns {{towerElement: HTMLElement, readoutElement: HTMLElement, stacks: Object<string, HTMLElement[]>}} the
 *     tower, its readout badge, and each stack's orbs (top to bottom) by name.
 */
export function buildQubitTower(towerName, stackSpecs) {
    const towerElement = createElement("div", "tower qubit-tower");
    const windowElement = createElement("div", "qubit-window");
    const stacks = {};
    for (const stackSpec of stackSpecs) {
        const stackElement = createElement("div", `qubit-stack is-${stackSpec.name}`);
        stacks[stackSpec.name] = [];
        for (let i = 0; i < stackSpec.orbCount; i++) {
            const orbElement = createElement("span", "qubit-orb");
            stackElement.append(orbElement);
            stacks[stackSpec.name].push(orbElement);
        }
        windowElement.append(stackElement);
    }
    const bodyElement = createElement("div", "tower-body qubit-tower-body");
    bodyElement.append(windowElement);
    const readoutElement = createElement("div", "tower-readout");
    const nameElement = createElement("div", "tower-name");
    nameElement.textContent = towerName;
    towerElement.append(
        readoutElement, createElement("div", "tower-battlements"), bodyElement, createElement("div", "tower-pipe"),
        nameElement,
    );
    return { towerElement, readoutElement, stacks };
}
