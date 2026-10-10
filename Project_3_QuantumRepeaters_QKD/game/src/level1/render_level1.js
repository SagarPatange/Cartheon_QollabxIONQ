/**
 * Level 1's scene: Mario beside his qubit tower, the fiber with the BSM telecom tower and its detectors, Luigi's
 * qubit tower and Luigi beside it. Each tower's window holds a vertical stack of 3 memory slots for Bell pairs.
 * Lesson notes (over Mario's tower, Luigi's tower or the BSM) explain what just happened while the game is paused.
 *
 * Looks live in styles/qubit_tower.css, styles/bsm_link.css and styles/level1.css.
 */

import { MEMORY_SLOT_COUNT, countPairs, findLifeLeft, isRoundCleared } from "./level1_protocol.js";
import { buildBsmLink, showDetectorClick } from "../bsm_link.js";
import { createElement } from "../page_helpers.js";
import { LUIGI_SPRITE, MARIO_SPRITE } from "../pixel_sprites.js";
import { buildStation } from "../qkd/render_qkd_world.js";
import { buildQubitTower } from "../qubit_tower.js";

// Below this much life left, a pair's orbs pulse to warn that they are about to decohere.
const FADING_LIFE_LEFT = 0.3;
// Where a lesson note can hang: over Mario's tower, over Luigi's, or over the BSM in the middle.
export const MARIO_NOTE = "mario";
export const LUIGI_NOTE = "luigi";
export const BSM_NOTE = "bsm";


/**
 * Fill the empty track and return every element the page changes later.
 *
 * @param {HTMLElement} trackElement
 * @returns {object} the scene.
 */
export function buildLevel1Track(trackElement) {
    const marioStation = buildStation("Mario", MARIO_SPRITE, "mario");
    const luigiStation = buildStation("Luigi", LUIGI_SPRITE, "luigi");
    const memoryStack = { name: "memory", orbCount: MEMORY_SLOT_COUNT };
    const mario = buildQubitTower("Mario", [memoryStack]);
    const luigi = buildQubitTower("Luigi", [memoryStack]);
    const linkElement = buildBsmLink();
    const clearBannerElement = createElement("div", "round-clear-banner");
    clearBannerElement.textContent = "ROUND CLEAR!";
    trackElement.append(
        marioStation, mario.towerElement, linkElement, luigi.towerElement, luigiStation, clearBannerElement,
    );
    return {
        marioStation, luigiStation, linkElement, clearBannerElement,
        luigiReadout: luigi.readoutElement,
        memoryOrbs: { mario: mario.stacks.memory, luigi: luigi.stacks.memory },
        notes: {
            [MARIO_NOTE]: buildLessonNote(mario.towerElement, "is-mario"),
            [LUIGI_NOTE]: buildLessonNote(luigi.towerElement, "is-luigi"),
            [BSM_NOTE]: buildLessonNote(linkElement, "is-bsm"),
        },
    };
}


/**
 * A lesson note hung over a tower or the BSM, hidden until needed. Its last line says how to carry on.
 * anchorClass lines it up so it never runs off the screen.
 */
function buildLessonNote(parentElement, anchorClass) {
    const noteElement = createElement("div", `lesson-note ${anchorClass}`);
    const continueElement = createElement("p", "lesson-continue");
    continueElement.textContent = "Press Space to continue ▶";
    noteElement.append(createElement("p", "lesson-text"), continueElement);
    noteElement.hidden = true;
    parentElement.append(noteElement);
    return noteElement;
}


/**
 * Show one lesson note with the given text, or hide them all (anchor null).
 *
 * @param {object} scene
 * @param {string | null} anchor - MARIO_NOTE, LUIGI_NOTE, BSM_NOTE or null.
 * @param {string} [text]
 */
export function showLessonNote(scene, anchor, text) {
    for (const [noteAnchor, noteElement] of Object.entries(scene.notes)) {
        const isShown = noteAnchor === anchor;
        noteElement.hidden = !isShown;
        if (isShown) {
            noteElement.querySelector(".lesson-text").textContent = text;
        }
    }
}


/**
 * Draw the game: memory orbs (glow fading with age, fizzling when they decohere), the BSM's lit detector and bump,
 * the Bell-pair arc, the teleported qubit, and the round-clear banner.
 *
 * @param {object} scene - from buildLevel1Track.
 * @param {{state: object, clockMs: number, lifetimeMs: number,
 *          fizzles: {side: string, slotIndex: number, untilMs: number}[]}} game
 */
export function renderLevel1Scene(scene, game) {
    const state = game.state;
    scene.linkElement.classList.toggle("is-heralding", state.lastAttemptSucceeded === true);
    scene.linkElement.classList.toggle("has-logical-pair", countPairs(state) > 0);
    scene.linkElement.classList.toggle("is-tapped", state.lastAttemptSucceeded === false);
    showDetectorClick(scene.linkElement, state.clickedDetector);
    for (const side of Object.keys(scene.memoryOrbs)) {
        renderMemoryStack(scene.memoryOrbs[side], side, game);
    }
    renderTeleport(scene, state.teleport);
    scene.clearBannerElement.classList.toggle("is-visible", isRoundCleared(state));
}


/**
 * One tower's memory slots: a stored pair glows gold, dimmer as it ages; a qubit that just decohered fizzles.
 */
function renderMemoryStack(orbElements, side, game) {
    for (let i = 0; i < orbElements.length; i++) {
        const orbElement = orbElements[i];
        const pair = game.state.slots[i];
        const isFizzling = game.fizzles.some((fizzle) => fizzle.side === side && fizzle.slotIndex === i);
        orbElement.className = "qubit-orb";
        if (isFizzling) {
            orbElement.classList.add("is-decohered");
        } else if (pair !== null) {
            const lifeLeft = findLifeLeft(pair, game.clockMs, game.lifetimeMs);
            orbElement.classList.add("is-pair");
            orbElement.classList.toggle("is-fading", lifeLeft < FADING_LIFE_LEFT);
            orbElement.style.setProperty("--life", lifeLeft.toFixed(2));
        }
    }
}


/**
 * After a teleport: Mario says what he sent, and the badge on Luigi's tower shows what arrived.
 */
function renderTeleport(scene, teleport) {
    const hasTeleport = teleport !== null;
    scene.luigiReadout.textContent = hasTeleport ? `|${teleport.receivedBit}⟩` : "";
    const bubbleElement = scene.marioStation.querySelector(".station-bubble");
    bubbleElement.classList.toggle("is-visible", hasTeleport);
    bubbleElement.textContent = hasTeleport ? `Sent |${teleport.sentBit}⟩` : "";
}


/**
 * Mario and Luigi jump for joy: a new Bell pair links them.
 */
export function playPairJump(scene) {
    for (const stationElement of [scene.marioStation, scene.luigiStation]) {
        const plumberElement = stationElement.querySelector(".plumber");
        plumberElement.classList.remove("is-jumping");
        void plumberElement.offsetWidth;
        plumberElement.classList.add("is-jumping");
    }
}
