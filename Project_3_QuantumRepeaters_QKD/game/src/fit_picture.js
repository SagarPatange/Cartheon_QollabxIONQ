/**
 * How much to shrink (or, for vector pictures, enlarge) a picture so it fits the space left for it, so a page fits the
 * window without scrolling. Pure; hut_pager.js (both of Toad's huts) and lesson_stage.js (Levels 3 and 4) measure the
 * sizes and apply the scale.
 */

// Below this the pictures' text is too small to read; a smaller window scrolls instead.
export const MIN_PICTURE_SCALE = 0.4;

/**
 * The scale that fits content of one size inside a box of another, keeping its shape. Never enlarges past maxScale
 * (1 by default, so pixel art stays crisp; vector pictures may pass more); never returns 0 or less, so a hidden box
 * doesn't make the picture vanish for good.
 *
 * @param {{widthPx: number, heightPx: number}} contentSize - the picture's natural size.
 * @param {{widthPx: number, heightPx: number}} boxSize - the room for it.
 * @param {number} [maxScale] - the most it may be enlarged, at least 1.
 * @returns {number} a scale between MIN_PICTURE_SCALE and maxScale.
 */
export function findPictureScale(contentSize, boxSize, maxScale = 1) {
    const isEmpty = contentSize.widthPx <= 0 || contentSize.heightPx <= 0;
    if (isEmpty) {
        return 1;
    }
    const widthScale = boxSize.widthPx / contentSize.widthPx;
    const heightScale = boxSize.heightPx / contentSize.heightPx;
    const scale = Math.min(maxScale, widthScale, heightScale);
    return Math.max(scale, MIN_PICTURE_SCALE);
}
