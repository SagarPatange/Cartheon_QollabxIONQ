/**
 * Level 2's scene and animations: Mario by Alice's tower, the fiber with the BSM telecom tower and its two detector
 * lamps, Bob's tower, Luigi beside it. Each tower has a glass window with two vertical stacks of 7 qubit orbs: the
 * stack next to the fiber holds the communication qubits (filled by Barrett–Kok), the other the 7 data qubits of the
 * Steane block, framed as one unit and labelled as ONE logical qubit (|+̃⟩, |0̃⟩, then the pair's |Φ̃⁺⟩), never per
 * qubit.
 *
 * Each play… function animates one step of a /api/logical-pair response and resolves when it has finished. Looks
 * live in styles/level2.css and styles/bsm_link.css.
 */

import {
    PAIR_LANDED_PAUSE_MS, chooseAttemptTiming, describeBlockLabel, describeCheckBanner, listSetPositions,
} from "./level2_plan.js";
import { buildBsmLink, showDetectorClick } from "../bsm_link.js";
import { createElement } from "../page_helpers.js";
import { LUIGI_SPRITE, MARIO_SPRITE } from "../pixel_sprites.js";
import { buildStation } from "../qkd/render_qkd_world.js";
import { buildKet, buildQubitTower } from "../qubit_tower.js";

const REJECT_FLASH_MS = 600;
const CELL_FILL_MS = 70;
// Matches the bit-packet animations in styles/level2.css.
const PACKET_FLIGHT_MS = 1000;
const CORRECTION_FLASH_MS = 600;
// Each tower holds 7 communication qubits (the link stack) and a 7-qubit Steane block.
const LINK_STACK = { name: "link", orbCount: 7 };
const BLOCK_STACK = { name: "block", orbCount: 7, hasLabel: true };
const BLOCK_STATE_CLASSES = { alice: "is-plus", bob: "is-zero" };


/**
 * Fill the empty track and return every element the animations touch.
 *
 * @param {HTMLElement} trackElement
 * @returns {object} the scene: towers, readouts, racks, link, bit packet and banner.
 */
export function buildLevel2Track(trackElement) {
    // The communication stack sits on the side facing the fiber: right for Alice, left for Bob.
    const alice = buildQubitTower("Alice", [BLOCK_STACK, LINK_STACK]);
    const bob = buildQubitTower("Bob", [LINK_STACK, BLOCK_STACK]);
    const linkElement = buildBsmLink();
    const packetElement = createElement("div", "bit-packet");
    const bannerElement = createElement("div", "level2-banner");
    linkElement.append(packetElement);
    trackElement.append(
        buildStation("Mario", MARIO_SPRITE, "mario"), alice.towerElement, linkElement, bob.towerElement,
        buildStation("Luigi", LUIGI_SPRITE, "luigi"), bannerElement,
    );
    return {
        aliceTower: alice.towerElement, bobTower: bob.towerElement, aliceReadout: alice.readoutElement,
        bobReadout: bob.readoutElement, aliceRack: toRack(alice, "alice"), bobRack: toRack(bob, "bob"),
        linkElement, packetElement, bannerElement,
    };
}


/**
 * A tower's two stacks and its block label, as the animations use them.
 */
function toRack(tower, towerKey) {
    return {
        towerKey, linkCells: tower.stacks[LINK_STACK.name], blockCells: tower.stacks[BLOCK_STACK.name],
        blockLabel: tower.labels[BLOCK_STACK.name],
    };
}


/**
 * Write a block's label for a stage (see describeBlockLabel), or clear it.
 */
function showBlockLabel(rack, stage) {
    const label = describeBlockLabel(stage, rack.towerKey);
    if (label === null) {
        rack.blockLabel.replaceChildren();
        rack.blockLabel.removeAttribute("aria-label");
        return;
    }
    rack.blockLabel.replaceChildren(buildKet(label));
    rack.blockLabel.setAttribute("aria-label", label.text);
}


/**
 * Back to an empty scene for a new run.
 */
export function resetScene(scene) {
    for (const rack of [scene.aliceRack, scene.bobRack]) {
        for (const cell of [...rack.linkCells, ...rack.blockCells]) {
            cell.className = "qubit-orb";
            cell.textContent = "";
        }
    }
    for (const towerElement of [scene.aliceTower, scene.bobTower]) {
        towerElement.classList.remove("is-linked");
    }
    showBlockLabel(scene.aliceRack, "empty");
    showBlockLabel(scene.bobRack, "empty");
    scene.aliceReadout.textContent = "";
    scene.bobReadout.textContent = "";
    scene.linkElement.classList.remove("has-logical-pair", "is-missed");
    scene.bannerElement.className = "level2-banner";
    scene.bannerElement.textContent = "";
}


