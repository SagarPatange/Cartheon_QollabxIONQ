/**
 * Build the overworld map once from the tile data in world_map.js: sea, islands, bushes, pipes, paths, bridges, the
 * repeater towers out to Peach's castle, the stops and Mario.
 *
 * Fills the empty #world-map canvas from start.html; start_main.js moves Mario and highlights stops later.
 */

import {
    BRIDGES, BUSH_TILES, ENTANGLED_PAIR, ISLANDS, MAP_HEIGHT_TILES, MAP_STOPS, MAP_WIDTH_TILES, PEACH_CASTLE_TILE,
    PIPE_TILES,
    QKD_LINK, QUANTUM_DECOR, QUBIT_BIRDS, TELECOM_TOWER_TILE_XS, TILE_SIZE_PX, isOnLand, listPathSegments,
} from "./world_map.js";
import { createElement } from "../page_helpers.js";
import {
    BLOCH_SPHERE_SPRITE, ELECTRIC_NESSIE_SPRITE, INFINITE_WELL_SPRITE, ION_TRAP_SPRITE, MARIO_SPRITE,
    MARIO_STRIDE_SPRITE, MUSHROOM_HUT_SPRITE, NV_CENTER_SPRITE, PEACH_CASTLE_SPRITE, PEACH_SPRITE,
    QUBIT_BIRD_DOWN_SPRITE, QUBIT_BIRD_UP_SPRITE, SCHRODINGER_CAT_SPRITE,
    TELECOM_TOWER_CROSSARM_ROW, TELECOM_TOWER_SPRITE, drawSprite,
} from "../pixel_sprites.js";

// Sprite pixel sizes chosen so each sprite fills about one 64 px tile.
const MAP_PLUMBER_PIXEL_SIZE = 3;
const HUT_PIXEL_SIZE = 3;
const CASTLE_PIXEL_SIZE = 4;
const PEACH_PIXEL_SIZE = 2;
const TOWER_PIXEL_SIZE = 4;
// How thick the sandy path is, in screen pixels.
const PATH_THICKNESS_PX = 14;
// A tower's feet stand this far below its tile's centre, on a small islet drawn there.
const TOWER_FEET_BELOW_CENTRE_PX = 24;
const FIBER_THICKNESS_PX = 4;
const BLOCH_PIXEL_SIZE = 4;
const BIRD_PIXEL_SIZE = 4;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
// How far below the two spheres the entanglement arc dips, in map pixels.
const ENTANGLEMENT_DIP_PX = 140;

// Each kind of quantum scenery: its sprite and how many screen pixels per sprite pixel.
const DECOR_LOOKS = {
    "ion-trap": { sprite: ION_TRAP_SPRITE, pixelSize: 4 },
    "infinite-well": { sprite: INFINITE_WELL_SPRITE, pixelSize: 4 },
    "nv-center": { sprite: NV_CENTER_SPRITE, pixelSize: 5 },
    "schrodinger-cat": { sprite: SCHRODINGER_CAT_SPRITE, pixelSize: 3 },
    "electric-nessie": { sprite: ELECTRIC_NESSIE_SPRITE, pixelSize: 9 },
};


/**
 * Draw everything on the map canvas.
 *
 * @param {HTMLElement} canvasElement - the empty #world-map element.
 * @returns {{stopElements: HTMLElement[], marioElement: HTMLElement}}
 */
export function buildWorldMap(canvasElement) {
    canvasElement.style.width = `${MAP_WIDTH_TILES * TILE_SIZE_PX}px`;
    canvasElement.style.height = `${MAP_HEIGHT_TILES * TILE_SIZE_PX}px`;
    buildScenery(canvasElement);
    const stopElements = [];
    for (const stop of MAP_STOPS) {
        const stopElement = buildStop(stop);
        canvasElement.append(stopElement);
        stopElements.push(stopElement);
    }
    const marioElement = buildMapMario();
    canvasElement.append(marioElement);
    return { stopElements, marioElement };
}


/**
 * Lay down everything on the map that never moves or gets clicked: islands, bushes, pipes, path, bridges and decor.
 */
