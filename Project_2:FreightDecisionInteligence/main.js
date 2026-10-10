/**
 * Truckload dispatch map: replays the Kaggle carrier's loads day by day on real US roads.
 * No dispatching happens yet: loads move along their lanes on their scheduled pickup and delivery times.
 */

import { loadCities, loadLanes, loadRoutePaths, loadYear } from "./src/data_source.js";
import { countLoadsPerLane, loadsInTransit, loadsOnDay, rankLanes, summarizeLoads } from "./src/dispatch_day.js";
import { PanelView } from "./src/panel_view.js";
import { advanceTime } from "./src/playback.js";
import { UsMapView } from "./src/us_map_view.js";

const FIRST_YEAR = 2022;
const LAST_YEAR = 2024;
const MINUTES_PER_DAY = 24 * 60;
const SECONDS_PER_MINUTE = 60;
const BUSIEST_LANE_LIMIT = 5;
const START_DATE = "2022-03-01";

const elements = {
    dateInput: document.getElementById("date-input"),
    playButton: document.getElementById("play-button"),
    timeSlider: document.getElementById("time-slider"),
    speedSelect: document.getElementById("speed-select"),
};

const replay = {
    year: FIRST_YEAR,
    dayOfYear: 0,
    minuteOfDay: 0,
    yearFiles: new Map(),
    isPlaying: false,
    lastFrameMs: null,
};

async function start() {
    const [cities, lanes, routePaths] = await Promise.all([loadCities(), loadLanes(), loadRoutePaths()]);
    const views = {
        mapView: new UsMapView(document.getElementById("map"), cities, lanes, routePaths),
        panelView: new PanelView(document, cities, lanes),
        laneCount: lanes.length,
    };
    connectControls(views);
    await jumpToDate(START_DATE, views);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPlaying(!prefersReducedMotion);
    requestAnimationFrame((frameMs) => tick(frameMs, views));
}

function connectControls(views) {
    elements.dateInput.addEventListener("change", () => jumpToDate(elements.dateInput.value, views));
    elements.playButton.addEventListener("click", () => setPlaying(!replay.isPlaying));
    elements.timeSlider.addEventListener("input", () => {
        replay.minuteOfDay = Number(elements.timeSlider.value);
        render(views);
    });
    document.addEventListener("keydown", (event) => {
        const isTypingInControl = ["INPUT", "SELECT", "BUTTON"].includes(document.activeElement?.tagName);
        if (event.code === "Space" && !isTypingInControl) {
            event.preventDefault();
            setPlaying(!replay.isPlaying);
        }
    });
}

async function jumpToDate(isoDate, views) {
    const date = new Date(`${isoDate}T00:00:00Z`);
    replay.year = date.getUTCFullYear();
    replay.dayOfYear = Math.round((date - Date.UTC(replay.year, 0, 1)) / (MINUTES_PER_DAY * SECONDS_PER_MINUTE * 1000));
    replay.minuteOfDay = 0;
    await ensureYearLoaded(replay.year);
    render(views);
}

async function ensureYearLoaded(year) {
    if (!replay.yearFiles.has(year)) {
        replay.yearFiles.set(year, await loadYear(year));
    }
}

function setPlaying(isPlaying) {
    replay.isPlaying = isPlaying;
    replay.lastFrameMs = null;
    elements.playButton.textContent = isPlaying ? "Pause" : "Play";
}

/** Move the clock; the speed select gives simulated minutes per real second. */
async function tick(frameMs, views) {
    if (replay.isPlaying) {
        const elapsedMs = replay.lastFrameMs === null ? 0 : frameMs - replay.lastFrameMs;
        replay.lastFrameMs = frameMs;
        const step = advanceTime({
            timeS: replay.minuteOfDay,
            elapsedMs,
            speed: Number(elements.speedSelect.value),
            endS: MINUTES_PER_DAY,
        });
        replay.minuteOfDay = step.timeS;
        if (step.isFinished) {
            await moveToNextDay();
        }
        render(views);
    }
    requestAnimationFrame((nextFrameMs) => tick(nextFrameMs, views));
}

async function moveToNextDay() {
    replay.minuteOfDay = 0;
    replay.dayOfYear += 1;
    const daysInYear = isLeapYear(replay.year) ? 366 : 365;
    if (replay.dayOfYear < daysInYear) {
        return;
    }
    if (replay.year === LAST_YEAR) {
        replay.dayOfYear = daysInYear - 1;
        replay.minuteOfDay = MINUTES_PER_DAY - 1;
        setPlaying(false);
        return;
    }
    replay.year += 1;
    replay.dayOfYear = 0;
    await ensureYearLoaded(replay.year);
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function render(views) {
    const yearFile = replay.yearFiles.get(replay.year);
    if (yearFile === undefined) {
        return;
    }
    const todaysLoads = loadsOnDay(yearFile, replay.dayOfYear);
    const loadsPerLane = countLoadsPerLane(todaysLoads, views.laneCount);
    const loadsOnRoad = loadsInTransit(yearFile, replay.dayOfYear, replay.minuteOfDay);
    views.mapView.update(loadsOnRoad);
    views.panelView.update(
        replay.year,
        replay.dayOfYear,
        replay.minuteOfDay,
        summarizeLoads(todaysLoads),
        rankLanes(loadsPerLane, BUSIEST_LANE_LIMIT),
        loadsOnRoad.length,
    );
    elements.timeSlider.value = String(Math.floor(replay.minuteOfDay));
    elements.dateInput.value = isoDate(replay.year, replay.dayOfYear);
}

function isoDate(year, dayOfYear) {
    return new Date(Date.UTC(year, 0, 1 + dayOfYear)).toISOString().slice(0, 10);
}

start().catch((error) => {
    document.getElementById("map").textContent = `Could not start the map: ${error.message}`;
    throw error;
});
