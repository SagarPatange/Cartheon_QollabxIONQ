/**
 * Decision by decision: the dispatcher decides at set times (every hour of the working day). This view shows one of
 * those decision epochs: what the policy saw (open loads, free trucks), and for every load what it decided, why,
 * and which trucks it weighed, the chosen one marked. It follows the replay clock; ‹ and › step to the previous or
 * next decision and move the replay there. Data: replay.epochs (freight_sim/simulator.py, epoch_record).
 */

import { formatDay, formatMoney, simulationClock } from "./format.js";

const KIND_ORDER = { accept: 0, hold: 1, decline: 2 };
const KIND_LABELS = { accept: "Accept", hold: "Hold", decline: "Decline" };
const EQUIPMENT_NAMES = { R: "reefer", D: "dry van" };

/** The index of the last epoch at or before `minute`, or −1 before the first decision. */
export function epochIndexAt(epochs, minute) {
    let index = -1;
    for (let i = 0; i < epochs.length; i++) {
        if (epochs[i].minute > minute) {
            break;
        }
        index = i;
    }
    return index;
}

/** An epoch's decisions in reading order: accepted first, then held, then declined; each by pickup time. */
export function orderDecisions(decisions) {
    return [...decisions].sort((first, second) => {
        const byKind = KIND_ORDER[first.kind] - KIND_ORDER[second.kind];
        return byKind !== 0 ? byKind : first.pickup - second.pickup;
    });
}

/** Counts of each kind of decision in an epoch: {accept, hold, decline}. */
export function countKinds(decisions) {
    const counts = { accept: 0, hold: 0, decline: 0 };
    for (const decision of decisions) {
        counts[decision.kind] += 1;
    }
    return counts;
}

export class EpochView {
    constructor(documentRoot) {
        this.title = documentRoot.getElementById("epoch-title");
        this.summary = documentRoot.getElementById("epoch-summary");
        this.rows = documentRoot.getElementById("epoch-rows");
        this.previousButton = documentRoot.getElementById("epoch-prev");
        this.nextButton = documentRoot.getElementById("epoch-next");
        this.shownReplay = null;
        this.shownIndex = null;
        // Set by the page: move the replay to a minute (stepping to another decision).
        this.onStep = () => {};
        this.previousButton.addEventListener("click", () => this.step(-1));
        this.nextButton.addEventListener("click", () => this.step(1));
    }

    /** Show the decision in force at `minute`; rebuilds the table only when that decision changes. */
    update(replay, minute) {
        const index = epochIndexAt(replay.epochs, minute);
        if (replay === this.shownReplay && index === this.shownIndex) {
            return;
        }
        this.shownReplay = replay;
        this.shownIndex = index;
        this.previousButton.disabled = index <= 0;
        this.nextButton.disabled = index >= replay.epochs.length - 1;
        if (index === -1) {
            this.title.textContent = "Before the first decision";
            this.summary.textContent = "The dispatcher first decides at 09:00.";
            this.rows.replaceChildren();
            return;
        }
        const epoch = replay.epochs[index];
        this.title.textContent = describeEpochTime(replay, epoch.minute, index, replay.epochs.length);
        this.summary.textContent = describeEpoch(epoch);
        const rows = [];
        for (const decision of orderDecisions(epoch.decisions)) {
            rows.push(buildDecisionRow(replay, decision));
        }
        this.rows.replaceChildren(...rows);
    }

    step(direction) {
        const epochs = this.shownReplay?.epochs ?? [];
        const targetIndex = this.shownIndex + direction;
        if (targetIndex < 0 || targetIndex >= epochs.length) {
            return;
        }
        this.onStep(epochs[targetIndex].minute);
    }
}

function describeEpochTime(replay, minute, index, epochCount) {
    const clock = simulationClock(minute);
    return `${formatDay(replay.start_date, clock.dayIndex)} ${clock.time} · decision ${index + 1} of ${epochCount}`;
}

function describeEpoch(epoch) {
    const counts = countKinds(epoch.decisions);
    const solveText = epoch.decision_ms < 1 ? "under 1 ms" : `${Math.round(epoch.decision_ms)} ms`;
    return `Saw ${epoch.open_loads} open loads and ${epoch.free_trucks} free trucks · accepted ${counts.accept}, `
        + `held ${counts.hold}, declined ${counts.decline} · decided in ${solveText}`;
}

function buildDecisionRow(replay, decision) {
    const row = document.createElement("tr");
    row.className = `event-${decision.kind}`;
    row.append(buildLoadCell(replay, decision), buildKindCell(decision), buildReasonCell(decision),
        buildOptionsCell(decision));
    return row;
}

function buildLoadCell(replay, decision) {
    const cell = document.createElement("th");
    cell.scope = "row";
    const lane = document.createElement("span");
    lane.className = "epoch-lane";
    lane.textContent = `${decision.origin.split(",")[0]} → ${decision.destination.split(",")[0]}`;
    const facts = document.createElement("span");
    facts.className = "epoch-facts";
    const pickup = simulationClock(decision.pickup);
    const pickupDay = formatDay(replay.start_date, pickup.dayIndex).slice(0, 3);
    facts.textContent = `${formatMoney(decision.revenue)} · ${EQUIPMENT_NAMES[decision.equipment]} · `
        + `pickup ${pickupDay} ${pickup.time} · ${decision.load_id}`;
    cell.append(lane, facts);
    return cell;
}

function buildKindCell(decision) {
    const cell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "event-kind";
    badge.textContent = KIND_LABELS[decision.kind];
    cell.append(badge);
    return cell;
}

function buildReasonCell(decision) {
    const cell = document.createElement("td");
    cell.className = "epoch-reason";
    cell.textContent = decision.reason;
    return cell;
}

/** "3 in reach", then a chip per truck weighed: ID, city, empty miles, and margin and score for the optimizer. */
function buildOptionsCell(decision) {
    const cell = document.createElement("td");
    cell.className = "epoch-options";
    if (decision.reachable === null || decision.reachable === undefined) {
        cell.textContent = "—";
        return cell;
    }
    const reach = document.createElement("span");
    reach.className = "epoch-reach";
    reach.textContent = `${decision.reachable} in reach`;
    cell.append(reach);
    for (const option of decision.options) {
        cell.append(buildOptionChip(option));
    }
    return cell;
}

function buildOptionChip(option) {
    const chip = document.createElement("span");
    chip.className = option.chosen ? "epoch-option is-chosen" : "epoch-option";
    const parts = [option.truck_id, option.city.split(",")[0], `${Math.round(option.empty_miles)} empty mi`];
    if (option.margin !== undefined) {
        parts.push(`${formatMoney(option.margin)} margin`);
    }
    if (option.taken_by !== undefined) {
        parts.push(`went to ${option.taken_by}`);
    }
    chip.textContent = parts.join(" · ");
    if (option.score !== undefined) {
        chip.title = `Score under the objective: ${Math.round(option.score).toLocaleString("en-US")}`;
    }
    return chip;
}
