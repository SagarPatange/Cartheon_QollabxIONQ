/**
 * Level 1 page entry point: Mario's qubit tower, the BSM station (a telecom tower with detectors D+ and D-) in the
 * middle of the fiber, Luigi's qubit tower. The goal types itself out first; the level starts once it has.
 *
 * The level opens like a story. A lesson note introduces the memories (3 slots, one Rydberg atom each), then a prompt
 * asks for Space. The first Space freezes the photons just after the atoms emit them, with a lesson on what that
 * means; Space again lets them fly on. The first try with no click, one click and two clicks each get a lesson; if
 * two clicks have not happened by try FORCED_TWO_CLICK_TRY, that try shows them, and if no pair has been made by
 * FORCED_ONE_CLICK_TRY, that try makes one. After the one-click lesson the settings panel opens for a short tour: one
 * tip per setting, pointing at it from beside the panel, Space for next. The default link cannot hold 3 pairs at
 * once, so the tour ends on the level's hint: change the settings.
 *
 * Space sends photons (a mouse click does nothing, so only Space moves the level on); each click at the BSM stores
 * a Bell pair in both towers (3 slots), and Mario and Luigi jump. Pairs decohere after the memory lifetime. The
 * first click and the first decoherence pause the game with a lesson note (Space continues). R starts over. Goal:
 * fill all 3 slots at once.
 *
 * The gear button (or Esc) slides in a panel that pauses the game and changes the link: detector efficiency,
 * fiber attenuation, internode distance and memory lifetime. Reads level1.html.
 */

import {
    CLICK_LESSON, DECOHERENCE_LESSON, EMISSION_LESSON, FIRST_SEND_PROMPT, MEMORY_LESSON, NO_CLICK_LESSON,
    SETTINGS_HINT_LESSON, SETTINGS_TOUR, TWO_CLICK_LESSON, describeClickLesson, describeDecoherenceLesson,
    describeEmissionLesson, describeMemoryLesson, describeNoClickLesson, describeSettingsHint, describeTourEnding,
    describeTwoClickLesson, shouldShowSettingsHint,
} from "./level1_lessons.js";
import {
    MEMORY_SLOT_COUNT, ONE_CLICK, TWO_CLICKS, computeHeraldProbability, countPairs, createLevel1State,
    decohereExpiredPairs, sendPhotons,
} from "./level1_protocol.js";
import {
    LINK_SETTINGS, canFillMemory, computeLifetimeMs, computeTryDurationMs, createDefaultSettings, formatSettingValue,
    summarizeLinkSettings, toLinkPhysics,
} from "./level1_settings.js";
import {
    BSM_NOTE, LOCKED_CONTINUE_TEXT, MARIO_NOTE, READY_CONTINUE_TEXT, buildLevel1Track, playPairJump,
    renderLevel1Scene, showLessonNote, unlockLessonNote,
} from "./render_level1.js";
import { findElementsById, fitTrackToWorld, playGoalIntro } from "../page_helpers.js";
import { GEAR_SPRITE, drawSprite } from "../pixel_sprites.js";
import { createSeededRandom } from "../seeded_random.js";
import { buildSettingsRows, highlightSettingRow } from "../settings_panel.js";

const LEVEL1_SEED = 1985;
// The game clock ticks this often; decoherence and the fading glow follow it, and it stops while paused.
const CLOCK_TICK_MS = 100;
// How long a decohered qubit fizzles before its slot shows empty.
const FIZZLE_MS = 900;
// A lesson note stays up at least this long (real time) before Space or a click can put it away, so it gets read.
const LESSON_READ_MS = 1000;
// The story shows two clicks by this try at the latest (the first try is the frozen emission one).
const FORCED_TWO_CLICK_TRY = 3;
// ...and a first Bell pair by this try at the latest: the default link almost never clicks.
const FORCED_ONE_CLICK_TRY = 5;
// Room between the tour tip and the settings panel (where its arrow sits), and between the tip and the window edge.
const TOUR_TIP_GAP_PX = 18;
const TOUR_TIP_MARGIN_PX = 8;
const HUD_DIGIT_COUNT = 3;
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
    window.addEventListener("resize", () => {
        fitTrackToWorld(elements, TRACK_SIZE);
        renderSettingsTour(game, elements);
    });

    // isStarted stays false until the goal has typed itself out; until then keys and clicks do nothing.
    const game = {
        isStarted: false, lessonsSeen: new Set(), settings: createDefaultSettings(), isSettingsOpen: false,
        tourStepIndex: null, isTourLocked: false, hasToured: false, lostPairCountAtLastHint: 0,
    };
    buildSettingsRows(elements.settingsRows, LINK_SETTINGS, game.settings, formatSettingValue, (id, value) => {
        game.settings[id] = value;
        renderLevel1(game, elements);
    });
    resetLevel1(game, elements);
    elements.settingsButton.append(drawSprite(GEAR_SPRITE, GEAR_PIXEL_SIZE, "gear-icon"));
    elements.settingsButton.addEventListener("click", () => toggleSettings(game, elements));
    elements.settingsCloseButton.addEventListener("click", () => toggleSettings(game, elements));
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
        tourBackdrop: "tour-backdrop",
        hudElement: "hud",
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
    const lostPairCount = game.state.decoherenceCount;
    const isHintDue = shouldShowSettingsHint(lostPairCount, game.lostPairCountAtLastHint, canFillMemory(game.settings));
    if (isHintDue && game.openLesson === null) {
        game.lostPairCountAtLastHint = lostPairCount;
        openLesson(game, elements, SETTINGS_HINT_LESSON, BSM_NOTE, describeSettingsHint());
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
    openLesson(game, elements, lessonId, anchor, text);
}


