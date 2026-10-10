/**
 * Why the dispatcher decided what it did, summed up: every load decided so far, counted once by its latest decision
 * (accepted, still held, declined or expired) and grouped by the reason behind it. The reasons are the sentences the
 * policies write for the event timeline (freight_sim/policies/); each is matched to a short, general reason here.
 */

export const OUTCOMES = [
    { kind: "accept", title: "Accepted" },
    { kind: "hold", title: "Still held" },
    { kind: "decline", title: "Declined" },
    { kind: "expire", title: "Expired" },
];
const DECISION_KINDS = new Set(OUTCOMES.map((outcome) => outcome.kind));

// A policy's sentence → a general reason. The first pattern that matches wins; the order matters for holds.
const REASON_PATTERNS = [
    { pattern: /^Accepted: .* is the nearest free /, reason: "Nearest free truck with the right trailer" },
    { pattern: /^Accepted: optimizer assigned /, reason: "Part of the best assignment for the objective" },
    { pattern: /^Held: no free .* can reach .* in time$/,
        reason: "No free truck with the right trailer can get there in time" },
    { pattern: /^Held: the optimizer gave every truck that can reach .* to a better load$/,
        reason: "Its trucks went to loads worth more" },
    { pattern: /^Declined: pickup was .* past the 2 h grace$/, reason: "Pickup already more than 2 h ago" },
    { pattern: /^Expired: /, reason: "Not taken within 24 h of its pickup" },
];
// "Held: every free dry van that can reach Dallas in time would lose money"
//     → "Every truck in reach would lose money".
const REFUSED_HOLD_PATTERN = /^Held: every free .* that can reach .* in time (.+)$/;

/** The general reason for one decision sentence; unknown sentences are kept as they are. */
export function generalReason(text) {
    for (const { pattern, reason } of REASON_PATTERNS) {
        if (pattern.test(text)) {
            return reason;
        }
    }
    const refused = REFUSED_HOLD_PATTERN.exec(text);
    if (refused !== null) {
        return `Every truck in reach ${refused[1]}`;
    }
    return text;
}

/**
 * Loads decided by `minute`, by outcome and reason: [{kind, title, total, reasons: [{reason, count}]}], in the
 * order of OUTCOMES, each outcome's reasons most common first. Outcomes with no loads are left out.
 */
export function summarizeDecisions(events, minute) {
    const latestByLoad = new Map();
    for (const event of events) {
        if (event.minute > minute) {
            continue;
        }
        if (DECISION_KINDS.has(event.kind)) {
            latestByLoad.set(event.load_id, event);
        }
    }
    const countsByKind = new Map();
    for (const event of latestByLoad.values()) {
        if (!countsByKind.has(event.kind)) {
            countsByKind.set(event.kind, new Map());
        }
        const reasonCounts = countsByKind.get(event.kind);
        const reason = generalReason(event.text);
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
    const summary = [];
    for (const outcome of OUTCOMES) {
        const reasonCounts = countsByKind.get(outcome.kind);
        if (reasonCounts === undefined) {
            continue;
        }
        const reasons = [];
        for (const [reason, count] of reasonCounts) {
            reasons.push({ reason, count });
        }
        reasons.sort((first, second) => second.count - first.count);
        const total = reasons.reduce((sum, entry) => sum + entry.count, 0);
        summary.push({ kind: outcome.kind, title: outcome.title, total, reasons });
    }
    return summary;
}
