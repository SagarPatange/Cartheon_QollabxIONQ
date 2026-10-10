/**
 * The side panel: simulated date and time, the numbers being optimised so far this week, the fleet right now, and
 * profit day by day.
 */

import { formatDay, formatMoney, simulationClock } from "./format.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const CHART_WIDTH = 280;
const CHART_HEIGHT = 64;
const BAR_GAP = 6;

export class PanelView {
    constructor(documentRoot) {
        this.find = (id) => documentRoot.getElementById(id);
        this.dailyChart = this.find("daily-chart");
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
        this.colourDays(clock.dayIndex);
    }

    /** Seven bars of profit per day, drawn once per run; days not yet reached stay light. */
    showDays(replay) {
        this.dailyChart.replaceChildren();
        this.bars = [];
        const largestProfit = Math.max(1, ...replay.daily.map((day) => Math.abs(day.profit)));
        const barWidth = CHART_WIDTH / replay.daily.length - BAR_GAP;
        replay.daily.forEach((day, index) => {
            const barHeight = Math.max(1, (Math.abs(day.profit) / largestProfit) * (CHART_HEIGHT - 14));
            const bar = document.createElementNS(SVG_NAMESPACE, "rect");
            bar.setAttribute("x", String(index * (barWidth + BAR_GAP)));
            bar.setAttribute("y", String(CHART_HEIGHT - 14 - barHeight));
            bar.setAttribute("width", String(barWidth));
            bar.setAttribute("height", String(barHeight));
            const title = document.createElementNS(SVG_NAMESPACE, "title");
            title.textContent = `${formatDay(replay.start_date, index)}: profit ${formatMoney(day.profit)}`;
            bar.append(title);
            const label = document.createElementNS(SVG_NAMESPACE, "text");
            label.setAttribute("x", String(index * (barWidth + BAR_GAP) + barWidth / 2));
            label.setAttribute("y", String(CHART_HEIGHT - 2));
            label.setAttribute("text-anchor", "middle");
            label.textContent = formatDay(replay.start_date, index).slice(0, 3);
            this.dailyChart.append(bar, label);
            this.bars.push(bar);
        });
    }

    colourDays(currentDayIndex) {
        this.bars?.forEach((bar, index) => {
            bar.setAttribute("class", index <= currentDayIndex ? "day-bar day-bar-done" : "day-bar");
        });
    }
}

function formatPercent(fraction) {
    return `${(fraction * 100).toFixed(1)}%`;
}