/**
 * Pause and show a note over where it happened, locked for LESSON_READ_MS. Used directly for notes that repeat, such
 * as the settings hint.
 */
function openLesson(game, elements, lessonId, anchor, text) {
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
    if (nextStepIndex < listTourSteps(game).length) {
        showSettingsTourStep(game, elements, nextStepIndex);
        return;
    }
    toggleSettings(game, elements);
}


/**
 * The tour's tip, beside the panel and pointing at the setting it is about (or at the panel's title for the last
 * tip); hidden when no tour is under way.
 */
function renderSettingsTour(game, elements) {
    const isTouring = game.tourStepIndex !== null;
    elements.settingsTour.hidden = !isTouring;
    elements.tourBackdrop.hidden = !isTouring;
    if (!isTouring) {
        highlightSettingRow(elements.settingsRows, null);
        return;
    }
    const step = listTourSteps(game)[game.tourStepIndex];
    elements.settingsTourText.textContent = step.text;
    elements.settingsTour.classList.toggle("is-locked", game.isTourLocked);
    elements.settingsTourContinue.textContent = game.isTourLocked ? LOCKED_CONTINUE_TEXT : READY_CONTINUE_TEXT;
    highlightSettingRow(elements.settingsRows, step.settingId);
    const targetElement = step.settingId === null
        ? null
        : elements.settingsRows.querySelector(`[data-setting-id="${step.settingId}"]`);
    placeTourTip(elements, targetElement);
}


/**
 * Put the tour tip just left of the settings panel, below the HUD, level with its target, with its arrow on the
 * target's middle. With no target (the last tip) it sits halfway down the window without an arrow. Uses the panel's
 * open width, so it lands right even while the panel is still sliding in. On a window too narrow for both, the tip
 * sits over the panel's left edge without an arrow.
 */
