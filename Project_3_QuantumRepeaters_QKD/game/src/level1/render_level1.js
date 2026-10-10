/**
 * Level 1's scene: Mario beside his qubit tower, the fiber with the BSM telecom tower and its detectors, Luigi's
 * qubit tower and Luigi beside it. Each tower's window holds a vertical stack of 3 memory slots for Bell pairs.
 * Lesson notes (over Mario's tower, Luigi's tower or the BSM) explain what just happened while the game is paused.
 *
 * Looks live in styles/qubit_tower.css, styles/bsm_link.css and styles/level1.css.
 */

import { MEMORY_LESSON } from "./level1_lessons.js";
import {
    MEMORY_SLOT_COUNT, MINUS_DETECTOR, PLUS_DETECTOR, countPairs, findLifeLeft, isRoundCleared,
} from "./level1_protocol.js";
import { computeArrivalBrightness, findDetectorWear, findLinkWidthFraction } from "./level1_settings.js";
import { buildBsmLink, showDetectorClicks } from "../bsm_link.js";
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
// A note's last line while it is still locked (the player is reading), and once it can be put away.
// Three plain dots, not "…": the pixel font has no ellipsis, and the fallback font makes the line taller.
export const LOCKED_CONTINUE_TEXT = "Read the note...";
export const READY_CONTINUE_TEXT = "Space to continue ▶";


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
    const distanceElement = createElement("span", "link-distance");
    linkElement.append(distanceElement);
    const clearBannerElement = createElement("div", "round-clear-banner");
    clearBannerElement.textContent = "ROUND CLEAR!";
    trackElement.append(
        marioStation, mario.towerElement, linkElement, luigi.towerElement, luigiStation, clearBannerElement,
    );
    return {
        marioStation, luigiStation, linkElement, distanceElement, clearBannerElement,
        towerElements: [mario.towerElement, luigi.towerElement],
        memoryOrbs: { mario: mario.stacks.memory, luigi: luigi.stacks.memory },
        notes: {
            [MARIO_NOTE]: buildLessonNote(mario.towerElement, "is-mario"),
            [LUIGI_NOTE]: buildLessonNote(luigi.towerElement, "is-luigi"),
            [BSM_NOTE]: buildLessonNote(linkElement, "is-bsm"),
        },
    };
}


/**
 * A lesson note hung over a tower or the BSM, hidden until needed. Its last line says how to carry on, once the
 * note unlocks. anchorClass lines it up so it never runs off the screen.
 */
function buildLessonNote(parentElement, anchorClass) {
    const noteElement = createElement("div", `lesson-note ${anchorClass}`);
    const continueElement = createElement("p", "lesson-continue");
    noteElement.append(createElement("p", "lesson-text"), continueElement);
    noteElement.hidden = true;
    parentElement.append(noteElement);
    return noteElement;
}


/**
 * Show one lesson note with the given text, locked so it cannot be put away yet, or hide them all (anchor null).
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
            showNoteLocked(noteElement, true);
            keepTowerNoteClearOfBsm(scene, noteElement);
        }
    }
}


/**
 * A tower's note hangs toward the middle of the screen, but on a short link that runs it into the BSM Node's label
 * and lamps. Then it hangs outward instead, where the pulled-in towers leave room.
 */
function keepTowerNoteClearOfBsm(scene, noteElement) {
    noteElement.classList.remove("is-outward");
    if (noteElement.classList.contains("is-bsm")) {
        return;
    }
    const bsmParts = scene.linkElement.querySelectorAll(".bsm-label, .detector-panel");
    for (const partElement of bsmParts) {
        if (doBoxesOverlap(noteElement.getBoundingClientRect(), partElement.getBoundingClientRect())) {
            noteElement.classList.add("is-outward");
            return;
        }
    }
}


/**
 * Do two screen rectangles overlap?
 */
function doBoxesOverlap(firstBox, secondBox) {
    const overlapsAcross = firstBox.left < secondBox.right && secondBox.left < firstBox.right;
    const overlapsDown = firstBox.top < secondBox.bottom && secondBox.top < firstBox.bottom;
    return overlapsAcross && overlapsDown;
}


/**
 * Unlock the open lesson note: its last line now says how to carry on.
 *
 * @param {object} scene
 */
export function unlockLessonNote(scene) {
    for (const noteElement of Object.values(scene.notes)) {
        showNoteLocked(noteElement, false);
    }
}


/**
 * Grey out a locked note's last line, or show the way on once it unlocks.
 */
