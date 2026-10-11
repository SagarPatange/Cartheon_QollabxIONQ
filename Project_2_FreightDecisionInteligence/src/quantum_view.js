/** Live three-method comparison, with selected assignments and honest scope. */
const names = {uniform: 'Classical random', one_bit_search: 'Classical one-bit search', qaoa: 'QAOA'};
function money(value) { return value == null ? 'No feasible sample' : new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(value); }
function add(parent, tag, text, className = '') {
    const element = document.createElement(tag); element.textContent = text;
    if (className) element.className = className;
    parent.append(element); return element;
}
export function showQuantum(result) {
    const {oracle, comparison} = result;
    document.getElementById('quantum-context').textContent = `Week ${oracle.source.week_start} · decision minute ${oracle.source.epoch_minute} · ${oracle.objective} objective · ${oracle.n_bits} assignment bits · ${oracle.entries.length} candidates · exact best score ${money(oracle.best_value)} (MILP agrees).`;
    const cards = document.getElementById('quantum-cards'); cards.replaceChildren();
    for (const [name, method] of Object.entries(comparison.methods)) {
        const card = add(cards, 'article', '', 'quantum-method');
        add(card, 'h3', names[name]);
        add(card, 'strong', `${(100 * method.score.optimal_hit_rate).toFixed(1)}% optimal hits`, 'quantum-hit');
        add(card, 'p', `${(100 * method.score.feasible_rate).toFixed(1)}% valid samples · ${method.score.shots} candidates`);
        add(card, 'p', `Best objective score: ${money(method.score.best_value)}`);
        add(card, 'p', `Gap to exact optimum: ${money(method.score.gap_to_optimum)}`);
        if (method.score.best_index != null) {
            const entry = oracle.entries[method.score.best_index];
            for (const [load, truck] of Object.entries(entry.assignment)) add(card, 'p', `${load} ← ${truck}`, 'assignment-line');
        }
    }
    document.getElementById('quantum-details').textContent = `Preparation: ${oracle.preparation_seconds.toFixed(2)} s; tuning: ${comparison.tuning.tuning_seconds.toFixed(2)} s (${comparison.tuning.evaluations} evaluations; converged: ${comparison.tuning.converged}); backend job: ${comparison.timing.backend_seconds.toFixed(2)} s. Depth 1, one restart, 40-evaluation cap, seed 2026. ${comparison.disclosure} The dataset is synthetic. This is one contested assignment within the selected week, not a QAOA policy running the whole fleet; exact enumeration already knows the answer.`;
    document.getElementById('quantum-status').textContent = 'Complete: results from this run.';
}
