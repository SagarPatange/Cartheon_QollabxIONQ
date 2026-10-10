import assert from "node:assert/strict";
import test from "node:test";

import { generalReason, summarizeDecisions } from "../../src/decision_reasons.js";

// Real sentences from the policies (freight_sim/policies/greedy.py and milp.py).
const SENTENCES = {
    greedyAccept: "Accepted: TRK00012 is the nearest free reefer (in Dallas, 0 empty mi)",
    optimizerAccept: "Accepted: optimizer assigned TRK00089 (in New York, 93 empty mi, $27 margin)",
    noTruck: "Held: no free dry van can reach Houston in time",
    losesMoney: "Held: every free dry van that can reach Dallas in time would lose money",
    tooFar: "Held: every free reefer that can reach Miami in time would drive too far empty for what it pays",
    outbid: "Held: the optimizer gave every truck that can reach Dallas to a better load",
    pastGrace: "Declined: pickup was 3.0 h ago, past the 2 h grace",
    expired: "Expired: not accepted within 24 h of its pickup appointment",
};

test("every policy sentence maps to a short general reason", () => {
    assert.equal(generalReason(SENTENCES.greedyAccept), "Nearest free truck with the right trailer");
    assert.equal(generalReason(SENTENCES.optimizerAccept), "Part of the best assignment for the objective");
    assert.equal(generalReason(SENTENCES.noTruck), "No free truck with the right trailer can get there in time");
    assert.equal(generalReason(SENTENCES.losesMoney), "Every truck in reach would lose money");
    assert.equal(generalReason(SENTENCES.tooFar), "Every truck in reach would drive too far empty for what it pays");
    assert.equal(generalReason(SENTENCES.outbid), "Its trucks went to loads worth more");
    assert.equal(generalReason(SENTENCES.pastGrace), "Pickup already more than 2 h ago");
    assert.equal(generalReason(SENTENCES.expired), "Not taken within 24 h of its pickup");
    assert.equal(generalReason("Held: something new"), "Held: something new");
});

test("each load counts once, by its latest decision so far", () => {
    const events = [
        { minute: 540, kind: "tender", load_id: "A", text: "Tendered" },
        { minute: 540, kind: "hold", load_id: "A", text: SENTENCES.noTruck },
        { minute: 600, kind: "accept", load_id: "A", text: SENTENCES.optimizerAccept },
        { minute: 540, kind: "hold", load_id: "B", text: SENTENCES.losesMoney },
        { minute: 540, kind: "decline", load_id: "C", text: SENTENCES.pastGrace },
    ];
    assert.deepEqual(summarizeDecisions(events, 570), [
        { kind: "hold", title: "Still held", total: 2, reasons: [
            { reason: "No free truck with the right trailer can get there in time", count: 1 },
            { reason: "Every truck in reach would lose money", count: 1 },
        ] },
        { kind: "decline", title: "Declined", total: 1, reasons: [
            { reason: "Pickup already more than 2 h ago", count: 1 },
        ] },
    ]);
    const later = summarizeDecisions(events, 600);
    assert.equal(later[0].title, "Accepted");
    assert.equal(later[0].total, 1);
    assert.equal(later[1].total, 1);
});

test("reasons within an outcome are listed most common first", () => {
    const events = [
        { minute: 1, kind: "hold", load_id: "A", text: SENTENCES.outbid },
        { minute: 1, kind: "hold", load_id: "B", text: SENTENCES.noTruck },
        { minute: 1, kind: "hold", load_id: "C", text: SENTENCES.noTruck },
    ];
    const reasons = summarizeDecisions(events, 1)[0].reasons;
    assert.deepEqual(reasons.map((entry) => entry.count), [2, 1]);
});