/**
 * Phase 1: herald the 7 pairs one after another. Each pair plays its Barrett–Kok attempts (failed tries as a quick
 * burst, the heralding one at a readable pace), then lands in both racks.
 *
 * @param {object} scene
 * @param {object[][]} pairAttempts - each pair's attempts, from the response's herald_attempts.
 * @param {{onAttempt: () => void, onPairLanded: () => void}} callbacks - count attempts and pairs in the HUD.
 */
export async function playHeraldAllPairs(scene, pairAttempts, callbacks) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (let pairIndex = 0; pairIndex < pairAttempts.length; pairIndex++) {
        await playHeraldPair(scene, pairIndex, pairAttempts[pairIndex], callbacks.onAttempt, prefersReducedMotion);
        callbacks.onPairLanded();
        await wait(PAIR_LANDED_PAUSE_MS);
    }
}


/**
 * One pair: every attempt, then the pair lands in both racks.
 */
async function playHeraldPair(scene, pairIndex, attempts, onAttempt, prefersReducedMotion) {
    for (let i = 0; i < attempts.length; i++) {
        const isHeraldingAttempt = i === attempts.length - 1;
        onAttempt();
        await playAttempt(scene, attempts[i], pairIndex, chooseAttemptTiming(isHeraldingAttempt, prefersReducedMotion));
    }
    for (const rack of [scene.aliceRack, scene.bobRack]) {
        rack.linkCells[pairIndex].classList.remove("is-flipping");
        rack.linkCells[pairIndex].classList.add("is-pair");
    }
}


/**
 * One attempt: round one; if it clicked, flip both qubits and play round two.
 */
async function playAttempt(scene, attempt, pairIndex, timing) {
    const isRoundOneClick = await playRound(scene, attempt.round_one_detector, timing);
    if (!isRoundOneClick) {
        return;
    }
    await playFlip(scene, pairIndex, timing.flipMs);
    await playRound(scene, attempt.round_two_detector, timing);
}


/**
 * Photons fly to the BSM tower; the clicked detector's lamp lights, or the fiber flashes red for a lost photon. With
 * no flight time (reduced motion) the photons stay put, and with no hold time nothing lights.
 *
 * @returns {Promise<boolean>} whether a detector clicked.
 */
async function playRound(scene, detectorName, timing) {
    if (timing.photonFlightMs > 0) {
        scene.linkElement.style.setProperty("--photon-flight-ms", `${timing.photonFlightMs}ms`);
        restartClass(scene.linkElement, "is-sending");
        await wait(timing.photonFlightMs);
        scene.linkElement.classList.remove("is-sending");
    }
    const isClick = detectorName !== null;
    if (timing.lampHoldMs > 0) {
        showDetectorClick(scene.linkElement, detectorName);
        scene.linkElement.classList.toggle("is-missed", !isClick);
        await wait(timing.lampHoldMs);
        scene.linkElement.classList.remove("is-missed");
        showDetectorClick(scene.linkElement, null);
    }
    return isClick;
}


/**
 * Between the rounds both communication qubits flip (↑ ↔ ↓).
 */
async function playFlip(scene, pairIndex, flipMs) {
    for (const rack of [scene.aliceRack, scene.bobRack]) {
        rack.linkCells[pairIndex].style.setProperty("--flip-ms", `${flipMs}ms`);
        restartClass(rack.linkCells[pairIndex], "is-flipping");
    }
    await wait(flipMs);
}


/**
 * Phase 2: Alice's block becomes logical |+̃⟩ and Bob's |0̃⟩: the cells fill (no symbol per qubit: one qubit alone
 * is not |+⟩ or |0⟩), then the block's label names the logical state. Each rejected try flashes red first.
 *
 * @param {object} scene
 * @param {object} response - LogicalPairResponse JSON.
 */
export async function playEncoding(scene, response) {
    for (const [rack, attemptCount] of [[scene.aliceRack, response.alice_encoding_attempts],
        [scene.bobRack, response.bob_encoding_attempts]]) {
        await playBlockEncoding(rack.blockCells, attemptCount, BLOCK_STATE_CLASSES[rack.towerKey]);
        showBlockLabel(rack, "encoded");
    }
}


/**
 * Fill one block cell by cell; rejected tries flash red and start over.
 */
