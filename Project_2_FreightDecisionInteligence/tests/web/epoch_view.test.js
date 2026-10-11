import assert from "node:assert/strict";
import test from "node:test";

import { countKinds, epochIndexAt, orderDecisions } from "../../src/epoch_view.js";

const EPOCHS = [{ minute: 540 }, { minute: 600 }, { minute: 660 }];

test("the decision shown is the last one at or before the replay clock", () => {
    assert.equal(epochIndexAt(EPOCHS, 0), -1);
    assert.equal(epochIndexAt(EPOCHS, 540), 0);
    assert.equal(epochIndexAt(EPOCHS, 599), 0);
    assert.equal(epochIndexAt(EPOCHS, 600), 1);
    assert.equal(epochIndexAt(EPOCHS, 10_000), 2);
});

test("an epoch's decisions read accepted, then held, then declined, each by pickup time", () => {
    const decisions = [
        { load_id: "d", kind: "decline", pickup: 100 },
        { load_id: "h2", kind: "hold", pickup: 900 },
        { load_id: "a", kind: "accept", pickup: 500 },
        { load_id: "h1", kind: "hold", pickup: 300 },
    ];
    assert.deepEqual(orderDecisions(decisions).map((decision) => decision.load_id), ["a", "h1", "h2", "d"]);
    assert.deepEqual(countKinds(decisions), { accept: 1, hold: 2, decline: 1 });
});
