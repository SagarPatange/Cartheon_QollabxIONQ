/**
 * The side panel: date and time, the day's numbers, the busiest lanes today, and the three-year freight imbalance.
 */

import { formatDay } from "./dispatch_day.js";

const BUSIEST_LANE_LIMIT = 5;
const IMBALANCE_LIMIT = 3;

export class PanelView {
    constructor(documentRoot, cities, lanes) {
        this.lanes = lanes;
        this.dateText = documentRoot.getElementById("date");
        this.timeText = documentRoot.getElementById("time");
        this.loadsText = documentRoot.getElementById("stat-loads");
        this.revenueText = documentRoot.getElementById("stat-revenue");
        this.onRoadText = documentRoot.getElementById("stat-on-road");
        this.equipmentText = documentRoot.getElementById("stat-equipment");
        this.bookingText = documentRoot.getElementById("stat-booking");
        this.busiestList = documentRoot.getElementById("busiest-lanes");
        showImbalance(documentRoot.getElementById("senders"), documentRoot.getElementById("receivers"), cities);
    }

    update(year, dayOfYear, minuteOfDay, summary, busiestLanes, loadsOnRoadCount) {
        this.dateText.textContent = formatDay(year, dayOfYear);
        this.timeText.textContent = formatMinute(minuteOfDay);
        this.loadsText.textContent = String(summary.loads);
        this.revenueText.textContent = `$${summary.revenue.toLocaleString("en-US")}`;
        this.onRoadText.textContent = String(loadsOnRoadCount);
        this.equipmentText.textContent = `${summary.reefer} / ${summary.dryVan}`;
        this.bookingText.textContent = `${summary.spot} spot · ${summary.contract} contract · ${summary.dedicated} dedicated`;
        this.showBusiestLanes(busiestLanes.slice(0, BUSIEST_LANE_LIMIT));
    }

    showBusiestLanes(busiestLanes) {
        const rows = busiestLanes.map((entry) => {
            const lane = this.lanes[entry.lane];
            return makeRow(`${lane.origin.split(",")[0]} → ${lane.destination.split(",")[0]}`, `${entry.loads}`);
        });
        this.busiestList.replaceChildren(...rows);
    }
}

/** The cities that send the most more than they receive, and the reverse, over 2022–2024. */
function showImbalance(sendersList, receiversList, cities) {
    const byNetLoads = [...cities].sort((first, second) => netLoads(second) - netLoads(first));
    const senders = byNetLoads.slice(0, IMBALANCE_LIMIT);
    const receivers = byNetLoads.slice(-IMBALANCE_LIMIT).reverse();
    sendersList.replaceChildren(...senders.map((city) => makeRow(city.name, `+${netLoads(city).toLocaleString("en-US")}`)));
    receiversList.replaceChildren(...receivers.map((city) => makeRow(city.name, netLoads(city).toLocaleString("en-US"))));
}

function netLoads(city) {
    return city.outbound - city.inbound;
}

function makeRow(label, value) {
    const row = document.createElement("li");
    const labelText = document.createElement("span");
    labelText.textContent = label;
    const valueText = document.createElement("span");
    valueText.className = "row-value";
    valueText.textContent = value;
    row.append(labelText, valueText);
    return row;
}

function formatMinute(minuteOfDay) {
    const hours = Math.floor(minuteOfDay / 60);
    const minutes = Math.floor(minuteOfDay % 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
