/**
 * Why these decisions: the rule the run follows, then one column per outcome (accepted, still held, declined,
 * expired) with its total and the reasons behind it, each with a bar for its share of that outcome. Counts are as of
 * the replay's clock (src/decision_reasons.js).
 */

import { summarizeDecisions } from "./decision_reasons.js";

const PERCENT = 100;

export class WhyView {
    constructor(documentRoot) {
        this.rule = documentRoot.getElementById("why-rule");
        this.note = documentRoot.getElementById("why-note");
        this.groups = documentRoot.getElementById("why-groups");
    }

    update(replay, minute) {
        // A server started before the rule was added sends none; say so instead of breaking the whole replay.
        if (replay.rule === undefined) {
            this.rule.textContent = "The server is running older code: restart it (npm run serve) to see the rule.";
        } else {
            this.rule.textContent = `${replay.rule.label}: ${replay.rule.description}`;
        }
        const outcomes = summarizeDecisions(replay.events, minute);
        let decidedCount = 0;
        for (const outcome of outcomes) {
            decidedCount += outcome.total;
        }
        this.note.textContent = `${decidedCount} loads decided so far, each counted once by its latest decision`;
        const columns = [];
        for (const outcome of outcomes) {
            columns.push(buildOutcomeColumn(outcome));
        }
        this.groups.replaceChildren(...columns);
    }
}

function buildOutcomeColumn(outcome) {
    const column = document.createElement("div");
    column.className = `why-group why-group-${outcome.kind}`;
    const header = document.createElement("div");
    header.className = "why-group-header";
    const title = document.createElement("h3");
    title.textContent = outcome.title;
    const total = document.createElement("span");
    total.className = "why-total";
    total.textContent = String(outcome.total);
    header.append(title, total);

    const list = document.createElement("ul");
    list.className = "why-reasons";
    for (const entry of outcome.reasons) {
        list.append(buildReasonItem(entry, outcome.total));
    }
    column.append(header, list);
    return column;
}

function buildReasonItem(entry, outcomeTotal) {
    const item = document.createElement("li");
    const text = document.createElement("span");
    text.className = "why-reason-text";
    text.textContent = entry.reason;
    const count = document.createElement("span");
    count.className = "why-reason-count";
    count.textContent = String(entry.count);
    const bar = document.createElement("span");
    bar.className = "why-bar";
    bar.style.setProperty("--share", `${(entry.count / outcomeTotal) * PERCENT}%`);
    item.append(text, count, bar);
    return item;
}