function placeTourTip(elements, targetElement) {
    const tipElement = elements.settingsTour;
    const tipHeightPx = tipElement.offsetHeight;
    const lowestTopPx = elements.hudElement.getBoundingClientRect().bottom + TOUR_TIP_MARGIN_PX;
    const highestTopPx = window.innerHeight - tipHeightPx - TOUR_TIP_MARGIN_PX;
    let targetMiddlePx = window.innerHeight / 2;
    if (targetElement !== null) {
        const targetRect = targetElement.getBoundingClientRect();
        targetMiddlePx = targetRect.top + targetRect.height / 2;
    }
    const centredTopPx = targetMiddlePx - tipHeightPx / 2;
    const topPx = Math.max(lowestTopPx, Math.min(highestTopPx, centredTopPx));
    const panelLeftPx = window.innerWidth - elements.settingsPanel.offsetWidth;
    const besidePanelPx = panelLeftPx - TOUR_TIP_GAP_PX - tipElement.offsetWidth;
    const hasRoomBeside = besidePanelPx >= TOUR_TIP_MARGIN_PX;
    const hasArrow = hasRoomBeside && targetElement !== null;
    tipElement.classList.toggle("has-arrow", hasArrow);
    tipElement.style.left = `${hasRoomBeside ? besidePanelPx : TOUR_TIP_MARGIN_PX}px`;
    tipElement.style.top = `${topPx}px`;
    tipElement.style.setProperty("--arrow-top", `${targetMiddlePx - topPx}px`);
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
 * explain the first click. The atoms that emitted stay lit blue for the whole flight, whatever the outcome.
 */
function flyPhotons(game, elements) {
    game.emittingSlotIndex = game.state.slots.indexOf(null);
    elements.scene.linkElement.classList.remove("is-emitting");
    const tryDurationMs = computeTryDurationMs(game.settings);
    elements.scene.linkElement.style.setProperty("--photon-flight-ms", `${tryDurationMs}ms`);
    renderLevel1(game, elements);
    setTimeout(() => {
        elements.scene.linkElement.classList.remove("is-sending");
        const heraldProbability = computeHeraldProbability(toLinkPhysics(game.settings));
        const forcedOutcome = decideForcedOutcome(game);
        game.state = sendPhotons(game.state, game.clockMs, game.nextRandomFloat, heraldProbability, forcedOutcome);
        game.isAnimating = false;
        game.emittingSlotIndex = null;
        if (game.state.lastAttemptSucceeded) {
            playPairJump(elements.scene);
            openLessonOnce(game, elements, CLICK_LESSON, BSM_NOTE, describeClickLesson(game.state.clickedDetector));
        } else if (game.state.hadTwoClicks) {
            openLessonOnce(game, elements, TWO_CLICK_LESSON, BSM_NOTE, describeTwoClickLesson());
        } else {
            openLessonOnce(game, elements, NO_CLICK_LESSON, BSM_NOTE, describeNoClickLesson());
        }
        renderLevel1(game, elements);
    }, tryDurationMs);
}


/**
 * What the story owes the player on this try, or null: two clicks on try FORCED_TWO_CLICK_TRY if none yet, and a
 * first pair on try FORCED_ONE_CLICK_TRY if none yet.
 */
function decideForcedOutcome(game) {
    const tryNumber = game.state.attemptCount + 1;
    const isTwoClickDue = !game.lessonsSeen.has(TWO_CLICK_LESSON) && tryNumber === FORCED_TWO_CLICK_TRY;
    if (isTwoClickDue) {
        return TWO_CLICKS;
    }
    const isOneClickDue = !game.lessonsSeen.has(CLICK_LESSON) && tryNumber === FORCED_ONE_CLICK_TRY;
    if (isOneClickDue) {
        return ONE_CLICK;
    }
    return null;
}


/**
 * The tour's tips: one per setting, then the hint, which follows the settings as the player changes them.
 */
function listTourSteps(game) {
    const endingStep = { settingId: null, text: describeTourEnding(canFillMemory(game.settings)) };
    return [...SETTINGS_TOUR, endingStep];
}


/**
 * Start over with the same seed, so the same presses replay the same run. Lessons already seen stay seen.
 */
function resetLevel1(game, elements) {
    Object.assign(game, {
        state: createLevel1State(), nextRandomFloat: createSeededRandom(LEVEL1_SEED), clockMs: 0, fizzles: [],
        isAnimating: false, openLesson: null, openLessonId: null, isLessonLocked: false, emittingSlotIndex: null,
        lostPairCountAtLastHint: 0,
    });
    elements.scene.linkElement.classList.remove("is-sending", "is-emitting");
    showLessonNote(elements.scene, null);
    renderLevel1(game, elements);
}


/**
 * Draw the scene, the HUD (tries, Ψ+ pairs), the pause sign, the Space prompt and the settings summary.
 */
function renderLevel1(game, elements) {
    game.lifetimeMs = computeLifetimeMs(game.settings);
    renderLevel1Scene(elements.scene, game);
    elements.triesElement.textContent = String(game.state.attemptCount).padStart(HUD_DIGIT_COUNT, "0");
    elements.pairsElement.textContent = `${countPairs(game.state)}/${MEMORY_SLOT_COUNT}`;
    // A lesson note or tour tip already says the game is waiting, so the badge only shows for the settings panel.
    const isShowingMessage = game.openLesson !== null || game.tourStepIndex !== null;
    elements.pauseBadge.hidden = !isPaused(game) || isShowingMessage;
    elements.storyPromptElement.hidden = !canZapAtoms(game);
    renderSettingsSummary(elements.settingsSummary, summarizeLinkSettings(game.settings));
    renderSettingsTour(game, elements);
}


/**
 * Space would zap the atoms right now (the memories have been introduced, nothing is paused or in flight, and a
 * slot is free), so the sky asks for it.
 */
function canZapAtoms(game) {
    const hasMetMemories = game.lessonsSeen.has(MEMORY_LESSON);
    const hasFreeSlot = countPairs(game.state) < MEMORY_SLOT_COUNT;
    return game.isStarted && hasMetMemories && !isPaused(game) && !game.isAnimating && hasFreeSlot;
}


/**
 * The panel's summary: two numbers side by side (chance per try, time per try), then a verdict line with a ✓ or ✗,
 * so the answer never rests on colour alone.
 */
function renderSettingsSummary(summaryElement, summary) {
    const verdictText = summary.canFill ? "All 3 slots can fill" : "Pairs die before 3 fill";
    const verdictIcon = summary.canFill ? "✓" : "✗";
    summaryElement.classList.toggle("can-fill", summary.canFill);
    summaryElement.innerHTML =
        `<div class="summary-stats">` +
        `<div class="summary-stat"><span class="summary-value">${summary.chancePercent}%</span>` +
        `<span class="summary-label">pair per try</span></div>` +
        `<div class="summary-stat"><span class="summary-value">${summary.trySeconds} s</span>` +
        `<span class="summary-label">per try</span></div>` +
        `</div>` +
        `<p class="summary-verdict"><span class="summary-icon" aria-hidden="true">${verdictIcon}</span>` +
        `${verdictText}</p>`;
}


startLevel1();
