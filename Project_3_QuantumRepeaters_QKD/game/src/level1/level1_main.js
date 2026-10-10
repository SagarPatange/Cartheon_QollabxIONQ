/**
 * Level 1 page entry point: Mario's qubit tower, the BSM station (a telecom tower with detectors D+ and D-) in the
 * middle of the fiber, Luigi's qubit tower. The goal types itself out first; the level starts once it has.
 *
 * Space (or a click on the scene) sends photons; each click at the BSM stores a Bell pair in both towers (3 slots),
 * and Mario and Luigi jump. Pairs decohere after the memory lifetime. The first click and the first decoherence pause
 * the game with a lesson note (Space continues). 0 or 1 teleports a qubit to Luigi over the oldest pair; R starts
 * over. Goals: fill all 3 slots at once, and teleport both a 0 and a 1.
 *
 * The Settings button (or Esc) slides in a panel that pauses the game and changes the link: detector efficiency,
 * fiber attenuation, internode distance, extra delay and memory lifetime. Reads level1.html.
 */

import { CLICK_LESSON, DECOHERENCE_LESSON, describeClickLesson, describeDecoherenceLesson } from "./level1_lessons.js";
import {
    MEMORY_SLOT_COUNT, computeHeraldProbability, countPairs, createLevel1State, decohereExpiredPairs, sendPhotons,
    teleportQubit,
} from "./level1_protocol.js";
import {
    LINK_SETTINGS, computeLifetimeMs, computeTryDurationMs, createDefaultSettings, formatSettingValue, toLinkPhysics,
} from "./level1_settings.js";
import { BSM_NOTE, buildLevel1Track, playPairJump, renderLevel1Scene, showLessonNote } from "./render_level1.js";
import { findElementsById, fitTrackToWorld, playGoalIntro, renderKeyHints } from "../page_helpers.js";
import { createSeededRandom } from "../seeded_random.js";
import { buildSettingsRows } from "../settings_panel.js";

const LEVEL1_SEED = 1985;
// The game clock ticks this often; decoherence and the fading glow follow it, and it stops while paused.
const CLOCK_TICK_MS = 100;
// How long a decohered qubit fizzles before its slot shows empty.
const FIZZLE_MS = 900;
const HUD_DIGIT_COUNT = 3;
const PERCENT = 100;
const MS_PER_SECOND = 1000;
// Natural size of the scene (styles/level1.css); below it the ground (64 px), above it the goal line and key hints.
const TRACK_SIZE = { trackHeightPx: 470, trackMinWidthPx: 870, reservedHeightPx: 64 + 150 };


/**
 * Build the scene and settings panel, wire the controls and start the clock. Game state lives in one object.
 */
function startLevel1() {
    const elements = findLevel1Elements();
    elements.scene = buildLevel1Track(elements.trackElement);
    fitTrackToWorld(elements, TRACK_SIZE);
    window.addEventListener("resize", () => fitTrackToWorld(elements, TRACK_SIZE));

    // isStarted stays false until the goal has typed itself out; until then keys and clicks do nothing.
    const game = { isStarted: false, lessonsSeen: new Set(), settings: createDefaultSettings(), isSettingsOpen: false };
    buildSettingsRows(elements.settingsRows, LINK_SETTINGS, game.settings, formatSettingValue, (id, value) => {
        game.settings[id] = value;
        renderLevel1(game, elements);
    });
    resetLevel1(game, elements);
    elements.worldElement.addEventListener("click", () => handleClick(game, elements));
    elements.settingsButton.addEventListener("click", () => toggleSettings(game, elements));
    elements.settingsCloseButton.addEventListener("click", () => toggleSettings(game, elements));
    document.addEventListener("keydown", (keyEvent) => handleLevel1Key(game, elements, keyEvent));
    setInterval(() => tickClock(game, elements), CLOCK_TICK_MS);
    playGoalIntro(elements.statusElement).then(() => {
        game.isStarted = true;
        renderLevel1(game, elements);
    });
}


/**
 * Every element level1.html must have, failing fast if one is missing.
 */
