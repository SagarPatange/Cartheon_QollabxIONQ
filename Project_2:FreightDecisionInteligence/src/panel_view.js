/**
 * The side panel: simulated date and time, the numbers being optimised so far this week, the fleet right now, and
 * why the dispatcher made its decisions (the rule it follows, and every load so far by outcome and reason).
 */

import { summarizeDecisions } from "./decision_reasons.js";
import { formatDay, formatMoney, simulationClock } from "./format.js";

export class PanelView {
    constructor(documentRoot) {
        this.find = (id) => documentRoot.getElementById(id);
    }

    update(replay, minute, metrics, fleetCounts) {
        const clock = simulationClock(minute);
        this.find("date").textContent = formatDay(replay.start_date, Math.min(clock.dayIndex, replay.days - 1));
        this.find("time").textContent = clock.time;
        this.find("metric-profit").textContent = formatMoney(metrics.profit);
        this.find("metric-revenue").textContent = formatMoney(metrics.revenue);
        this.find("metric-cost").textContent = formatMoney(metrics.cost);
        this.find("metric-penalties").textContent = formatMoney(metrics.latePenalties);
        this.find("metric-accepted").textContent = `${metrics.accepted} (${formatPercent(metrics.acceptanceRate)})`;
        this.find("metric-declined").textContent = String(metrics.declined);
        this.find("metric-empty").textContent = formatPercent(metrics.emptyMileShare);
        this.find("metric-on-time").textContent = formatPercent(metrics.onTimeRate);
        this.find("fleet-loaded").textContent = String(fleetCounts.loaded);
        this.find("fleet-empty").textContent = String(fleetCounts.empty);
        this.find("fleet-parked").textContent = String(fleetCounts.parked);
        this.find("fleet-out").textContent = String(fleetCounts.outOfService);
        this.showReasons(replay, minute);
    }

    /** The run's rule, then each outcome with its total and the reasons behind it, most common first. */
    showReasons(replay, minute) {
        this.find("why-rule").textContent = `${replay.rule.label}: ${replay.rule.description}`;
        const rows = [];
        for (const outcome of summarizeDecisions(replay.events, minute)) {
            rows.push(buildReasonRow(outcome.title, outcome.total, "why-outcome"));
            for (const entry of outcome.reasons) {
                rows.push(buildReasonRow(entry.reason, entry.count, "why-reason"));
            }
        }
        if (rows.length === 0) {
            rows.push(buildReasonRow("No loads decided yet", "", "why-reason"));
        }
        this.find("why-rows").replaceChildren(...rows);
    }
}

function buildReasonRow(text, count, className) {
    const row = document.createElement("tr");
    row.className = className;
    const textCell = document.createElement("th");
    textCell.scope = "row";
    textCell.textContent = text;
    const countCell = document.createElement("td");
    countCell.textContent = String(count);
    row.append(textCell, countCell);
    return row;
}

function formatPercent(fraction) {
    return `${(fraction * 100).toFixed(1)}%`;
}
