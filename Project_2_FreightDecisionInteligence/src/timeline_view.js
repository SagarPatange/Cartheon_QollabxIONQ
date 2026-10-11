/**
 * The event timeline under the map: what happened up to the current simulated minute, newest first, with the
 * dispatcher's reason for every decision. Filters show all events, decisions only, or truck moves only.
 */

import { formatDay, simulationClock } from "./format.js";
import { visibleEvents } from "./run_metrics.js";

const MAX_ROWS = 300;
const FILTERS = {
    all: null,
    decisions: new Set(["accept", "decline", "hold", "expire"]),
    moves: new Set(["depart_empty", "arrive_pickup", "depart_loaded", "deliver", "truck_free"]),
    tenders: new Set(["tender"]),
};
const KIND_LABELS = {
    tender: "Tender",
    accept: "Accept",
    decline: "Decline",
    hold: "Hold",
    expire: "Expire",
    depart_empty: "Empty move",
    arrive_pickup: "At pickup",
    depart_loaded: "Loaded",
    deliver: "Delivered",
    truck_free: "Truck free",
};

export class TimelineView {
    constructor(documentRoot) {
        this.list = documentRoot.getElementById("timeline-list");
        this.countText = documentRoot.getElementById("timeline-count");
        this.filterName = "decisions";
        this.lastShownCount = -1;
        for (const button of documentRoot.querySelectorAll("[data-filter]")) {
            button.addEventListener("click", () => {
                this.filterName = button.dataset.filter;
                for (const other of documentRoot.querySelectorAll("[data-filter]")) {
                    other.setAttribute("aria-pressed", String(other === button));
                }
                this.lastShownCount = -1;
                this.onFilterChange?.();
            });
        }
    }

    /** Re-render only when the number of visible events changes, so playback stays smooth. */
    update(replay, minute) {
        const events = visibleEvents(replay.events, minute, FILTERS[this.filterName]);
        if (events.length === this.lastShownCount) {
            return;
        }
        this.lastShownCount = events.length;
        this.countText.textContent = `${events.length.toLocaleString("en-US")} events so far`;
        const rows = events.slice(0, MAX_ROWS).map((event) => makeRow(replay.start_date, event));
        this.list.replaceChildren(...rows);
    }
}

function makeRow(startDate, event) {
    const row = document.createElement("li");
    row.className = `event event-${event.kind}`;
    const clock = simulationClock(Math.max(0, event.minute));
    const when = document.createElement("time");
    when.textContent = event.minute < 0 ? "before start" : `${formatDay(startDate, clock.dayIndex).slice(0, 10)} ${clock.time}`;
    const kind = document.createElement("span");
    kind.className = "event-kind";
    kind.textContent = KIND_LABELS[event.kind] ?? event.kind;
    const text = document.createElement("span");
    text.className = "event-text";
    text.textContent = event.text;
    const ids = document.createElement("span");
    ids.className = "event-ids";
    ids.textContent = [event.load_id, event.truck_id].filter(Boolean).join(" · ");
    row.append(when, kind, text, ids);
    return row;
}