function findLevel1Elements() {
    return findElementsById({
        trackElement: "track",
        worldElement: "world",
        scrollerElement: "track-scroller",
        keyHintsElement: "key-hints",
        statusElement: "status-banner",
        pauseBadge: "pause-badge",
        triesElement: "hud-tries",
        pairsElement: "hud-pairs",
        teleportsElement: "hud-teleports",
        settingsButton: "settings-button",
        settingsPanel: "settings-panel",
        settingsRows: "settings-rows",
        settingsSummary: "settings-summary",
        settingsCloseButton: "settings-close",
    });
}


/**
 * Paused while a lesson note or the settings panel is up: the clock stops and only their keys work.
 */
function isPaused(game) {
    return game.openLesson !== null || game.isSettingsOpen;
}


/**
 * Advance the game clock (unless paused) and lose pairs that have decohered; pause to explain the first one.
 */
function tickClock(game, elements) {
    if (!game.isStarted || isPaused(game)) {
        return;
    }
    game.clockMs += CLOCK_TICK_MS;
    game.fizzles = game.fizzles.filter((fizzle) => fizzle.untilMs > game.clockMs);
    const lifetimeMs = computeLifetimeMs(game.settings);
    const result = decohereExpiredPairs(game.state, game.clockMs, lifetimeMs);
    game.state = result.state;
    for (const event of result.decohered) {
        game.fizzles.push({ side: event.side, slotIndex: event.slotIndex, untilMs: game.clockMs + FIZZLE_MS });
    }
    if (result.decohered.length > 0) {
        const side = result.decohered[0].side;
        openLessonOnce(game, elements, DECOHERENCE_LESSON, side, describeDecoherenceLesson(side, lifetimeMs));
    }
    renderLevel1(game, elements);
}


/**
 * The first time something happens, pause and explain it in a note over where it happened.
 */
function openLessonOnce(game, elements, lessonId, anchor, text) {
    if (game.lessonsSeen.has(lessonId)) {
        return;
    }
    game.lessonsSeen.add(lessonId);
    game.openLesson = anchor;
    showLessonNote(elements.scene, anchor, text);
}


/**
 * Space sends photons; 0 and 1 teleport; R starts over; Esc opens or closes the settings. While a lesson note is up,
 * Space or Enter continues; while the settings are open, only Esc works (the sliders keep their arrow keys).
 */
function handleLevel1Key(game, elements, keyEvent) {
    if (!game.isStarted) {
        return;
    }
    if (keyEvent.key === "Escape") {
        toggleSettings(game, elements);
        return;
    }
    const isContinueKey = keyEvent.key === " " || keyEvent.key === "Enter";
    if (game.isSettingsOpen || (game.openLesson !== null && !isContinueKey)) {
        return;
    }
    if (game.openLesson !== null) {
        keyEvent.preventDefault();
        closeLesson(game, elements);
        return;
    }
    const keyActions = {
        " ": () => handleSend(game, elements),
        0: () => handleTeleport(game, elements, 0),
        1: () => handleTeleport(game, elements, 1),
        r: () => resetLevel1(game, elements),
        R: () => resetLevel1(game, elements),
    };
    const action = keyActions[keyEvent.key];
    if (action !== undefined) {
        keyEvent.preventDefault();
        action();
    }
}


/**
 * A click on the scene does what Space does.
 */
function handleClick(game, elements) {
    if (game.isSettingsOpen) {
        return;
    }
    if (game.openLesson !== null) {
        closeLesson(game, elements);
        return;
    }
    handleSend(game, elements);
}


/**
 * Put the lesson note away and let the clock run again.
 */
function closeLesson(game, elements) {
    game.openLesson = null;
    showLessonNote(elements.scene, null);
    renderLevel1(game, elements);
}


/**
 * Slide the settings panel in (pausing the game) or out.
 */
function toggleSettings(game, elements) {
    if (!game.isStarted) {
        return;
    }
    game.isSettingsOpen = !game.isSettingsOpen;
    elements.settingsPanel.classList.toggle("is-open", game.isSettingsOpen);
    elements.settingsButton.setAttribute("aria-expanded", String(game.isSettingsOpen));
    renderLevel1(game, elements);
}


/**
 * Fire the photons, wait one try's length, then store the pair if it clicked: jump for joy, and explain the first
 * click.
 */