function showNoteLocked(noteElement, isLocked) {
    noteElement.classList.toggle("is-locked", isLocked);
    const continueText = isLocked ? LOCKED_CONTINUE_TEXT : READY_CONTINUE_TEXT;
    noteElement.querySelector(".lesson-continue").textContent = continueText;
}


/**
 * Draw the game: memory orbs (glow fading with age, fizzling when they decohere, lit while their atom emits), the
 * memory windows lit during the memory lesson, the BSM's lit detector and bump, the Bell-pair arc, and the
 * round-clear banner.
 *
 * @param {object} scene - from buildLevel1Track.
 * @param {{state: object, clockMs: number, lifetimeMs: number, openLessonId: string | null, settings: object,
 *          emittingSlotIndex: number | null, fizzles: {side: string, slotIndex: number, untilMs: number}[]}} game
 */
export function renderLevel1Scene(scene, game) {
    const state = game.state;
    scene.linkElement.classList.toggle("is-heralding", state.lastAttemptSucceeded === true);
    scene.linkElement.classList.toggle("has-logical-pair", countPairs(state) > 0);
    scene.linkElement.classList.toggle("is-tapped", state.lastAttemptSucceeded === false);
    showDetectorClicks(scene.linkElement, listClickedDetectors(state));
    for (const side of Object.keys(scene.memoryOrbs)) {
        renderMemoryStack(scene.memoryOrbs[side], side, game);
    }
    const isMeetingMemories = game.openLessonId === MEMORY_LESSON;
    for (const towerElement of scene.towerElements) {
        towerElement.classList.toggle("is-introducing-memory", isMeetingMemories);
    }
    scene.clearBannerElement.classList.toggle("is-visible", isRoundCleared(state));
    renderLinkSettings(scene, game.settings);
}


/**
 * Show the link settings in the scene: the fiber spans more of the screen the longer it is, photons fade on the way
 * by as much light as the fiber loses, and the detectors look worn (cracked, like a Minecraft anvil) when they are
 * inefficient. CSS reads --link-fraction and --arrival-brightness (styles/level1.css).
 */
function renderLinkSettings(scene, settings) {
    const linkElement = scene.linkElement;
    const distanceKm = settings.internodeDistanceKm;
    linkElement.style.setProperty("--link-fraction", findLinkWidthFraction(distanceKm).toFixed(3));
    linkElement.style.setProperty("--arrival-brightness", computeArrivalBrightness(settings).toFixed(3));
    scene.distanceElement.textContent = `◀ ${distanceKm} km ▶`;
    const efficiencyPercent = settings.detectorEfficiencyPercent;
    const wear = findDetectorWear(efficiencyPercent);
    for (const lampElement of linkElement.querySelectorAll(".detector-lamp")) {
        lampElement.classList.toggle("wear-chipped", wear === "chipped");
        lampElement.classList.toggle("wear-damaged", wear === "damaged");
    }
    const panelElement = linkElement.querySelector(".detector-panel");
    panelElement.setAttribute("role", "img");
    panelElement.setAttribute("aria-label", `Detectors D+ and D−, ${efficiencyPercent}% efficient: ${wear}`);
    panelElement.title = `Detector efficiency ${efficiencyPercent}%: ${wear}`;
}


/**
 * The detectors that clicked on the last try: none, one, or both.
 */
function listClickedDetectors(state) {
    if (state.hadTwoClicks) {
        return [PLUS_DETECTOR, MINUS_DETECTOR];
    }
    if (state.clickedDetector === null) {
        return [];
    }
    return [state.clickedDetector];
}


/**
 * One tower's memory slots: a stored pair glows gold, dimmer as it ages; a qubit that just decohered fizzles; the
 * atom that just emitted a photon flashes blue.
 */
function renderMemoryStack(orbElements, side, game) {
    for (let i = 0; i < orbElements.length; i++) {
        const orbElement = orbElements[i];
        const pair = game.state.slots[i];
        const isFizzling = game.fizzles.some((fizzle) => fizzle.side === side && fizzle.slotIndex === i);
        orbElement.className = "qubit-orb";
        if (isFizzling) {
            orbElement.classList.add("is-decohered");
        } else if (game.emittingSlotIndex === i) {
            orbElement.classList.add("is-emitting");
        } else if (pair !== null) {
            const lifeLeft = findLifeLeft(pair, game.clockMs, game.lifetimeMs);
            orbElement.classList.add("is-pair");
            orbElement.classList.toggle("is-fading", lifeLeft < FADING_LIFE_LEFT);
            orbElement.style.setProperty("--life", lifeLeft.toFixed(2));
        }
    }
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
