/**
 * Draw Level 6's swap tutorial on the messaging world: each castle's window becomes a rack of qubit slots, one column
 * of 3 per notebook register (Alice 6: a, b; Bob 12: c, d and a2, b2; Charlie 6: c2, d2), plus bits riding the fiber,
 * corrections flashing on the qubits they act on, and the logical pairs as arcs and the end-to-end beam.
 *
 * The pages themselves (text, end states, animations) come from swap_tutorial_plan.js. Looks live in
 * styles/swap_tutorial.css; the orb colours are qubit_tower.css's.
 */

import { DATA_REGISTERS, QUBITS_PER_BLOCK, TOWER_REGISTER_GROUPS } from "./chain_slots.js";
import {
    CORRECTION_TONE, ERROR_TONE, FIX_TONE, FLASH_EFFECT, HERALD_EFFECT, PACKET_EFFECT, describeScene,
} from "./swap_tutorial_plan.js";
import { createElement } from "../page_helpers.js";

// Match the animations in styles/swap_tutorial.css.
const HERALD_MS = 1000;
const PACKET_FLIGHT_MS = 1100;
const FLASH_MS = 900;

// Each look from the plan is one class; most are qubit_tower.css's orb colours.
const LOOK_CLASSES = {
    waiting: "is-waiting",
    idle: "is-idle",
    pair: "is-pair",
    plus: "is-plus",
    zero: "is-zero",
    bell: "is-bell",
    measured: "is-measured",
    used: "is-used",
    flipped: "is-flipped",
    fixed: "is-fixed",
};
const TONE_CLASSES = { [CORRECTION_TONE]: "is-correction", [ERROR_TONE]: "is-error", [FIX_TONE]: "is-fix" };


/**
 * Put a rack of qubit slots in every castle and a bit packet on every link. The slots stay up in the messages too,
 * where render_qkd_state.js draws them with drawSlots.
 *
 * @param {{trackElement: HTMLElement, towerElements: HTMLElement[], linkElements: HTMLElement[]}} world - from
 *     buildQkdTrack.
 * @returns {object} the tutorial scene: the world's elements plus each register's orbs and each link's packet.
 */
export function buildSwapTutorialScene(world) {
    const orbsByRegister = {};
    for (let i = 0; i < world.towerElements.length; i++) {
        const rackElement = createElement("div", "swap-rack");
        for (const registerGroup of TOWER_REGISTER_GROUPS[i]) {
            rackElement.append(buildRegisterGroup(registerGroup, orbsByRegister));
        }
        world.towerElements[i].querySelector(".tower-body").append(rackElement);
    }
    const packetElements = [];
    for (const linkElement of world.linkElements) {
        const packetElement = createElement("div", "swap-packet");
        linkElement.append(packetElement);
        packetElements.push(packetElement);
    }
    return { ...world, orbsByRegister, packetElements };
}


/**
 * One tower side's registers, each a column of 3 orbs (row i is qubit i) with its name under it.
 */
function buildRegisterGroup(registerNames, orbsByRegister) {
    const groupElement = createElement("div", "swap-group");
    for (const registerName of registerNames) {
        const registerElement = createElement("div", "swap-register");
        const isData = DATA_REGISTERS.includes(registerName);
        registerElement.classList.toggle("is-data", isData);
        orbsByRegister[registerName] = [];
        for (let i = 0; i < QUBITS_PER_BLOCK; i++) {
            const orbElement = createElement("span", "qubit-orb swap-orb");
            orbElement.setAttribute("aria-label", `${registerName}[${i}]`);
            registerElement.append(orbElement);
            orbsByRegister[registerName].push(orbElement);
        }
        const nameElement = createElement("span", "swap-register-name");
        nameElement.textContent = registerName;
        registerElement.append(nameElement);
        groupElement.append(registerElement);
    }
    return groupElement;
}


/**
 * Show or hide the tutorial's layer of the world (the racks, and the tutorial's arcs and beam).
 *
 * @param {object} scene - from buildSwapTutorialScene.
 * @param {boolean} isShown
 */
export function showTutorialLayer(scene, isShown) {
    scene.trackElement.classList.toggle("is-tutorial", isShown);
    if (!isShown) {
        resetTutorialScene(scene);
    }
}


/**
 * Before a run arrives: every slot empty and waiting, no pairs, no beam.
 *
 * @param {object} scene - from buildSwapTutorialScene.
 */
export function resetTutorialScene(scene) {
    for (const orbElements of Object.values(scene.orbsByRegister)) {
        for (const orbElement of orbElements) {
            orbElement.className = "qubit-orb swap-orb is-waiting";
            orbElement.textContent = "";
        }
    }
    for (const linkElement of scene.linkElements) {
        linkElement.classList.remove("has-bell-pairs", "has-logical-pair", "is-heralding");
    }
    scene.trackElement.classList.remove("has-end-to-end-pair");
}