function buildScenery(canvasElement) {
    for (const island of ISLANDS) {
        const islandElement = createElement("div", "map-island");
        placeBox(islandElement, island.tileX, island.tileY, island.widthTiles, island.heightTiles);
        canvasElement.append(islandElement);
    }
    for (const bushTile of BUSH_TILES) {
        canvasElement.append(placeOnTile(createElement("div", "map-bush"), bushTile.tileX, bushTile.tileY));
    }
    for (const pipeTile of PIPE_TILES) {
        canvasElement.append(placeOnTile(createElement("div", "map-pipe"), pipeTile.tileX, pipeTile.tileY));
    }
    for (const segment of listPathSegments()) {
        canvasElement.append(buildPathSegment(segment));
    }
    for (const bridge of BRIDGES) {
        canvasElement.append(buildBridge(bridge));
    }
    buildPeachEnd(canvasElement);
    buildQuantumDecor(canvasElement);
    buildEntangledPair(canvasElement);
    buildQubitBirds(canvasElement);
}


/**
 * Map Mario: a standing frame and a stride frame. The CSS swaps them while he walks and mirrors him to face left.
 */
function buildMapMario() {
    const marioElement = createElement("div", "map-mario");
    marioElement.append(drawSprite(MARIO_SPRITE, MAP_PLUMBER_PIXEL_SIZE, "map-mario-standing"));
    marioElement.append(drawSprite(MARIO_STRIDE_SPRITE, MAP_PLUMBER_PIXEL_SIZE, "map-mario-stride"));
    return marioElement;
}


/**
 * Position an element over a block of whole tiles.
 */
function placeBox(element, tileX, tileY, widthTiles, heightTiles) {
    element.style.left = `${tileX * TILE_SIZE_PX}px`;
    element.style.top = `${tileY * TILE_SIZE_PX}px`;
    element.style.width = `${widthTiles * TILE_SIZE_PX}px`;
    element.style.height = `${heightTiles * TILE_SIZE_PX}px`;
}


/**
 * Centre an element on one tile (the CSS translates it by -50% on both axes).
 *
 * @returns {Element} the same element, for appending.
 */
export function placeOnTile(element, tileX, tileY) {
    element.style.left = `${(tileX + 0.5) * TILE_SIZE_PX}px`;
    element.style.top = `${(tileY + 0.5) * TILE_SIZE_PX}px`;
    return element;
}


/**
 * One straight sandy strip from the centre of one tile to the centre of another.
 */
function buildPathSegment(segment) {
    const pathElement = createElement("div", "map-path");
    const leftTileX = Math.min(segment.fromTileX, segment.toTileX);
    const topTileY = Math.min(segment.fromTileY, segment.toTileY);
    const spanX = Math.abs(segment.toTileX - segment.fromTileX) * TILE_SIZE_PX;
    const spanY = Math.abs(segment.toTileY - segment.fromTileY) * TILE_SIZE_PX;
    const halfThickness = PATH_THICKNESS_PX / 2;
    pathElement.style.left = `${(leftTileX + 0.5) * TILE_SIZE_PX - halfThickness}px`;
    pathElement.style.top = `${(topTileY + 0.5) * TILE_SIZE_PX - halfThickness}px`;
    pathElement.style.width = `${spanX + PATH_THICKNESS_PX}px`;
    pathElement.style.height = `${spanY + PATH_THICKNESS_PX}px`;
    return pathElement;
}


/**
 * Wooden planks over the water on one row.
 */
function buildBridge(bridge) {
    const bridgeElement = createElement("div", "map-bridge");
    bridgeElement.style.left = `${bridge.fromTileX * TILE_SIZE_PX}px`;
    bridgeElement.style.top = `${(bridge.tileY + 0.5) * TILE_SIZE_PX}px`;
    bridgeElement.style.width = `${(bridge.toTileX - bridge.fromTileX) * TILE_SIZE_PX}px`;
    return bridgeElement;
}


