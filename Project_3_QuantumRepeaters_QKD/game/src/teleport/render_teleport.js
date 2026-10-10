/**
 * Level 2 (teleportation)'s scene and animations: Mario holding the mystery block (the message qubit) beside his
 * qubit tower, the Bell-pair arc and the bit pipe between the towers, Luigi's fix switches at the end of the pipe,
 * Luigi's tower, and Luigi beside it. Each tower has Level 1's stack of 3 memory slots, every slot holding one half of
 * a numbered Bell pair shared with the same slot in the other tower. A teleport uses up one pair; before that slot's
 * next turn a fresh pair from Level 1's repeater refills it. In Stage 2-2 a word board over the link shows the bits
 * Mario sends and the bits Luigi reads.
 *
 * Lessons show in one note in the sky, so they never cover the scene; the part of the scene a lesson is about glows.
 * Each play… function animates one step and resolves when it has finished. Looks live in styles/teleport.css (plus
 * qubit_tower.css, and level1.css for the note's look).
 */

import { BITS_PER_LETTER, assembleWord } from "./teleport_word.js";
import { FIX_RULES, PAIR_SLOT_COUNT, formatBellBits, formatKet, formatReading } from "./teleport_rules.js";
import { LINK_ANCHOR, LUIGI_ANCHOR, MARIO_ANCHOR } from "./teleport_tutorial.js";
import { LOCKED_CONTINUE_TEXT, READY_CONTINUE_TEXT } from "../level1/render_level1.js";
import { createElement } from "../page_helpers.js";
import { LUIGI_SPRITE, MARIO_SPRITE } from "../pixel_sprites.js";
import { buildStation } from "../qkd/render_qkd_world.js";
import { buildQubitTower } from "../qubit_tower.js";

// Matches the animations in styles/teleport.css.
const MEASURE_FLASH_MS = 700;
const PIPE_FLIGHT_MS = 1400;
const FIX_FLASH_MS = 600;
const MEMORY_STACK = { name: "memory", orbCount: PAIR_SLOT_COUNT };
// Marks that say right or wrong by shape, not only by colour.
const RIGHT_MARK = "✔";
const WRONG_MARK = "✖";


/**
 * Fill the empty track and return every element the page changes later.
 *
 * @param {HTMLElement} trackElement
 * @param {{noteElement: HTMLElement, bannerElement: HTMLElement}} skyElements - the lesson note (with a .lesson-text
 *     and a .lesson-continue) and the banner, both in the sky above the scene so they never cover it.
 * @returns {object} the scene.
 */
export function buildTeleportTrack(trackElement, skyElements) {
    const marioStation = buildStation("Mario", MARIO_SPRITE, "mario");
    const luigiStation = buildStation("Luigi", LUIGI_SPRITE, "luigi");
    const mario = buildQubitTower("Mario", [MEMORY_STACK]);
    const luigi = buildQubitTower("Luigi", [MEMORY_STACK]);
    // Mario holds the message qubit over his head in a mystery block, apart from the pairs in his tower.
    const mysteryBlockElement = createElement("div", "mystery-block");
    marioStation.append(mysteryBlockElement);
    const refillTags = [buildRefillTag(mario.towerElement), buildRefillTag(luigi.towerElement)];
    const link = buildTeleportLink();
    const fixPanel = buildFixPanel();
    link.linkElement.append(fixPanel.fixPanelElement);
    trackElement.append(marioStation, mario.towerElement, link.linkElement, luigi.towerElement, luigiStation);
    const scene = {
        marioStation, luigiStation, mysteryBlockElement, refillTags, ...skyElements, ...link,
        ...fixPanel, marioReadout: mario.readoutElement, luigiReadout: luigi.readoutElement,
        marioSlots: mario.stacks.memory, luigiSlots: luigi.stacks.memory, activeSlot: null,
        luigiBubble: luigiStation.querySelector(".station-bubble"),
        lessonTargets: {
            [MARIO_ANCHOR]: mario.towerElement, [LINK_ANCHOR]: link.linkElement, [LUIGI_ANCHOR]: luigi.towerElement,
        },
    };
    for (let slotIndex = 0; slotIndex < PAIR_SLOT_COUNT; slotIndex++) {
        fillPair(scene, slotIndex);
    }
    return scene;
}


