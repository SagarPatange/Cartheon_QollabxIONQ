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
