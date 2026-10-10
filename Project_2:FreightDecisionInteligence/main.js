/**
 * Truckload dispatch: simulate a week (one of the first 4 weeks of a month) with a dispatch policy and, for the
 * MILP optimizer, an objective; then replay it on the map with live metrics and an event timeline that explains
 * every decision.
 */

import { CompareView } from "./src/compare_view.js";
import { compareObjectives, loadCities, loadLanes, loadRoutePaths, runSimulation } from "./src/data_source.js";
import { PanelView } from "./src/panel_view.js";
import { advanceTime } from "./src/playback.js";
import { metricsUntil } from "./src/run_metrics.js";
import { TimelineView } from "./src/timeline_view.js";
import { truckPositions } from "./src/truck_motion.js";
import { fitRowToContainer } from "./src/fit_one_row.js";
import { UsMapView } from "./src/us_map_view.js";
import { WEEKS_PER_MONTH, listMonths, weekLabel, weekStartFor } from "./src/week_picker.js";

const MINUTES_PER_DAY = 24 * 60;
const FIRST_MONTH = "2022-01";
const LAST_MONTH = "2024-12";
const DEFAULT_MONTH = "2022-03";

const elements = {
    monthSelect: document.getElementById("month-select"),
    weekSelect: document.getElementById("week-select"),
    policySelect: document.getElementById("policy-select"),
    objectiveSelect: document.getElementById("objective-select"),
    seedInput: document.getElementById("seed-input"),
    simulateButton: document.getElementById("simulate-button"),
    playButton: document.getElementById("play-button"),
    timeSlider: document.getElementById("time-slider"),
    speedSelect: document.getElementById("speed-select"),
    status: document.getElementById("run-status"),
    topbar: document.querySelector(".topbar"),
    runControls: document.querySelector(".run-controls"),
};

const playback = { replay: null, minute: 0, isPlaying: false, lastFrameMs: null };
// Comparisons already run, by "start date|seed": changing only the policy or objective needs no new comparison.
const comparisons = new Map();

async function start() {
    const [cities, lanes, routePaths] = await Promise.all([loadCities(), loadLanes(), loadRoutePaths()]);
    const cityPoints = {};
    for (const city of cities) {
        cityPoints[`${city.name}, ${city.state}`] = [city.lat, city.lon];
    }
    const views = {
        mapView: new UsMapView(document.getElementById("map"), cities, lanes, routePaths),
        panelView: new PanelView(document),
        timelineView: new TimelineView(document),
        compareView: new CompareView(document),
        routePaths,
        cityPoints,
    };
    views.timelineView.onFilterChange = () => render(views);
    fillMonthChoices();
    keepRunControlsOnOneRow();
    connectControls(views);
    await simulateWeek(views);
    requestAnimationFrame((frameMs) => tick(frameMs, views));
}

/** The month list once, then the 4 weeks of the default month. */
function fillMonthChoices() {
    for (const month of listMonths(FIRST_MONTH, LAST_MONTH)) {
        elements.monthSelect.add(new Option(month.label, month.value));
    }
    elements.monthSelect.value = DEFAULT_MONTH;
    fillWeekChoices();
}

/** Weeks 1 to 4 of the chosen month, labelled with their dates; keeps the chosen week number. */
function fillWeekChoices() {
    const chosenWeek = elements.weekSelect.value || "1";
    elements.weekSelect.replaceChildren();
    for (let weekNumber = 1; weekNumber <= WEEKS_PER_MONTH; weekNumber++) {
        elements.weekSelect.add(new Option(weekLabel(elements.monthSelect.value, weekNumber), String(weekNumber)));
    }
    elements.weekSelect.value = chosenWeek;
}

/** Fit the run controls on one line now, and again whenever the window, the fonts or a dropdown's width change. */
function keepRunControlsOnOneRow() {
    const fitControls = () => fitRowToContainer(elements.runControls, elements.topbar);
    fitControls();
    window.addEventListener("resize", fitControls);
    document.fonts.ready.then(fitControls);
    elements.runControls.addEventListener("change", fitControls);
}

/** Greedy is a fixed rule, so the objective only applies to the MILP optimizer. */
function showObjectiveForPolicy() {
    elements.objectiveSelect.disabled = elements.policySelect.value !== "milp";
}

