/**
 * Keep a row of controls on one line: when its natural width is wider than the room it has, shrink the whole row
 * with CSS zoom (text, pills and gaps together) instead of letting it wrap onto a second line.
 */

/** The zoom that makes `naturalWidthPx` fit in `availableWidthPx`: 1 when it already fits, never larger. */
export function fitZoom(availableWidthPx, naturalWidthPx) {
    if (naturalWidthPx <= 0 || naturalWidthPx <= availableWidthPx) {
        return 1;
    }
    return availableWidthPx / naturalWidthPx;
}

/** Zoom `rowElement` so it fits the content width of `containerElement` on one line. */
export function fitRowToContainer(rowElement, containerElement) {
    rowElement.style.zoom = "1";
    const containerStyle = getComputedStyle(containerElement);
    const paddingPx = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
    const availableWidthPx = containerElement.clientWidth - paddingPx;
    rowElement.style.zoom = String(fitZoom(availableWidthPx, rowElement.scrollWidth));
}
