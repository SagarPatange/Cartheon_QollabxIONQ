/**
 * Start page entry point: the title screen, then the overworld map where Mario walks to a stop and enters it.
 *
 * Opening start.html#map skips the title screen; start.html#map-<stop id> also puts Mario on that stop (each
 * level's HUD Map button uses this). Reads start.html; changes pages only when the player enters a stop.
 */

import { buildWorldMap, placeOnTile } from "./render_map.js";
import {
    MAP_STOPS, buildMapHash, findMapDirection, findMapZoom, findRouteBetweenStops, findStopInDirection,
    findStopIndexFromHash, isEnterKey, isMapHash, planWalk,
} from "./world_map.js";
import { buildStatusBarIcons, renderStatusBar } from "./render_status_bar.js";
import { findElementsById } from "../page_helpers.js";

/**
 * Set up both screens. The map state lives in one object passed to each handler (no globals).
 */
function startStartPage() {
    const elements = findStartPageElements();
    Object.assign(elements, buildWorldMap(elements.mapElement));
    buildStatusBarIcons(elements);

    // walkTimer ends the current walk animation; null while Mario stands still. routeTimer starts the next leg of a
    // walk along several stops (a click on a far stop); null when no such walk is under way.
    // A level's "◀ Map" button opens start.html#map-<stop id>, so Mario starts on the stop he came back from.
    const startStopIndex = findStopIndexFromHash(window.location.hash);
    const game = { isOnMap: false, stopIndex: startStopIndex, facing: "right", walkTimer: null, routeTimer: null };
    listenForInput(game, elements);

    if (isMapHash(window.location.hash)) {
        showMap(game, elements);
    } else {
        elements.continueButton.focus();
    }
}


/**
 * Every element start.html must have, failing fast if one is missing.
 */
function findStartPageElements() {
    return findElementsById({
        titleScreen: "title-screen",
        mapScreen: "map-screen",
        continueButton: "continue-button",
        mapElement: "world-map",
        mapViewport: "map-viewport",
        stopTitle: "stop-title",
        stopDescription: "stop-description",
        enterButton: "enter-button",
        enterLabel: "enter-label",
        stopBadgeSlot: "stop-badge-slot",
        worldMarioSlot: "world-mario-slot",
        arrowKeysSlot: "arrow-keys",
    });
}


/**
 * Wire the buttons, the stops, the keyboard and window resizes to the map's handlers.
 */
function listenForInput(game, elements) {
    elements.continueButton.addEventListener("click", () => showMap(game, elements));
    elements.enterButton.addEventListener("click", () => enterStop(game));
    for (let i = 0; i < elements.stopElements.length; i++) {
        elements.stopElements[i].addEventListener("click", () => handleStopClick(game, elements, i));
    }
    document.addEventListener("keydown", (keyEvent) => handleKey(game, elements, keyEvent));
    // Refit when the window resizes and when the map screen is unhidden (its height goes from 0 to real).
    const resizeObserver = new ResizeObserver(() => fitMapToView(game, elements));
    resizeObserver.observe(elements.mapViewport);
}


/**
 * Swap the title screen for the map.
 */
function showMap(game, elements) {
    game.isOnMap = true;
    elements.titleScreen.hidden = true;
    elements.mapScreen.hidden = false;
    renderMap(game, elements);
}


/**
 * Zoom the map so it fills the height of the map view, then keep the current stop in sight.
 */
function fitMapToView(game, elements) {
    elements.mapElement.style.zoom = String(findMapZoom(elements.mapViewport.clientHeight));
    elements.stopElements[game.stopIndex].scrollIntoView({ block: "nearest", inline: "center" });
}


/**
 * Arrow keys or WASD walk along the path; Enter or Space continues from the title or enters a stop.
 */