/**
 * The tag that pops up over a tower when a used slot gets a fresh pair.
 */
function buildRefillTag(towerElement) {
    const tagElement = createElement("div", "refill-tag");
    tagElement.textContent = "New pair from Level 1's repeater";
    towerElement.append(tagElement);
    return tagElement;
}


/**
 * The link between the towers: the word board on top, the Bell-pair arc, and the pipe the bits ride in.
 */
function buildTeleportLink() {
    const linkElement = createElement("div", "teleport-link");
    const wordBoardElement = createElement("div", "word-board");
    wordBoardElement.hidden = true;
    const pairArcElement = createElement("div", "pair-arc");
    const arcLabelElement = createElement("span", "pair-arc-label");
    pairArcElement.append(arcLabelElement);
    const pipeElement = createElement("div", "bit-pipe");
    const pipeLabelElement = createElement("span", "bit-pipe-label");
    pipeLabelElement.textContent = "classical pipe";
    const packetElement = createElement("div", "pipe-packet");
    pipeElement.append(pipeLabelElement, packetElement);
    linkElement.append(wordBoardElement, pairArcElement, pipeElement);
    return { linkElement, wordBoardElement, pairArcElement, arcLabelElement, packetElement };
}


/**
 * Luigi's fix switches, at his end of the pipe: the bits that arrived, and an X and a Z switch that each read ON or
 * off.
 */
function buildFixPanel() {
    const panelElement = createElement("div", "fix-panel");
    const bitsElement = createElement("div", "fix-bits");
    const switchesElement = createElement("div", "fix-switches");
    const xSwitchElement = createElement("span", "fix-switch");
    const zSwitchElement = createElement("span", "fix-switch");
    switchesElement.append(xSwitchElement, zSwitchElement);
    panelElement.append(bitsElement, switchesElement);
    return { fixPanelElement: panelElement, fixBitsElement: bitsElement, xSwitchElement, zSwitchElement };
}


/**
 * Show the sky's lesson note with this text, locked so it cannot be put away yet, and make the part of the scene it
 * is about glow; or hide it (anchor null).
 *
 * @param {object} scene
 * @param {string | null} anchor - MARIO_ANCHOR, LINK_ANCHOR, LUIGI_ANCHOR or null.
 * @param {string} [text]
 */
export function showLessonNote(scene, anchor, text) {
    for (const [targetAnchor, targetElement] of Object.entries(scene.lessonTargets)) {
        targetElement.classList.toggle("is-lesson-focus", targetAnchor === anchor);
    }
    scene.noteElement.hidden = anchor === null;
    scene.noteElement.classList.remove("is-review");
    if (anchor === null) {
        return;
    }
    scene.noteElement.querySelector(".lesson-text").textContent = text;
    showNoteLocked(scene.noteElement, true);
}


/**
 * Show an earlier lesson note again, read-only: its text, the part of the scene it was about, and a last line saying
 * which earlier note this is and how to move on.
 *
 * @param {object} scene
 * @param {string} anchor - where the note was about.
 * @param {string} text
 * @param {string} positionText - e.g. "Earlier note 2 of 4".
 */
export function showReviewNote(scene, anchor, text, positionText) {
    showLessonNote(scene, anchor, text);
    scene.noteElement.classList.remove("is-locked");
    scene.noteElement.classList.add("is-review");
    scene.noteElement.querySelector(".lesson-continue").textContent = `${positionText} · B: back · Space: next`;
}


/**
 * Unlock the lesson note: its last line now says how to carry on.
 *
 * @param {object} scene
 */
export function unlockLessonNote(scene) {
    showNoteLocked(scene.noteElement, false);
}


/**
 * Grey out a locked note's last line, or show the way on once it unlocks (as Level 1's notes do).
 */
function showNoteLocked(noteElement, isLocked) {
    noteElement.classList.toggle("is-locked", isLocked);
    const continueText = isLocked ? LOCKED_CONTINUE_TEXT : READY_CONTINUE_TEXT;
    noteElement.querySelector(".lesson-continue").textContent = continueText;
}