/**
 * Play a page's animations, then draw the world as it is once the page is shown. Resolves when both have finished.
 *
 * @param {object} scene
 * @param {object} response - RepetitionSwapResponse JSON.
 * @param {{effects: object[], stepNumber: number, focusedRegisters: string[]}} page - from buildTutorialPages.
 */
export async function playTutorialPage(scene, response, page) {
    for (const effect of page.effects) {
        await playEffect(scene, effect);
    }
    renderTutorialScene(scene, response, page.stepNumber, page.focusedRegisters);
}


/**
 * Draw every orb, arc and beam as describeScene says they are after stepNumber steps; the focused registers glow.
 *
 * @param {object} scene
 * @param {object} response
 * @param {number} stepNumber - 0 (before Step 1) to STEP_COUNT.
 * @param {string[]} focusedRegisters - e.g. ["d", "a2"] while a page talks about them.
 */
export function renderTutorialScene(scene, response, stepNumber, focusedRegisters) {
    const sceneState = describeScene(response, stepNumber);
    drawSlots(scene, sceneState.qubits, focusedRegisters);
    for (let i = 0; i < scene.linkElements.length; i++) {
        scene.linkElements[i].classList.toggle("has-bell-pairs", sceneState.pairedLinks[i]);
        scene.linkElements[i].classList.toggle("has-logical-pair", sceneState.logicalLinks[i]);
    }
    scene.trackElement.classList.toggle("has-end-to-end-pair", sceneState.hasEndToEndPair);
}


/**
 * Give every slot its look and text; the focused registers glow.
 *
 * @param {object} scene - from buildSwapTutorialScene.
 * @param {Object<string, {look: string, text: string}[]>} qubits - by register name, e.g. from describeScene or
 *     describeMessageSlots.
 * @param {string[]} focusedRegisters
 */
export function drawSlots(scene, qubits, focusedRegisters) {
    for (const [registerName, qubitStates] of Object.entries(qubits)) {
        const orbElements = scene.orbsByRegister[registerName];
        const isFocused = focusedRegisters.includes(registerName);
        for (let i = 0; i < orbElements.length; i++) {
            orbElements[i].className = `qubit-orb swap-orb ${LOOK_CLASSES[qubitStates[i].look]}`;
            orbElements[i].classList.toggle("is-focused", isFocused);
            orbElements[i].textContent = qubitStates[i].text;
        }
    }
}


/**
 * One animation: the BSM tower heralding, bits riding the fiber, or a letter flashing on some orbs.
 */
async function playEffect(scene, effect) {
    if (effect.kind === HERALD_EFFECT) {
        const linkElement = scene.linkElements[effect.link];
        restartClass(linkElement, "is-heralding");
        await wait(HERALD_MS);
        linkElement.classList.remove("is-heralding");
    } else if (effect.kind === PACKET_EFFECT) {
        await sendPacket(scene.packetElements[effect.link], effect.text, effect.direction);
    } else if (effect.kind === FLASH_EFFECT) {
        await flashOrbs(scene.orbsByRegister[effect.register], effect);
    } else {
        throw new Error(`unknown tutorial effect ${effect.kind}`);
    }
}


/**
 * Bits ride along the fiber, left to right or right to left, as a string over it.
 */
async function sendPacket(packetElement, text, direction) {
    packetElement.textContent = text;
    packetElement.className = "swap-packet";
    void packetElement.offsetWidth;
    packetElement.classList.add(direction === "right" ? "is-to-right" : "is-to-left");
    await wait(PACKET_FLIGHT_MS);
    packetElement.className = "swap-packet";
}


/**
 * The named orbs flash a letter (X or Z for a correction, the new bit for a fix) in the effect's tone, then go back to
 * what they showed. No positions means nothing to flash and no wait.
 */
async function flashOrbs(orbElements, effect) {
    if (effect.positions.length === 0) {
        return;
    }
    const shownTexts = [];
    const toneClass = TONE_CLASSES[effect.tone];
    for (const position of effect.positions) {
        const orbElement = orbElements[position];
        shownTexts.push(orbElement.textContent);
        orbElement.textContent = effect.letter;
        restartClass(orbElement, "is-flashing");
        orbElement.classList.add(toneClass);
    }
    await wait(FLASH_MS);
    for (let i = 0; i < effect.positions.length; i++) {
        const orbElement = orbElements[effect.positions[i]];
        orbElement.textContent = shownTexts[i];
        orbElement.classList.remove("is-flashing", toneClass);
    }
}


/**
 * Remove and re-add a class so its CSS animation plays again from the start.
 */
function restartClass(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
}


/**
 * Resolve after ms milliseconds (at once with reduced motion, where the animations are off).
 */
function wait(ms) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return new Promise((resolve) => setTimeout(resolve, prefersReducedMotion ? 0 : ms));
}
