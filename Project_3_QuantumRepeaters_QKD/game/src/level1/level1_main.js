/**
 * Level 1 page entry point: Mario's qubit tower, the BSM station (a telecom tower with detectors D+ and D-) in the
 * middle of the fiber, Luigi's qubit tower. The goal types itself out first; the level starts once it has.
 *
 * The level opens like a story. A lesson note introduces the memories (3 slots, one Rydberg atom each), then a prompt
 * asks for Space. The first Space freezes the photons just after the atoms emit them, with a lesson on what that
 * means; Space again lets them fly on. After the first Bell pair's lesson, the settings panel opens for a short tour:
 * one tip per setting, Space for the next.
 *
 * Space (or a click on the scene) sends photons; each click at the BSM stores a Bell pair in both towers (3 slots),
 * and Mario and Luigi jump. Pairs decohere after the memory lifetime. The first click and the first decoherence pause
 * the game with a lesson note (Space continues). R starts over. Goal: fill all 3 slots at once.
 *
 * The gear button (or Esc) slides in a panel that pauses the game and changes the link: detector efficiency,
 * fiber attenuation, internode distance and memory lifetime. Reads level1.html.
 */

import {
    CLICK_LESSON, DECOHERENCE_LESSON, EMISSION_LESSON, FIRST_SEND_PROMPT, MEMORY_LESSON, SETTINGS_TOUR,
    describeClickLesson, describeDecoherenceLesson, describeEmissionLesson, describeMemoryLesson,
} from "./level1_lessons.js";
import {
    MEMORY_SLOT_COUNT, computeHeraldProbability, countPairs, createLevel1State, decohereExpiredPairs, sendPhotons,
} from "./level1_protocol.js";
import {
    LINK_SETTINGS, computeLifetimeMs, computeTryDurationMs, createDefaultSettings, formatSettingValue, toLinkPhysics,
} from "./level1_settings.js";
import {
    BSM_NOTE, LOCKED_CONTINUE_TEXT, MARIO_NOTE, READY_CONTINUE_TEXT, buildLevel1Track, playPairJump,
    renderLevel1Scene, showLessonNote, unlockLessonNote,
} from "./render_level1.js";
import { findElementsById, fitTrackToWorld, playGoalIntro, renderKeyHints } from "../page_helpers.js";
import { GEAR_SPRITE, drawSprite } from "../pixel_sprites.js";
import { createSeededRandom } from "../seeded_random.js";
import { buildSettingsRows, highlightSettingRow } from "../settings_panel.js";

const LEVEL1_SEED = 1985;
// The game clock ticks this often; decoherence and the fading glow follow it, and it stops while paused.
const CLOCK_TICK_MS = 100;
// How long a decohered qubit fizzles before its slot shows empty.
const FIZZLE_MS = 900;
// A lesson note stays up at least this long (real time) before Space or a click can put it away, so it gets read.
const LESSON_READ_MS = 2000;
const HUD_DIGIT_COUNT = 3;
const PERCENT = 100;
const MS_PER_SECOND = 1000;
// The gear on the Settings button: 13 sprite pixels at this size match the height of the Map button.
const GEAR_PIXEL_SIZE = 3;
// Natural size of the scene (styles/level1.css); below it the ground (64 px), above it the goal line and key hints.
const TRACK_SIZE = { trackHeightPx: 470, trackMinWidthPx: 870, reservedHeightPx: 64 + 150 };


/**
 * Build the scene and settings panel, wire the controls and start the clock. Game state lives in one object.
 */
