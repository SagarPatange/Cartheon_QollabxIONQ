/**
 * Talk to the Python simulator: build the POST /api/send body and return the parsed response.
 *
 * The page must be served by the backend (npm run backend) for the relative API path to work.
 */

import { MAX_MESSAGE_BYTES, SEND_API_PATH } from "./qkd_constants.js";


/**
 * The request body for one message. Fails fast on an empty or over-long message, before any network call.
 *
 * @param {{sender: string, kind: string}} action - who sends and how.
 * @param {string} text - the message.
 * @param {{seed: number, physicalError: number, areTurtlesOn: boolean, tapFraction: number}} settings
 * @returns {object} snake_case fields, as the backend's SendRequest expects.
 */
export function buildSendRequest(action, text, settings) {
    const byteCount = new TextEncoder().encode(text).length;
    if (byteCount === 0) {
        throw new Error("Type a message first.");
    }
    if (byteCount > MAX_MESSAGE_BYTES) {
        throw new Error(`The message is ${byteCount} bytes; the limit is ${MAX_MESSAGE_BYTES}.`);
    }
    return {
        sender: action.sender,
        kind: action.kind,
        text,
        seed: settings.seed,
        physical_error: settings.physicalError,
        turtles_on: settings.areTurtlesOn,
        tap_fraction: settings.tapFraction,
    };
}


/**
 * POST the request and return the backend's response. A non-2xx answer becomes an Error carrying its detail.
 *
 * @param {object} requestBody - from buildSendRequest.
 * @returns {Promise<object>} the SendResponse JSON.
 */
export async function sendMessage(requestBody) {
    const response = await fetch(SEND_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
    });
    const responseBody = await response.json();
    if (!response.ok) {
        throw new Error(`The simulator refused the message (${response.status}): ${describeError(responseBody)}`);
    }
    return responseBody;
}


/**
 * FastAPI puts a string in detail for our own errors and a list of field problems for validation errors.
 *
 * @param {{detail: string | {msg: string}[]}} errorBody
 * @returns {string}
 */
export function describeError(errorBody) {
    const detail = errorBody.detail;
    if (!Array.isArray(detail)) {
        return String(detail);
    }
    const problems = [];
    for (const problem of detail) {
        problems.push(problem.msg);
    }
    return problems.join("; ");
}
