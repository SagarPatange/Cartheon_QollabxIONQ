/**
 * The objectives side by side: the same week and seed under greedy and under the optimizer with each objective,
 * one row each (from /api/compare, freight_sim/replay.py). The best value in each column is marked, and so is the
 * run being replayed on the map.
 */

import { formatMoney } from "./format.js";

export const COMPARED_COLUMNS = [
    { key: "loads_accepted", label: "Loads covered", better: "higher", format: (value) => String(value) },
    { key: "loads_not_served", label: "Not served", better: "lower", format: (value) => String(value) },
    { key: "revenue", label: "Revenue", better: "higher", format: formatMoney },
    { key: "cost", label: "Cost", better: "lower", format: formatMoney },
    { key: "profit", label: "Profit", better: "higher", format: formatMoney },
    { key: "empty_mile_share", label: "Empty miles", better: "lower", format: formatPercent },
];

function formatPercent(fraction) {
    return `${(fraction * 100).toFixed(1)}%`;
}

/** For each column key, the best value among the runs (highest or lowest, as the column says). */
export function bestValues(runs, columns) {
    const best = {};
    for (const column of columns) {
        const values = runs.map((run) => run[column.key]);
        best[column.key] = column.better === "higher" ? Math.max(...values) : Math.min(...values);
    }
    return best;
}

export class CompareView {
    constructor(documentRoot) {
        this.table = documentRoot.getElementById("compare-table");
        this.note = documentRoot.getElementById("compare-note");
        this.buildHeader();
    }

    buildHeader() {
        const row = document.createElement("tr");
        for (const label of ["Run", ...COMPARED_COLUMNS.map((column) => column.label)]) {
            const cell = document.createElement("th");
            cell.scope = "col";
            cell.textContent = label;
            row.append(cell);
        }
        this.table.tHead.replaceChildren(row);
    }

    showLoading(weekText) {
        this.note.textContent = `Running every objective on ${weekText}…`;
        this.table.tBodies[0].replaceChildren();
    }

    showError(message) {
        this.note.textContent = `Could not compare: ${message}`;
    }

    /** One row per run; the best value in each column is bold, and the run on the map is marked. */
    show(comparison, currentPolicy, currentObjective, weekText) {
        const best = bestValues(comparison.runs, COMPARED_COLUMNS);
        const rows = [];
        for (const run of comparison.runs) {
            const isSamePolicy = run.policy === currentPolicy;
            const isSameObjective = run.policy === "greedy" || run.objective === currentObjective;
            rows.push(this.buildRow(run, best, isSamePolicy && isSameObjective));
        }
        this.table.tBodies[0].replaceChildren(...rows);
        const tendered = comparison.runs[0].loads_tendered;
        this.note.textContent = `${weekText}, seed ${comparison.seed}: the same ${tendered} tendered loads `
            + "for every run. Bold is the best in each column.";
    }

    buildRow(run, best, isCurrentRun) {
        const row = document.createElement("tr");
        row.classList.toggle("is-current", isCurrentRun);
        const nameCell = document.createElement("th");
        nameCell.scope = "row";
        nameCell.textContent = isCurrentRun ? `${run.label} (on the map)` : run.label;
        row.append(nameCell);
        for (const column of COMPARED_COLUMNS) {
            const cell = document.createElement("td");
            cell.textContent = column.format(run[column.key]);
            cell.classList.toggle("is-best", run[column.key] === best[column.key]);
            row.append(cell);
        }
        return row;
    }
}