function handleKey(game, elements, keyEvent) {
    if (!game.isOnMap) {
        if (isEnterKey(keyEvent.key)) {
            keyEvent.preventDefault();
            showMap(game, elements);
        }
        return;
    }
    // While Mario walks a clicked route, keys wait for him to arrive, so he never cuts off the path.
    if (game.routeTimer !== null) {
        return;
    }
    const direction = findMapDirection(keyEvent.key);
    if (direction !== null) {
        keyEvent.preventDefault();
        walkToStop(game, elements, findStopInDirection(game.stopIndex, direction));
        return;
    }
    if (isEnterKey(keyEvent.key)) {
        keyEvent.preventDefault();
        enterStop(game);
    }
}


/**
 * A click walks Mario along the path to a stop; a click on the stop he already stands on enters it. Clicks while he
 * is still walking a route are ignored.
 */
function handleStopClick(game, elements, stopIndex) {
    if (game.routeTimer !== null) {
        return;
    }
    if (game.stopIndex === stopIndex) {
        enterStop(game);
        return;
    }
    walkAlongRoute(game, elements, stopIndex);
}


/**
 * Walk Mario stop to stop along the drawn path to a far stop, one straight leg at a time, as in SMB3. With reduced
 * motion there is no walk to watch, so he simply arrives, as on a one-stop walk.
 */
function walkAlongRoute(game, elements, targetIndex) {
    const isReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (isReducedMotion) {
        walkToStop(game, elements, targetIndex);
        return;
    }
    walkRemainingLegs(game, elements, findRouteBetweenStops(game.stopIndex, targetIndex));
}


/**
 * Walk the first leg of the route, then the rest once he gets there.
 *
 * @param {number[]} remainingStops - the stops still to reach, in order (indices into MAP_STOPS).
 */
function walkRemainingLegs(game, elements, remainingStops) {
    if (remainingStops.length === 0) {
        game.routeTimer = null;
        return;
    }
    const legMs = walkToStop(game, elements, remainingStops[0]);
    game.routeTimer = window.setTimeout(() => walkRemainingLegs(game, elements, remainingStops.slice(1)), legMs);
}


/**
 * Walk Mario from his stop to a neighbouring one: face the way he goes, step his legs for the length of the walk,
 * then stand still. With reduced motion the CSS skips the animation and he simply arrives.
 *
 * @returns {number} how long the walk takes, in ms (0 when he is already there).
 */
function walkToStop(game, elements, stopIndex) {
    if (stopIndex === game.stopIndex) {
        return 0;
    }
    const walk = planWalk(MAP_STOPS[game.stopIndex], MAP_STOPS[stopIndex], game.facing);
    game.stopIndex = stopIndex;
    game.facing = walk.facing;

    const marioElement = elements.marioElement;
    marioElement.style.setProperty("--walk-ms", `${walk.durationMs}ms`);
    marioElement.classList.toggle("is-facing-left", walk.facing === "left");
    marioElement.classList.add("is-walking");
    window.clearTimeout(game.walkTimer);
    game.walkTimer = window.setTimeout(() => {
        marioElement.classList.remove("is-walking");
        game.walkTimer = null;
    }, walk.durationMs);
    renderMap(game, elements);
    return walk.durationMs;
}


/**
 * Open the page for the stop Mario stands on.
 */
function enterStop(game) {
    window.location.href = MAP_STOPS[game.stopIndex].href;
}


/**
 * Put Mario on his stop, keep him in view, highlight the stop, describe it in the status bar, and keep the address
 * on it so a reload or the back button returns to the same stop.
 */
function renderMap(game, elements) {
    const stop = MAP_STOPS[game.stopIndex];
    window.history.replaceState(null, "", buildMapHash(game.stopIndex));
    placeOnTile(elements.marioElement, stop.tileX, stop.tileY);
    // Scroll to the stop, not to Mario: while he walks, his element is still at the old stop.
    elements.stopElements[game.stopIndex].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    for (let i = 0; i < elements.stopElements.length; i++) {
        elements.stopElements[i].classList.toggle("is-current", i === game.stopIndex);
    }
    renderStatusBar(elements, stop);
}


startStartPage();