/**
 * Put a fresh Bell pair, numbered by its slot, into the same slot of both towers.
 */
function fillPair(scene, slotIndex) {
    const pairNumber = String(slotIndex + 1);
    setOrb(scene.marioSlots[slotIndex], "is-pair", pairNumber);
    setOrb(scene.luigiSlots[slotIndex], "is-pair", pairNumber);
}


/**
 * Set up a fresh teleport: refill any used slot with a fresh pair from Level 1's repeater, mark the slot this
 * teleport uses, and put the message qubit in the mystery block.
 *
 * @param {object} scene
 * @param {string} state - the state Mario sends, "0", "1", "+" or "-".
 * @param {number} slotIndex - the slot whose pair this teleport uses (from findPairSlot).
 */
export function prepareTeleport(scene, state, slotIndex) {
    refillUsedSlots(scene);
    scene.activeSlot = slotIndex;
    for (const slots of [scene.marioSlots, scene.luigiSlots]) {
        slots.forEach((slotElement, i) => slotElement.classList.toggle("is-active-pair", i === slotIndex));
    }
    const ket = formatKet(state);
    scene.mysteryBlockElement.className = "mystery-block";
    scene.mysteryBlockElement.textContent = ket;
    scene.mysteryBlockElement.setAttribute("aria-label", `Mario's mystery block holds ${ket}`);
    scene.marioReadout.textContent = "";
    scene.luigiReadout.textContent = "";
    scene.packetElement.className = "pipe-packet";
    scene.packetElement.textContent = "";
    scene.luigiBubble.classList.remove("is-visible", "is-wrong");
    scene.luigiBubble.textContent = "";
    renderPairCount(scene);
}


/**
 * Every slot whose pair was used gets a fresh one, and a tag over each tower says where it came from.
 */
function refillUsedSlots(scene) {
    let hasRefilled = false;
    for (let slotIndex = 0; slotIndex < PAIR_SLOT_COUNT; slotIndex++) {
        const isUsed = !scene.marioSlots[slotIndex].classList.contains("is-pair");
        if (isUsed) {
            fillPair(scene, slotIndex);
            restartClass(scene.marioSlots[slotIndex], "is-refilling");
            restartClass(scene.luigiSlots[slotIndex], "is-refilling");
            hasRefilled = true;
        }
    }
    if (hasRefilled) {
        for (const tagElement of scene.refillTags) {
            restartClass(tagElement, "is-shown");
        }
    }
}


/**
 * The arc's label: how many Bell pairs the towers still share.
 */
function renderPairCount(scene) {
    const pairCount = scene.marioSlots.filter((slotElement) => slotElement.classList.contains("is-pair")).length;
    scene.arcLabelElement.textContent = `${pairCount} Bell pair${pairCount === 1 ? "" : "s"}`;
    scene.pairArcElement.classList.toggle("is-used", pairCount < PAIR_SLOT_COUNT);
}


/**
 * Give an orb one state class and a glyph.
 */
function setOrb(orbElement, stateClass, glyph) {
    orbElement.className = `qubit-orb ${stateClass}`;
    orbElement.textContent = glyph;
}


/**
 * The Bell measurement: Mario's message and his half of the active pair are measured together. The mystery block
 * empties, Mario's half goes dark (the pair is used up) and his readout shows the two bits. Luigi's half of that
 * pair now holds the message, scrambled until the fix.
 *
 * @param {object} scene
 * @param {{bell_bits: {z_fix: number, x_fix: number}}} teleport
 */
export async function playBellMeasurement(scene, teleport) {
    const marioSlot = scene.marioSlots[scene.activeSlot];
    restartClass(marioSlot, "is-flipping");
    restartClass(scene.mysteryBlockElement, "is-bumped");
    await wait(MEASURE_FLASH_MS);
    setOrb(marioSlot, "is-used", "");
    setOrb(scene.luigiSlots[scene.activeSlot], "is-scrambled", "?");
    scene.mysteryBlockElement.className = "mystery-block is-used";
    scene.mysteryBlockElement.textContent = "";
    scene.mysteryBlockElement.setAttribute("aria-label", "Mario's mystery block is empty");
    scene.marioReadout.textContent = formatBellBits(teleport.bell_bits);
    // The refill tag sits where the readouts appear; it has done its job by now.
    for (const tagElement of scene.refillTags) {
        tagElement.classList.remove("is-shown");
    }
    renderPairCount(scene);
}