function handleSend(game, elements) {
    const hasFreeSlot = countPairs(game.state) < MEMORY_SLOT_COUNT;
    if (!game.isStarted || isPaused(game) || game.isAnimating || !hasFreeSlot) {
        return;
    }
    game.isAnimating = true;
    const tryDurationMs = computeTryDurationMs(game.settings);
    elements.scene.linkElement.style.setProperty("--photon-flight-ms", `${tryDurationMs}ms`);
    elements.scene.linkElement.classList.add("is-sending");
    renderLevel1(game, elements);
    setTimeout(() => {
        elements.scene.linkElement.classList.remove("is-sending");
        const heraldProbability = computeHeraldProbability(toLinkPhysics(game.settings));
        game.state = sendPhotons(game.state, game.clockMs, game.nextRandomFloat, heraldProbability);
        game.isAnimating = false;
        if (game.state.lastAttemptSucceeded) {
            playPairJump(elements.scene);
            openLessonOnce(game, elements, CLICK_LESSON, BSM_NOTE, describeClickLesson(game.state.clickedDetector));
        }
        renderLevel1(game, elements);
    }, tryDurationMs);
}


/**
 * Teleport |0⟩ or |1⟩ to Luigi over the oldest stored pair.
 */
function handleTeleport(game, elements, sentBit) {
    if (game.isAnimating || countPairs(game.state) === 0) {
        return;
    }
    game.state = teleportQubit(game.state, sentBit, game.nextRandomFloat);
    renderLevel1(game, elements);
}


/**
 * Start over with the same seed, so the same presses replay the same run. Lessons already seen stay seen.
 */
function resetLevel1(game, elements) {
    Object.assign(game, {
        state: createLevel1State(), nextRandomFloat: createSeededRandom(LEVEL1_SEED), clockMs: 0, fizzles: [],
        isAnimating: false, openLesson: null,
    });
    showLessonNote(elements.scene, null);
    renderLevel1(game, elements);
}


/**
 * Draw the scene, the HUD (tries, Ψ+ pairs, teleports done), the pause sign, the settings summary and the key hints.
 */
function renderLevel1(game, elements) {
    game.lifetimeMs = computeLifetimeMs(game.settings);
    renderLevel1Scene(elements.scene, game);
    elements.triesElement.textContent = String(game.state.attemptCount).padStart(HUD_DIGIT_COUNT, "0");
    elements.pairsElement.textContent = `${countPairs(game.state)}/${MEMORY_SLOT_COUNT}`;
    elements.teleportsElement.textContent = describeTeleportGoal(game.state.teleportedBits);
    elements.pauseBadge.hidden = !isPaused(game);
    elements.settingsSummary.textContent = describeSettingsEffect(game.settings);
    renderKeyHints(elements.keyHintsElement, listLevel1KeyHints(game));
}


/**
 * The teleport goal in the HUD: a tick beside each of 0 and 1 once it has made it to Luigi.
 */
function describeTeleportGoal(teleportedBits) {
    const marks = [];
    for (const bit of [0, 1]) {
        marks.push(`${bit}${teleportedBits.includes(bit) ? "✓" : "·"}`);
    }
    return marks.join(" ");
}


/**
 * What the current settings add up to, for the panel.
 */
function describeSettingsEffect(settings) {
    const chancePercent = Math.round(computeHeraldProbability(toLinkPhysics(settings)) * PERCENT);
    const trySeconds = (computeTryDurationMs(settings) / MS_PER_SECOND).toFixed(1);
    return `Chance a try clicks: ${chancePercent}%. Each try takes ${trySeconds} s.`;
}


/**
 * The keys that do something right now.
 */
function listLevel1KeyHints(game) {
    if (!game.isStarted) {
        return [];
    }
    if (game.isSettingsOpen) {
        return [{ key: "Esc", action: "Close settings" }];
    }
    if (game.openLesson !== null) {
        return [{ key: "Space", action: "Continue" }];
    }
    const pairCount = countPairs(game.state);
    const hints = [];
    if (pairCount < MEMORY_SLOT_COUNT) {
        hints.push({ key: "Space", action: "Send photons" });
    }
    if (pairCount > 0) {
        hints.push({ key: "0", action: "Teleport |0⟩" }, { key: "1", action: "Teleport |1⟩" });
    }
    hints.push({ key: "R", action: "Reset" }, { key: "Esc", action: "Settings" });
    return hints;
}


startLevel1();