function startLevel1() {
    const elements = findLevel1Elements();
    elements.scene = buildLevel1Track(elements.trackElement);
    elements.storyPromptElement.textContent = FIRST_SEND_PROMPT;
    fitTrackToWorld(elements, TRACK_SIZE);
    window.addEventListener("resize", () => fitTrackToWorld(elements, TRACK_SIZE));

    // isStarted stays false until the goal has typed itself out; until then keys and clicks do nothing.
    const game = {
        isStarted: false, lessonsSeen: new Set(), settings: createDefaultSettings(), isSettingsOpen: false,
        tourStepIndex: null, isTourLocked: false, hasToured: false,
    };
    buildSettingsRows(elements.settingsRows, LINK_SETTINGS, game.settings, formatSettingValue, (id, value) => {
        game.settings[id] = value;
        renderLevel1(game, elements);
    });
    resetLevel1(game, elements);
    elements.worldElement.addEventListener("click", () => handleClick(game, elements));
    elements.settingsButton.append(drawSprite(GEAR_SPRITE, GEAR_PIXEL_SIZE, "gear-icon"));
    elements.settingsButton.addEventListener("click", () => toggleSettings(game, elements));
    elements.settingsCloseButton.addEventListener("click", () => toggleSettings(game, elements));
    elements.settingsTour.addEventListener("click", () => advanceSettingsTour(game, elements));
    document.addEventListener("keydown", (keyEvent) => handleLevel1Key(game, elements, keyEvent));
    setInterval(() => tickClock(game, elements), CLOCK_TICK_MS);
    playGoalIntro(elements.statusElement).then(() => {
        game.isStarted = true;
        openLessonOnce(game, elements, MEMORY_LESSON, MARIO_NOTE, describeMemoryLesson());
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
        storyPromptElement: "story-prompt",
        pauseBadge: "pause-badge",
        triesElement: "hud-tries",
        pairsElement: "hud-pairs",
        settingsButton: "settings-button",
        settingsPanel: "settings-panel",
        settingsRows: "settings-rows",
        settingsSummary: "settings-summary",
        settingsCloseButton: "settings-close",
        settingsTour: "settings-tour",
        settingsTourText: "settings-tour-text",
        settingsTourContinue: "settings-tour-continue",
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
 * The first time something happens, pause and explain it in a note over where it happened. The note stays locked
 * for LESSON_READ_MS, so a quick press cannot skip it.
 */
function openLessonOnce(game, elements, lessonId, anchor, text) {
    if (game.lessonsSeen.has(lessonId)) {
        return;
    }
    game.lessonsSeen.add(lessonId);
    game.openLesson = anchor;
    game.openLessonId = lessonId;
    game.isLessonLocked = true;
    showLessonNote(elements.scene, anchor, text);
    setTimeout(() => unlockLesson(game, elements, lessonId), LESSON_READ_MS);
}


/**
 * Let the player put the note away, if it is still the one that is up.
 */
function unlockLesson(game, elements, lessonId) {
    if (game.openLessonId !== lessonId) {
        return;
    }
    game.isLessonLocked = false;
    unlockLessonNote(elements.scene);
    renderLevel1(game, elements);
}


/**
 * Space sends photons; R starts over; Esc opens or closes the settings. While a lesson note or a tour tip is up,
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
    if (game.tourStepIndex !== null && isContinueKey) {
        keyEvent.preventDefault();
        advanceSettingsTour(game, elements);
        return;
    }
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
 * Put the lesson note away and let the clock run again, unless it is still locked. Photons frozen for the emission
 * lesson fly on.
 */
function closeLesson(game, elements) {
    if (game.isLessonLocked) {
        return;
    }
    const closedLessonId = game.openLessonId;
    game.openLesson = null;
    game.openLessonId = null;
    showLessonNote(elements.scene, null);
    if (closedLessonId === CLICK_LESSON && !game.hasToured) {
        startSettingsTour(game, elements);
        return;
    }
    if (game.emittingSlotIndex !== null) {
        flyPhotons(game, elements);
        return;
    }
    renderLevel1(game, elements);
}


/**
 * Slide the settings panel in (pausing the game) or out. Closing it ends a tour that is under way.
 */
function toggleSettings(game, elements) {
    if (!game.isStarted) {
        return;
    }
    game.isSettingsOpen = !game.isSettingsOpen;
    elements.settingsPanel.classList.toggle("is-open", game.isSettingsOpen);
    elements.settingsButton.setAttribute("aria-expanded", String(game.isSettingsOpen));
    if (!game.isSettingsOpen) {
        game.tourStepIndex = null;
    }
    renderLevel1(game, elements);
}


/**
 * Open the settings panel and point at its first setting. Runs once, after the first Bell pair's lesson.
 */
function startSettingsTour(game, elements) {
    game.hasToured = true;
    if (!game.isSettingsOpen) {
        toggleSettings(game, elements);
    }
    showSettingsTourStep(game, elements, 0);
}


/**
 * Show one tour tip, locked for LESSON_READ_MS so it gets read.
 */
function showSettingsTourStep(game, elements, stepIndex) {
    game.tourStepIndex = stepIndex;
    game.isTourLocked = true;
    renderLevel1(game, elements);
    setTimeout(() => {
        if (game.tourStepIndex === stepIndex) {
            game.isTourLocked = false;
            renderLevel1(game, elements);
        }
    }, LESSON_READ_MS);
}


/**
 * On to the next tip once this one unlocks; after the last tip, close the panel and play on.
 */
function advanceSettingsTour(game, elements) {
    if (game.tourStepIndex === null || game.isTourLocked) {
        return;
    }
    const nextStepIndex = game.tourStepIndex + 1;
    if (nextStepIndex < SETTINGS_TOUR.length) {
        showSettingsTourStep(game, elements, nextStepIndex);
        return;
    }
    toggleSettings(game, elements);
}


/**
 * The tour's tip box at the top of the panel, and the setting it points at; hidden when no tour is under way.
 */
function renderSettingsTour(game, elements) {
    const isTouring = game.tourStepIndex !== null;
    elements.settingsTour.hidden = !isTouring;
    if (!isTouring) {
        highlightSettingRow(elements.settingsRows, null);
        return;
    }
    const step = SETTINGS_TOUR[game.tourStepIndex];
    elements.settingsTourText.textContent = step.text;
    elements.settingsTour.classList.toggle("is-locked", game.isTourLocked);
    elements.settingsTourContinue.textContent = game.isTourLocked ? LOCKED_CONTINUE_TEXT : READY_CONTINUE_TEXT;
    highlightSettingRow(elements.settingsRows, step.settingId);
}


/**
 * Zap both atoms so each emits a photon. The very first time, freeze the photons at their towers and explain the
 * emission; otherwise send them straight on to the BSM Node.
 */
function handleSend(game, elements) {
    const hasFreeSlot = countPairs(game.state) < MEMORY_SLOT_COUNT;
    if (!game.isStarted || isPaused(game) || game.isAnimating || !hasFreeSlot) {
        return;
    }
    game.isAnimating = true;
    const linkElement = elements.scene.linkElement;
    linkElement.style.setProperty("--photon-flight-ms", `${computeTryDurationMs(game.settings)}ms`);
    linkElement.classList.add("is-sending");
    if (game.lessonsSeen.has(EMISSION_LESSON)) {
        flyPhotons(game, elements);
        return;
    }
    game.emittingSlotIndex = game.state.slots.indexOf(null);
    linkElement.classList.add("is-emitting");
    openLessonOnce(game, elements, EMISSION_LESSON, BSM_NOTE, describeEmissionLesson());
    renderLevel1(game, elements);
}


/**
 * Let the photons fly to the BSM Node, wait one try's length, then store the pair if it clicked: jump for joy, and
 * explain the first click.
 */
function flyPhotons(game, elements) {
    game.emittingSlotIndex = null;
    elements.scene.linkElement.classList.remove("is-emitting");
    const tryDurationMs = computeTryDurationMs(game.settings);
    elements.scene.linkElement.style.setProperty("--photon-flight-ms", `${tryDurationMs}ms`);
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
 * Start over with the same seed, so the same presses replay the same run. Lessons already seen stay seen.
 */
function resetLevel1(game, elements) {
    Object.assign(game, {
        state: createLevel1State(), nextRandomFloat: createSeededRandom(LEVEL1_SEED), clockMs: 0, fizzles: [],
        isAnimating: false, openLesson: null, openLessonId: null, isLessonLocked: false, emittingSlotIndex: null,
    });
    elements.scene.linkElement.classList.remove("is-sending", "is-emitting");
    showLessonNote(elements.scene, null);
    renderLevel1(game, elements);
}


/**
 * Draw the scene, the HUD (tries, Ψ+ pairs), the pause sign, the settings summary and the key hints.
 */
function renderLevel1(game, elements) {
    game.lifetimeMs = computeLifetimeMs(game.settings);
    renderLevel1Scene(elements.scene, game);
    elements.triesElement.textContent = String(game.state.attemptCount).padStart(HUD_DIGIT_COUNT, "0");
    elements.pairsElement.textContent = `${countPairs(game.state)}/${MEMORY_SLOT_COUNT}`;
    elements.pauseBadge.hidden = !isPaused(game);
    elements.storyPromptElement.hidden = !isWaitingForFirstSend(game);
    elements.settingsSummary.textContent = describeSettingsEffect(game.settings);
    renderSettingsTour(game, elements);
    renderKeyHints(elements.keyHintsElement, listLevel1KeyHints(game));
}


/**
 * The memory lesson is done but the player has not pressed Space yet: the sky asks for it.
 */
function isWaitingForFirstSend(game) {
    const hasMetMemories = game.lessonsSeen.has(MEMORY_LESSON);
    const hasSentPhotons = game.lessonsSeen.has(EMISSION_LESSON);
    return hasMetMemories && !hasSentPhotons && !isPaused(game);
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
    if (game.tourStepIndex !== null && !game.isTourLocked) {
        return [{ key: "Space", action: "Next tip" }, { key: "Esc", action: "Skip tour" }];
    }
    if (game.isSettingsOpen) {
        return [{ key: "Esc", action: "Close settings" }];
    }
    if (game.openLesson !== null && game.isLessonLocked) {
        return [];
    }
    if (game.openLesson !== null) {
        return [{ key: "Space", action: "Continue" }];
    }
    const pairCount = countPairs(game.state);
    const hints = [];
    if (pairCount < MEMORY_SLOT_COUNT) {
        hints.push({ key: "Space", action: "Send photons" });
    }
    hints.push({ key: "R", action: "Reset" }, { key: "Esc", action: "Settings" });
    return hints;
}


startLevel1();