function connectControls(views) {
    elements.monthSelect.addEventListener("change", fillWeekChoices);
    elements.policySelect.addEventListener("change", showObjectiveForPolicy);
    showObjectiveForPolicy();
    elements.simulateButton.addEventListener("click", () => simulateWeek(views));
    elements.playButton.addEventListener("click", () => setPlaying(!playback.isPlaying));
    elements.timeSlider.addEventListener("input", () => {
        playback.minute = Number(elements.timeSlider.value);
        render(views);
    });
    document.addEventListener("keydown", (event) => {
        const isTypingInControl = ["INPUT", "SELECT", "BUTTON"].includes(document.activeElement?.tagName);
        if (event.code === "Space" && !isTypingInControl && playback.replay !== null) {
            event.preventDefault();
            setPlaying(!playback.isPlaying);
        }
    });
}

/** Run the simulator for the chosen week, policy, objective and seed, then replay it from the first minute. */
async function simulateWeek(views) {
    const weekStart = weekStartFor(elements.monthSelect.value, Number(elements.weekSelect.value));
    setPlaying(false);
    elements.simulateButton.disabled = true;
    elements.status.textContent = "Simulating…";
    try {
        const replay = await runSimulation(
            weekStart, elements.policySelect.value, elements.objectiveSelect.value, Number(elements.seedInput.value),
        );
        playback.replay = replay;
        playback.minute = 0;
        elements.timeSlider.max = String(replay.days * MINUTES_PER_DAY);
        views.mapView.clearTrucks();
        elements.status.textContent = "";
        render(views);
        setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        showComparison(views, replay);
    } catch (error) {
        elements.status.textContent = `Could not simulate: ${error.message}`;
    } finally {
        elements.simulateButton.disabled = false;
    }
}

/** The objectives side by side for the replay's week and seed, running the comparison only once per week. */
async function showComparison(views, replay) {
    const key = `${replay.start_date}|${replay.seed}`;
    const weekText = elements.weekSelect.selectedOptions[0]?.text ?? replay.start_date;
    try {
        if (!comparisons.has(key)) {
            views.compareView.showLoading(weekText);
            comparisons.set(key, await compareObjectives(replay.start_date, replay.seed));
        }
        if (playback.replay === replay) {
            views.compareView.show(comparisons.get(key), replay.policy, replay.objective, weekText);
        }
    } catch (error) {
        views.compareView.showError(error.message);
    }
}

function setPlaying(isPlaying) {
    if (isPlaying && playback.replay !== null && playback.minute >= playback.replay.days * MINUTES_PER_DAY) {
        playback.minute = 0;
    }
    playback.isPlaying = isPlaying;
    playback.lastFrameMs = null;
    elements.playButton.textContent = isPlaying ? "Pause" : "Play";
}

function tick(frameMs, views) {
    if (playback.isPlaying && playback.replay !== null) {
        const elapsedMs = playback.lastFrameMs === null ? 0 : frameMs - playback.lastFrameMs;
        playback.lastFrameMs = frameMs;
        const step = advanceTime({
            timeS: playback.minute,
            elapsedMs,
            speed: Number(elements.speedSelect.value),
            endS: playback.replay.days * MINUTES_PER_DAY,
        });
        playback.minute = step.timeS;
        if (step.isFinished) {
            setPlaying(false);
        }
        render(views);
    }
    requestAnimationFrame((nextFrameMs) => tick(nextFrameMs, views));
}

function render(views) {
    const replay = playback.replay;
    if (replay === null) {
        return;
    }
    const positions = truckPositions(replay, playback.minute, views.routePaths, views.cityPoints);
    views.mapView.showTrucks(positions, replay.out_of_service, views.cityPoints);
    const fleetCounts = countFleet(positions, replay.out_of_service.length);
    views.panelView.update(replay, playback.minute, metricsUntil(replay, playback.minute), fleetCounts);
    views.timelineView.update(replay, playback.minute);
    elements.timeSlider.value = String(Math.floor(playback.minute));
}

function countFleet(positions, outOfServiceCount) {
    const counts = { loaded: 0, empty: 0, parked: 0, outOfService: outOfServiceCount };
    for (const position of positions) {
        if (position.phase === "empty") {
            counts.empty += 1;
        } else if (position.phase === "parked") {
            counts.parked += 1;
        } else {
            counts.loaded += 1;
        }
    }
    return counts;
}

start().catch((error) => {
    document.getElementById("map").textContent = `Could not start: ${error.message}`;
    throw error;
});