/**
 * Put the bits at Mario's end of the pipe, ready to go (where the tutorial pauses to explain the pipe).
 *
 * @param {object} scene
 * @param {{bell_bits: object}} teleport
 */
export function loadPipe(scene, teleport) {
    scene.packetElement.textContent = formatBellBits(teleport.bell_bits);
    scene.packetElement.className = "pipe-packet is-loaded";
}


/**
 * The bits ride the pipe to Luigi.
 *
 * @param {object} scene
 */
export async function playPipeFlight(scene) {
    scene.packetElement.className = "pipe-packet is-loaded";
    void scene.packetElement.offsetWidth;
    scene.packetElement.classList.add("is-flying");
    await wait(PIPE_FLIGHT_MS);
    scene.packetElement.className = "pipe-packet is-arrived";
}


/**
 * Luigi's fix panel: the bits he has (or none yet), and the two switches. The switches read ON or off in words.
 *
 * @param {object} scene
 * @param {{bitsText: string, toggles: {isXOn: boolean, isZOn: boolean}, isActive: boolean}} fixView
 */
export function renderFixPanel(scene, fixView) {
    scene.fixPanelElement.classList.toggle("is-active", fixView.isActive);
    scene.fixBitsElement.textContent = fixView.bitsText === "" ? "Bits: --" : `Bits: ${fixView.bitsText}`;
    renderFixSwitch(scene.xSwitchElement, "X", fixView.toggles.isXOn);
    renderFixSwitch(scene.zSwitchElement, "Z", fixView.toggles.isZOn);
}


/**
 * One switch: "X ON" (lit) or "X off".
 */
function renderFixSwitch(switchElement, gateName, isOn) {
    switchElement.textContent = isOn ? `${gateName} ON` : `${gateName} off`;
    switchElement.classList.toggle("is-on", isOn);
}


/**
 * Luigi applies his fix (X first, then Z), measures, and says what he read; a mark says whether it was the state
 * Mario sent.
 *
 * @param {object} scene
 * @param {{reading: string, isRightState: boolean}} result - from readLuigiResult.
 * @param {{isXOn: boolean, isZOn: boolean}} toggles
 */
export async function playLuigiReading(scene, result, toggles) {
    const luigiSlot = scene.luigiSlots[scene.activeSlot];
    for (const [gateName, isOn] of [["X", toggles.isXOn], ["Z", toggles.isZOn]]) {
        if (isOn) {
            setOrb(luigiSlot, "is-correcting", gateName);
            await wait(FIX_FLASH_MS);
        }
    }
    const readingLabel = formatReading(result.reading);
    setOrb(luigiSlot, "is-measured", readingLabel);
    scene.luigiReadout.textContent = readingLabel;
    scene.packetElement.className = "pipe-packet";
    const mark = result.isRightState ? RIGHT_MARK : WRONG_MARK;
    scene.luigiBubble.textContent = `I read ${readingLabel} ${mark}`;
    scene.luigiBubble.classList.add("is-visible");
    scene.luigiBubble.classList.toggle("is-wrong", !result.isRightState);
}


/**
 * Show or hide the word board (Stage 2-2 only).
 *
 * @param {object} scene
 * @param {boolean} isShown
 */
export function showWordBoard(scene, isShown) {
    scene.wordBoardElement.hidden = !isShown;
    scene.linkElement.classList.toggle("has-word-board", isShown);
}


/**
 * The word board: what Mario sends (the target bits, the current one marked) over what Luigi has read so far, each
 * bit marked right or wrong, grouped 5 to a letter with the letter at the end.
 *
 * @param {object} scene
 * @param {{targetWord: string, targetBits: string[], bitsRead: string[], currentIndex: number}} wordView
 */
