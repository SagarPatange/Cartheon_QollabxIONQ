/**
 * The side panel: simulated date and time, the numbers being optimised so far this week, and the fleet right now.
 */

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
    }
}

function formatPercent(fraction) {
    return `${(fraction * 100).toFixed(1)}%`;
}
