/**
 * Level 2's scene and animations: Mario by Alice's tower, the fiber with the BSM telecom tower and its two detector
 * lamps, Bob's tower, Luigi beside it. Each tower has a glass window with two vertical stacks of 7 qubit orbs: the
 * stack next to the fiber holds the communication qubits (filled by Barrett–Kok), the other the 7 data qubits of the
 * Steane block.
 *
 * Each play… function animates one step of a /api/logical-pair response and resolves when it has finished. Looks
 * live in styles/level2.css and styles/bsm_link.css.
 */

import { listSetPositions } from "./level2_plan.js";
import { buildBsmLink, showDetectorClick } from "../bsm_link.js";
import { createElement } from "../page_helpers.js";
import { LUIGI_SPRITE, MARIO_SPRITE } from "../pixel_sprites.js";
import { buildStation } from "../qkd/render_qkd_world.js";
import { buildQubitTower } from "../qubit_tower.js";

// Matches the photon-fly animation in styles/bsm_link.css.
const PHOTON_FLIGHT_MS = 700;
const LAMP_HOLD_MS = 450;
const FLIP_MS = 400;
const REJECT_FLASH_MS = 600;
const CELL_FILL_MS = 70;
// Matches the bit-packet animations in styles/level2.css.
const PACKET_FLIGHT_MS = 1000;
const CORRECTION_FLASH_MS = 600;
// Each tower holds 7 communication qubits (the link stack) and a 7-qubit Steane block.
const LINK_STACK = { name: "link", orbCount: 7 };
const BLOCK_STACK = { name: "block", orbCount: 7 };


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
        bobReadout: bob.readoutElement, aliceRack: toRack(alice.stacks), bobRack: toRack(bob.stacks),
        linkElement, packetElement, bannerElement,
    };
}


/**
 * A tower's two stacks as the animations use them.
 */
function toRack(stacks) {
    return { linkCells: stacks[LINK_STACK.name], blockCells: stacks[BLOCK_STACK.name] };
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
    scene.aliceReadout.textContent = "";
    scene.bobReadout.textContent = "";
    scene.linkElement.classList.remove("has-logical-pair", "is-missed");
    scene.bannerElement.className = "level2-banner";
    scene.bannerElement.textContent = "";
}


/**
 * Phase 1 for one pair: every Barrett–Kok attempt, then the pair lands in both racks.
 *
 * @param {object} scene
 * @param {{pairIndex: number, attempts: object[]}} step
 * @param {() => void} onAttempt - called as each attempt starts, to count it in the HUD.
 */
export async function playHeraldStep(scene, step, onAttempt) {
    for (const attempt of step.attempts) {
        onAttempt();
        await playAttempt(scene, attempt, step.pairIndex);
    }
    for (const rack of [scene.aliceRack, scene.bobRack]) {
        rack.linkCells[step.pairIndex].classList.remove("is-flipping");
        rack.linkCells[step.pairIndex].classList.add("is-pair");
    }
}


/**
 * One attempt: round one; if it clicked, flip both qubits and play round two.
 */
async function playAttempt(scene, attempt, pairIndex) {
    const isRoundOneClick = await playRound(scene, attempt.round_one_detector);
    if (!isRoundOneClick) {
        return;
    }
    await playFlip(scene, pairIndex);
    await playRound(scene, attempt.round_two_detector);
}


/**
 * Photons fly to the BSM tower; the clicked detector's lamp lights, or the fiber flashes red for a lost photon.
 *
 * @returns {Promise<boolean>} whether a detector clicked.
 */
async function playRound(scene, detectorName) {
    restartClass(scene.linkElement, "is-sending");
    await wait(PHOTON_FLIGHT_MS);
    scene.linkElement.classList.remove("is-sending");
    const isClick = detectorName !== null;
    showDetectorClick(scene.linkElement, detectorName);
    scene.linkElement.classList.toggle("is-missed", !isClick);
    await wait(LAMP_HOLD_MS);
    scene.linkElement.classList.remove("is-missed");
    showDetectorClick(scene.linkElement, null);
    return isClick;
}


/**
 * Between the rounds both communication qubits flip (↑ ↔ ↓).
 */
async function playFlip(scene, pairIndex) {
    for (const rack of [scene.aliceRack, scene.bobRack]) {
        restartClass(rack.linkCells[pairIndex], "is-flipping");
    }
    await wait(FLIP_MS);
}


/**
 * Phase 2: Alice's block becomes |+̄⟩ and Bob's |0̄⟩. Each rejected try flashes red before the accepted one.
 *
 * @param {object} scene
 * @param {object} response - LogicalPairResponse JSON.
 */
export async function playEncoding(scene, response) {
    await playBlockEncoding(scene.aliceRack.blockCells, response.alice_encoding_attempts, "+", "is-plus");
    await playBlockEncoding(scene.bobRack.blockCells, response.bob_encoding_attempts, "0", "is-zero");
}


/**
 * Fill one block cell by cell; rejected tries flash red and start over.
 */
async function playBlockEncoding(cells, attemptCount, glyph, stateClass) {
    for (let attempt = 1; attempt <= attemptCount; attempt++) {
        for (const cell of cells) {
            cell.className = `qubit-orb ${stateClass}`;
            cell.textContent = glyph;
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
 * phase-flips (Z) hers. The physical pairs are used up and the logical pair appears.
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
    }
    scene.linkElement.classList.add("has-logical-pair");
    scene.aliceTower.classList.add("is-linked");
    scene.bobTower.classList.add("is-linked");
    showBanner(scene, "LOGICAL PAIR!", "is-win");
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
 * Phase 4: both blocks are read in the same basis; each tower's readout shows its decoded logical bit.
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
    }
    if (checkResult.isMatch) {
        showBanner(scene, `MATCH! ${basis} basis: ${checkResult.aliceLabel} and ${checkResult.bobLabel}`, "is-win");
    } else {
        showBanner(scene, `✖ No match (${checkResult.aliceLabel} vs ${checkResult.bobLabel}): an error got through`,
            "is-lose");
    }
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