/**
 * The far end of Level 3: telecom towers (on small islets out at sea), the QKD fiber strung between them, a sign,
 * Peach and her castle.
 */
function buildPeachEnd(canvasElement) {
    const centreY = (QKD_LINK.tileY + 0.5) * TILE_SIZE_PX;
    const feetY = centreY + TOWER_FEET_BELOW_CENTRE_PX;
    canvasElement.append(buildQkdFiber(feetY));
    for (const towerTileX of TELECOM_TOWER_TILE_XS) {
        if (!isOnLand(towerTileX, QKD_LINK.tileY)) {
            const isletElement = createElement("div", "map-islet");
            isletElement.style.left = `${(towerTileX + 0.5) * TILE_SIZE_PX}px`;
            isletElement.style.top = `${feetY}px`;
            canvasElement.append(isletElement);
        }
        const towerElement = drawSprite(TELECOM_TOWER_SPRITE, TOWER_PIXEL_SIZE, "map-tower");
        towerElement.style.left = `${(towerTileX + 0.5) * TILE_SIZE_PX}px`;
        towerElement.style.top = `${feetY}px`;
        canvasElement.append(towerElement);
    }
    const signElement = createElement("div", "map-sign");
    signElement.textContent = "QKD link to Peach's castle ▶";
    const signTileX = Math.round((QKD_LINK.fromTileX + QKD_LINK.toTileX) / 2);
    canvasElement.append(placeOnTile(signElement, signTileX, QKD_LINK.tileY + 1));

    const castleElement = drawSprite(PEACH_CASTLE_SPRITE, CASTLE_PIXEL_SIZE, "map-castle");
    canvasElement.append(placeOnTile(castleElement, PEACH_CASTLE_TILE.tileX, PEACH_CASTLE_TILE.tileY));
    const peachElement = drawSprite(PEACH_SPRITE, PEACH_PIXEL_SIZE, "map-peach");
    canvasElement.append(placeOnTile(peachElement, PEACH_CASTLE_TILE.tileX - 1, QKD_LINK.tileY));
}


/**
 * The fiber from the tower on Level 3's island to the one on Peach's, at the height of the towers' crossarms. A photon
 * pulse runs along it (CSS) to show the key being shared.
 *
 * @param {number} feetY - where the towers' feet stand, in map pixels.
 */
function buildQkdFiber(feetY) {
    const towerHeightRows = TELECOM_TOWER_SPRITE.rows.length;
    const crossarmAboveFeetPx = (towerHeightRows - TELECOM_TOWER_CROSSARM_ROW - 0.5) * TOWER_PIXEL_SIZE;
    const fiberElement = createElement("div", "map-fiber");
    fiberElement.style.left = `${(QKD_LINK.fromTileX + 0.5) * TILE_SIZE_PX}px`;
    fiberElement.style.top = `${feetY - crossarmAboveFeetPx - FIBER_THICKNESS_PX / 2}px`;
    fiberElement.style.width = `${(QKD_LINK.toTileX - QKD_LINK.fromTileX) * TILE_SIZE_PX}px`;
    fiberElement.style.height = `${FIBER_THICKNESS_PX}px`;
    fiberElement.append(createElement("span", "map-photon"));
    return fiberElement;
}


/**
 * The quantum scenery from QUANTUM_DECOR, each with its name on a sign below when it has one.
 */
function buildQuantumDecor(canvasElement) {
    for (const decor of QUANTUM_DECOR) {
        const look = DECOR_LOOKS[decor.kind];
        const decorElement = drawSprite(look.sprite, look.pixelSize, "map-decor");
        decorElement.classList.add(`is-${decor.kind}`);
        canvasElement.append(placeOnTile(decorElement, decor.tileX, decor.tileY));
        if (decor.sign !== undefined) {
            const signElement = createElement("div", "map-sign");
            signElement.textContent = decor.sign;
            canvasElement.append(placeOnTile(signElement, decor.tileX, decor.tileY + 1));
        }
    }
}


/**
 * The qubit birds from QUBIT_BIRDS. CSS flies each one across the map and flaps its wings; this sets the height,
 * speed and start, and how far it flies (the map's width).
 */
