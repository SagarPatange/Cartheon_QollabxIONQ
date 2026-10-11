/**
 * The replay clock: how far simulated time moves for a slice of real time.
 */

const MILLISECONDS_PER_SECOND = 1000;

/**
 * @param {{timeS: number, elapsedMs: number, speed: number, endS: number}} step - current simulated time, real
 *     milliseconds since the last frame, simulated seconds per real second, and the last time of the day.
 * @returns {{timeS: number, isFinished: boolean}}
 */
export function advanceTime({ timeS, elapsedMs, speed, endS }) {
    if (speed < 0) {
        throw new Error(`speed must be zero or more, got ${speed}`);
    }
    const nextTimeS = timeS + (elapsedMs / MILLISECONDS_PER_SECOND) * speed;
    if (nextTimeS >= endS) {
        return { timeS: endS, isFinished: true };
    }
    return { timeS: nextTimeS, isFinished: false };
}
