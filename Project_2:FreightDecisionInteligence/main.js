/**
 * Truckload dispatch: simulate a week with a dispatch policy, then replay it on the map with live metrics and an
 * event timeline that explains every decision.
 */

import { loadCities, loadLanes, loadRoutePaths, runSimulation } from "./src/data_source.js";
import { PanelView } from "./src/panel_view.js";
import { advanceTime } from "./src/playback.js";
import { metricsUntil } from "./src/run_metrics.js";
import { TimelineView } from "./src/timeline_view.js";
import { truckPositions } from "./src/truck_motion.js";
import { UsMapView } from "./src/us_map_view.js";

const MINUTES_PER_DAY = 24 * 60;
const DEFAULT_WEEK_START = "2022-03-07";

const elements = {
    weekInput: document.getElementById("week-input"),
    policySelect: document.getElementById("policy-select"),
    seedInput: document.getElementById("seed-input"),
    simulateButton: document.getElementById("simulate-button"),
    playButton: document.getElementById("play-button"),
    timeSlider: document.getElementById("time-slider"),
    speedSelect: document.getElementById("speed-select"),
    status: document.getElementById("run-status"),
};

const playback = { replay: null, minute: 0, isPlaying: false, lastFrameMs: null };

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
        routePaths,
        cityPoints,
    };
    views.timelineView.onFilterChange = () => render(views);
    connectControls(views);
    elements.weekInput.value = DEFAULT_WEEK_START;
    await simulateWeek(views);
    requestAnimationFrame((frameMs) => tick(frameMs, views));
}

function connectControls(views) {
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

/** Run the simulator for the chosen week, policy and seed, then replay it from the first minute. */
async function simulateWeek(views) {
    const weekStart = mondayOf(elements.weekInput.value);
    elements.weekInput.value = weekStart;
    setPlaying(false);
    elements.simulateButton.disabled = true;
    elements.status.textContent = "Simulating…";
    try {
        const replay = await runSimulation(weekStart, elements.policySelect.value, Number(elements.seedInput.value));
        playback.replay = replay;
        playback.minute = 0;
        elements.timeSlider.max = String(replay.days * MINUTES_PER_DAY);
        views.mapView.clearTrucks();
        views.panelView.showDays(replay);
        elements.status.textContent =
            `${replay.trucks.length} trucks · ${replay.summary.loads_tendered.toLocaleString("en-US")} loads tendered · ` +
            `policy ${replay.policy}, seed ${replay.seed}`;
        render(views);
        setPlaying(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (error) {
        elements.status.textContent = `Could not simulate: ${error.message}`;
    } finally {
        elements.simulateButton.disabled = false;
    }
}

/** The Monday on or before a date, as YYYY-MM-DD: runs always cover Monday to Sunday. */
function mondayOf(isoDate) {
    const day = new Date(`${isoDate}T00:00:00Z`);
    const daysSinceMonday = (day.getUTCDay() + 6) % 7;
    day.setUTCDate(day.getUTCDate() - daysSinceMonday);
    return day.toISOString().slice(0, 10);
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
