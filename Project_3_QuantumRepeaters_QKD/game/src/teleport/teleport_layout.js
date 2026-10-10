/**
 * How big Level 2 (teleportation)'s scene is drawn. The sky (goal, banner, key hints, lesson note) sits above the
 * scene in normal flow, so the scene gets whatever height is left and is zoomed to fit it, shrinking below its
 * natural size when the window is short (page_helpers.fitTrackToWorld never shrinks, which would let the sky and
 * the scene overlap here).
 *
 * Pure function with no DOM, so it can be tested in node; teleport_main.js measures the page and applies it.
 */

// Below this the pixel font gets too small to read; the scene would rather scroll sideways.
export const MIN_TRACK_SCALE = 0.6;
// Above this the pixel art just gets blurry and the sky gets crowded out on big screens.
export const MAX_TRACK_SCALE = 1.6;

// The scene's natural height: in the tutorial the tallest thing over the towers is a tower's bit readout; in the HI
// challenge the word board rises higher, so the scene is taller (and drawn a little smaller).
export const TUTORIAL_TRACK_HEIGHT_PX = 280;
export const WORD_TRACK_HEIGHT_PX = 340;
// The scene's natural width: never narrower (the link needs room), and never wider, so on a wide window the two
// towers stay close together in the middle instead of drifting to the edges.
export const TRACK_MIN_WIDTH_PX = 940;
export const TRACK_MAX_WIDTH_PX = 1040;


/**
 * The zoom that fits the scene into the free space: as large as both the free height and the free width allow,
 * kept between MIN_TRACK_SCALE and MAX_TRACK_SCALE.
 *
 * @param {{freeHeightPx: number, freeWidthPx: number, trackHeightPx: number, trackMinWidthPx: number}} space - the
 *     room left for the scene, and the scene's natural height and smallest width.
 * @returns {number}
 */
export function computeTrackScale(space) {
    const isSizeKnown = space.trackHeightPx > 0 && space.trackMinWidthPx > 0;
    if (!isSizeKnown) {
        throw new Error("the track's natural size must be positive");
    }
    const heightScale = space.freeHeightPx / space.trackHeightPx;
    const widthScale = space.freeWidthPx / space.trackMinWidthPx;
    const fittingScale = Math.min(heightScale, widthScale);
    return Math.min(MAX_TRACK_SCALE, Math.max(MIN_TRACK_SCALE, fittingScale));
}


/**
 * The scene's natural width at a zoom: the free width it covers, kept between TRACK_MIN_WIDTH_PX and
 * TRACK_MAX_WIDTH_PX (the page centres it when it is narrower than the window).
 *
 * @param {number} freeWidthPx - the room for the scene on screen.
 * @param {number} scale - from computeTrackScale.
 * @returns {number}
 */
export function computeTrackWidth(freeWidthPx, scale) {
    const coveredWidthPx = freeWidthPx / scale;
    return Math.min(TRACK_MAX_WIDTH_PX, Math.max(TRACK_MIN_WIDTH_PX, coveredWidthPx));
}