function buildQubitBirds(canvasElement) {
    for (const bird of QUBIT_BIRDS) {
        const birdElement = createElement("div", "map-bird");
        birdElement.classList.toggle("is-flying-left", bird.isFlyingLeft);
        birdElement.style.top = `${bird.tileY * TILE_SIZE_PX}px`;
        birdElement.style.setProperty("--fly-distance", `${MAP_WIDTH_TILES * TILE_SIZE_PX}px`);
        birdElement.style.animationDuration = `${bird.flySeconds}s`;
        birdElement.style.animationDelay = `${bird.delaySeconds}s`;
        birdElement.append(drawSprite(QUBIT_BIRD_UP_SPRITE, BIRD_PIXEL_SIZE, "map-bird-wings-up"));
        birdElement.append(drawSprite(QUBIT_BIRD_DOWN_SPRITE, BIRD_PIXEL_SIZE, "map-bird-wings-down"));
        canvasElement.append(birdElement);
    }
}


/**
 * Two Bloch spheres with opposite spins on neighbouring islands, joined by a dashed arc under the sea between.
 */
function buildEntangledPair(canvasElement) {
    const { firstTile, secondTile } = ENTANGLED_PAIR;
    canvasElement.append(buildEntanglementArc(firstTile, secondTile));
    const firstSphere = drawSprite(BLOCH_SPHERE_SPRITE, BLOCH_PIXEL_SIZE, "map-bloch");
    canvasElement.append(placeOnTile(firstSphere, firstTile.tileX, firstTile.tileY));
    const secondSphere = drawSprite(BLOCH_SPHERE_SPRITE, BLOCH_PIXEL_SIZE, "map-bloch");
    secondSphere.classList.add("is-spin-down");
    canvasElement.append(placeOnTile(secondSphere, secondTile.tileX, secondTile.tileY));
}


/**
 * A dashed curve from one tile's centre to another's, dipping down between them. Drawn twice: a black outline
 * under a pink dash, so it shows on both sea and grass.
 */
function buildEntanglementArc(fromTile, toTile) {
    const fromX = (fromTile.tileX + 0.5) * TILE_SIZE_PX;
    const fromY = (fromTile.tileY + 0.5) * TILE_SIZE_PX;
    const toX = (toTile.tileX + 0.5) * TILE_SIZE_PX;
    const toY = (toTile.tileY + 0.5) * TILE_SIZE_PX;
    const controlX = (fromX + toX) / 2;
    const controlY = Math.max(fromY, toY) + ENTANGLEMENT_DIP_PX;
    const pathData = `M ${fromX} ${fromY} Q ${controlX} ${controlY} ${toX} ${toY}`;

    const svgElement = document.createElementNS(SVG_NAMESPACE, "svg");
    svgElement.setAttribute("class", "map-entanglement");
    svgElement.setAttribute("width", String(MAP_WIDTH_TILES * TILE_SIZE_PX));
    svgElement.setAttribute("height", String(MAP_HEIGHT_TILES * TILE_SIZE_PX));
    svgElement.setAttribute("aria-hidden", "true");
    for (const className of ["is-outline", "is-dash"]) {
        const pathElement = document.createElementNS(SVG_NAMESPACE, "path");
        pathElement.setAttribute("d", pathData);
        pathElement.setAttribute("class", className);
        svgElement.append(pathElement);
    }
    return svgElement;
}


/**
 * A stop Mario can stand on: the START square, a numbered level panel, or Toad's mushroom hut.
 */
function buildStop(stop) {
    const stopElement = createElement("button", `map-stop is-${stop.kind}`);
    stopElement.type = "button";
    stopElement.setAttribute("aria-label", stop.title);
    if (stop.kind === "hut") {
        stopElement.append(drawSprite(MUSHROOM_HUT_SPRITE, HUT_PIXEL_SIZE, "map-hut"));
    } else {
        stopElement.textContent = stop.label;
    }
    return placeOnTile(stopElement, stop.tileX, stop.tileY);
}