async function playBlockEncoding(cells, attemptCount, stateClass) {
    for (let attempt = 1; attempt <= attemptCount; attempt++) {
        for (const cell of cells) {
            cell.className = `qubit-orb ${stateClass}`;
            await wait(CELL_FILL_MS);
        }
        const isRejected = attempt < attemptCount;
        if (isRejected) {
            for (const cell of cells) {
                restartClass(cell, "is-rejected");
            }
            await wait(REJECT_FLASH_MS);
        }
    }
}


/**
 * Phase 3: Alice's 7 bits fly to Bob, who flips (X) the matching data qubits; Bob's 7 bits fly back and Alice
 * phase-flips (Z) hers. The physical pairs are used up and the logical pair appears: the two blocks are no longer
 * |+̃⟩ and |0̃⟩ but together the logical Bell pair |Φ̃⁺⟩, so both take its colour and its label.
 *
 * @param {object} scene
 * @param {object} response - LogicalPairResponse JSON.
 */
export async function playTeleport(scene, response) {
    await sendBitPacket(scene, response.alice_cnot_bits, "is-to-bob");
    await flashCorrections(scene.bobRack.blockCells, response.alice_cnot_bits, "X");
    await sendBitPacket(scene, response.bob_cnot_bits, "is-to-alice");
    await flashCorrections(scene.aliceRack.blockCells, response.bob_cnot_bits, "Z");
    for (const rack of [scene.aliceRack, scene.bobRack]) {
        for (const cell of rack.linkCells) {
            cell.className = "qubit-orb is-used";
        }
        for (const cell of rack.blockCells) {
            cell.className = "qubit-orb is-bell";
        }
        showBlockLabel(rack, "paired");
    }
    scene.linkElement.classList.add("has-logical-pair");
    scene.aliceTower.classList.add("is-linked");
    scene.bobTower.classList.add("is-linked");
    showBanner(scene, "LOGICAL BELL PAIR ", "is-win");
    scene.bannerElement.append(buildKet(describeBlockLabel("paired", "alice")), "!");
    scene.bannerElement.setAttribute("aria-label", "Logical Bell pair Phi plus!");
}


/**
 * The 7 measured bits ride along the fiber, as a string over it.
 */
async function sendBitPacket(scene, bits, directionClass) {
    scene.packetElement.textContent = bits.join("");
    scene.packetElement.className = "bit-packet";
    void scene.packetElement.offsetWidth;
    scene.packetElement.classList.add(directionClass);
    await wait(PACKET_FLIGHT_MS);
    scene.packetElement.className = "bit-packet";
}


/**
 * The data qubits whose bit was 1 get the correction: they flash its letter, then show their logical state again.
 */
async function flashCorrections(cells, bits, correctionLetter) {
    const positions = listSetPositions(bits);
    const glyphs = [];
    for (const position of positions) {
        glyphs.push(cells[position].textContent);
        cells[position].textContent = correctionLetter;
        restartClass(cells[position], "is-correcting");
    }
    await wait(CORRECTION_FLASH_MS);
    for (let i = 0; i < positions.length; i++) {
        cells[positions[i]].textContent = glyphs[i];
        cells[positions[i]].classList.remove("is-correcting");
    }
}


/**
 * Phase 4: both blocks are read in the same basis; each tower's readout shows its decoded logical bit, and the banner
 * says what both read and whether that made the logical Bell pair.
 *
 * @param {object} scene
 * @param {{aliceLabel: string, bobLabel: string, isMatch: boolean}} checkResult - from describeCheckResult.
 * @param {string} basis - "Z" or "X".
 */
export function playCheck(scene, checkResult, basis) {
    scene.aliceReadout.textContent = checkResult.aliceLabel;
    scene.bobReadout.textContent = checkResult.bobLabel;
    scene.aliceTower.classList.remove("is-linked");
    scene.bobTower.classList.remove("is-linked");
    for (const rack of [scene.aliceRack, scene.bobRack]) {
        for (const cell of rack.blockCells) {
            cell.className = "qubit-orb is-measured";
        }
        showBlockLabel(rack, "measured");
    }
    const banner = describeCheckBanner(checkResult.isMatch, basis);
    showBanner(scene, "", checkResult.isMatch ? "is-win" : "is-lose");
    for (const line of banner.lines) {
        const lineElement = createElement("span", "level2-banner-line");
        for (const part of line) {
            lineElement.append(typeof part === "string" ? part : buildKet(part));
        }
        scene.bannerElement.append(lineElement);
    }
    scene.bannerElement.setAttribute("aria-label", banner.spokenText);
}


/**
 * The big message over the fiber.
 */
function showBanner(scene, text, outcomeClass) {
    scene.bannerElement.textContent = text;
    scene.bannerElement.className = `level2-banner is-visible ${outcomeClass}`;
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
 * Resolve after ms milliseconds.
 */
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