export function renderWordBoard(scene, wordView) {
    const letterCount = wordView.targetWord.length;
    const marioRow = buildWordRow("Mario", wordView.targetBits, wordView.targetWord, letterCount, (i) => {
        return i === wordView.currentIndex ? "is-current" : "";
    });
    const luigiLetters = assembleWord(wordView.bitsRead).letters;
    const luigiRow = buildWordRow("Luigi", wordView.bitsRead, luigiLetters, letterCount, (i) => {
        return wordView.bitsRead[i] === wordView.targetBits[i] ? "is-right" : "is-wrong";
    });
    scene.wordBoardElement.replaceChildren(marioRow, luigiRow);
}


/**
 * One row of the word board: a name, then for each letter its 5 bit cells and the letter itself ("_" until all 5
 * bits are in).
 */
function buildWordRow(ownerName, bits, letters, letterCount, classifyBit) {
    const rowElement = createElement("div", "word-row");
    const nameElement = createElement("span", "word-owner");
    nameElement.textContent = ownerName;
    rowElement.append(nameElement);
    for (let letterIndex = 0; letterIndex < letterCount; letterIndex++) {
        const groupElement = createElement("span", "word-letter-group");
        for (let bitOffset = 0; bitOffset < BITS_PER_LETTER; bitOffset++) {
            const bitIndex = letterIndex * BITS_PER_LETTER + bitOffset;
            groupElement.append(buildBitCell(bits[bitIndex], classifyBit(bitIndex)));
        }
        const letterElement = createElement("span", "word-letter");
        letterElement.textContent = letters[letterIndex] ?? "_";
        groupElement.append(letterElement);
        rowElement.append(groupElement);
    }
    return rowElement;
}


/**
 * One bit cell: the bit, or a dot while it has not arrived. Wrong bits are struck through, not only red.
 */
function buildBitCell(bit, stateClass) {
    const cellElement = createElement("span", "word-bit");
    if (bit === undefined) {
        cellElement.textContent = "·";
        cellElement.classList.add("is-empty");
        return cellElement;
    }
    cellElement.textContent = bit;
    if (stateClass !== "") {
        cellElement.classList.add(stateClass);
    }
    return cellElement;
}


/**
 * The big message in the sky, or none (text "").
 *
 * @param {object} scene
 * @param {string} text
 * @param {string} outcomeClass - "is-win" or "is-lose".
 */
export function showBanner(scene, text, outcomeClass) {
    scene.bannerElement.textContent = text;
    scene.bannerElement.hidden = text === "";
    scene.bannerElement.className = `teleport-banner ${outcomeClass}`;
}


/**
 * Mario and Luigi jump for joy.
 *
 * @param {object} scene
 */
export function playCheer(scene) {
    for (const stationElement of [scene.marioStation, scene.luigiStation]) {
        restartClass(stationElement.querySelector(".plumber"), "is-jumping");
    }
}


/**
 * The cheat sheet's fix table, one row per bit pair; in the tutorial the row for the bits Luigi has is marked.
 *
 * @param {HTMLElement} tableBodyElement - the table's empty tbody.
 * @param {string} markedBits - e.g. "01", or "" for no mark.
 */
export function renderFixTable(tableBodyElement, markedBits) {
    tableBodyElement.replaceChildren();
    for (const rule of FIX_RULES) {
        const bitsText = `${rule.zFix}${rule.xFix}`;
        const rowElement = document.createElement("tr");
        const bitsCell = document.createElement("td");
        bitsCell.textContent = bitsText;
        const fixCell = document.createElement("td");
        fixCell.textContent = rule.label;
        const isMarked = bitsText === markedBits;
        rowElement.classList.toggle("is-marked", isMarked);
        if (isMarked) {
            const markElement = createElement("span", "fix-table-mark");
            markElement.textContent = " ◀ Luigi's bits";
            fixCell.append(markElement);
        }
        rowElement.append(bitsCell, fixCell);
        tableBodyElement.append(rowElement);
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
 * Resolve after ms milliseconds.
 */
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
