/**
 * How much to shrink a panel's picture so it fits the space left for it, so every panel fits the window without
 * scrolling. Pure; hut_pager.js measures the sizes and applies the scale (both of Toad's huts).
 */

// Below this the pictures' text is too small to read; a smaller window scrolls instead.
export const MIN_PICTURE_SCALE = 0.4;

/**
 * The scale that fits content of one size inside a box of another, keeping its shape. Never enlarges past 1, so
 * pixel art stays crisp; never returns 0 or less, so a hidden box doesn't make the picture vanish for good.
 *
 * @param {{widthPx: number, heightPx: number}} contentSize - the picture's natural size.
 * @param {{widthPx: number, heightPx: number}} boxSize - the room for it.
 * @returns {number} a scale between MIN_PICTURE_SCALE and 1.
 */
export function findPictureScale(contentSize, boxSize) {
    const isEmpty = contentSize.widthPx <= 0 || contentSize.heightPx <= 0;
    if (isEmpty) {
        return 1;
    }
    const widthScale = boxSize.widthPx / contentSize.widthPx;
    const heightScale = boxSize.heightPx / contentSize.heightPx;
    const scale = Math.min(1, widthScale, heightScale);
    return Math.max(scale, MIN_PICTURE_SCALE);
}
