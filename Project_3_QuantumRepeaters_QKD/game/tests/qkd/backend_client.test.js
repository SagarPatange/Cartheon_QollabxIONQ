/**
 * Tests for the pure parts of src/qkd/backend_client.js: the request body and error messages.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSendRequest, describeError } from "../../src/qkd/backend_client.js";
import { ENCRYPTED, MARIO, MAX_MESSAGE_BYTES } from "../../src/qkd/qkd_constants.js";

const ACTION = { sender: MARIO, kind: ENCRYPTED };
const SETTINGS = { seed: 7, physicalError: 0.001, areTurtlesOn: true, tapFraction: 0.5 };


test("the request body uses the backend's snake_case field names", () => {
    assert.deepEqual(buildSendRequest(ACTION, "hi", SETTINGS), {
        sender: MARIO,
        kind: ENCRYPTED,
        text: "hi",
        seed: 7,
        physical_error: 0.001,
        turtles_on: true,
        tap_fraction: 0.5,
    });
});


test("an empty message or one over the byte limit fails before any request", () => {
    assert.throws(() => buildSendRequest(ACTION, "", SETTINGS), /Type a message/);
    // "★" is 3 UTF-8 bytes, so 9 of them are 27 bytes although only 9 characters.
    assert.throws(() => buildSendRequest(ACTION, "★".repeat(9), SETTINGS), new RegExp(`${MAX_MESSAGE_BYTES}`));
});


test("error details read as text whether FastAPI sent a string or a list", () => {
    assert.equal(describeError({ detail: "too long" }), "too long");
    assert.equal(describeError({ detail: [{ msg: "bad sender" }, { msg: "bad kind" }] }), "bad sender; bad kind");
});
