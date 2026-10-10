/**
 * Going back over Level 2's lesson notes: B shows the note before, Space or Enter the one after, until the player is
 * back where they were. Reviewing only re-reads notes; the game waits and nothing else changes.
 *
 * The history holds every note shown so far, oldest first. While a lesson is open its own note is the last entry,
 * so review covers the ones before it; with no lesson open, review starts at the latest note (the one a stray Space
 * put away). Pure functions with no DOM, so they can be tested in node.
 */

/** The last history index review may show: the note before the open lesson, or the latest note. */
function lastReviewableIndex(historyLength, isLessonOpen) {
    return isLessonOpen ? historyLength - 2 : historyLength - 1;
}

/** How many earlier notes review can show right now. */
export function countReviewable(historyLength, isLessonOpen) {
    return Math.max(0, lastReviewableIndex(historyLength, isLessonOpen) + 1);
}

/** The index B opens review at, or null when there is nothing earlier to show. */
export function startReview(historyLength, isLessonOpen) {
    const lastIndex = lastReviewableIndex(historyLength, isLessonOpen);
    return lastIndex >= 0 ? lastIndex : null;
}

/**
 * The index after one step back (−1) or forward (+1); null means review is over and the player is back where they
 * were. Stepping back from the first note stays on it.
 */
export function stepReview(index, direction, historyLength, isLessonOpen) {
    const nextIndex = index + direction;
    if (nextIndex < 0) {
        return 0;
    }
    if (nextIndex > lastReviewableIndex(historyLength, isLessonOpen)) {
        return null;
    }
    return nextIndex;
}
