/** Self-contained geographic dispatch map: bundled OSRM paths and live truck positions, no tile server. */
import { pathForLane } from './route_paths.js';
import { cityColor } from './run_metrics.js';
const NS = 'http://www.w3.org/2000/svg';
function svg(name, attributes) {
    const element = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
}
function point(lat, lon) { return [45 + (lon + 125) * 16, 45 + (50 - lat) * 21]; }

export class UsMapView {
    constructor(container, cities, lanes, paths) {
        this.canvas = svg('svg', {viewBox: '0 0 1000 590', role: 'img',
            'aria-label': 'Geographic US freight lanes and moving trucks. Cities use Census coordinates; road paths use OSRM.'});
        this.canvas.style.cssText = 'width:100%;height:100%;background:#0c1018';
        container.replaceChildren(this.canvas);
        const label = svg('text', {x: 22, y: 26, fill: '#b8b8cf', 'font-size': 13});
        label.textContent = 'US FREIGHT NETWORK · geographic coordinates · road paths, no background tiles';
        this.canvas.append(label);
        const drawn = new Set();
        for (const lane of lanes) {
            const key = [lane.origin, lane.destination].sort().join('|');
            if (drawn.has(key)) continue;
            drawn.add(key);
            this.canvas.append(svg('polyline', {points: pathForLane(lane, paths).map(([lat, lon]) => point(lat, lon).join(',')).join(' '),
                fill: 'none', stroke: '#5c6271', 'stroke-width': 1.1}));
        }
        for (const city of cities) {
            const [x, y] = point(city.lat, city.lon);
            const group = svg('g', {});
            group.append(svg('circle', {cx: x, cy: y, r: 6, fill: cityColor(city), stroke: '#b7b7c6'}));
            const text = svg('text', {x: x + 9, y: y - 8, fill: '#eeeeff', 'font-size': 12});
            text.textContent = city.name;
            group.append(text);
            const title = svg('title', {});
            title.textContent = `${city.name}, ${city.state}: ${city.outbound} loads out, ${city.inbound} in (2022–2024)`;
            group.append(title);
            this.canvas.append(group);
        }
        this.trucks = svg('g', {});
        this.canvas.append(this.trucks);
        this.markers = new Map();
    }
    clearTrucks() { this.trucks.replaceChildren(); this.markers.clear(); }
    showTrucks(positions, outOfService, cityPoints) {
        const all = [...positions, ...outOfService.map(t => ({truckId: t.id, phase: 'out_of_service',
            lat: cityPoints[t.city][0], lon: cityPoints[t.city][1], bearing: 0}))];
        const slots = new Map();
        for (const p of all) {
            const [x, y] = point(p.lat, p.lon);
            const driving = ['loaded', 'empty'].includes(p.phase);
            const key = `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
            const slot = driving ? 0 : (slots.get(key) ?? 0);
            if (!driving) slots.set(key, slot + 1);
            const radius = driving ? 0 : 9 + Math.floor(slot / 10) * 5;
            const angle = slot * Math.PI / 5;
            let marker = this.markers.get(p.truckId);
            if (!marker) {
                marker = svg('path', {d: 'M0 -6 L4 5 L0 2 L-4 5 Z', 'stroke-width': 1});
                const title = svg('title', {}); marker.append(title);
                this.trucks.append(marker); this.markers.set(p.truckId, marker);
            }
            marker.setAttribute('transform', `translate(${x + radius * Math.cos(angle)} ${y + radius * Math.sin(angle)}) rotate(${p.bearing ?? 0})`);
            marker.setAttribute('stroke', p.phase === 'out_of_service' ? '#999' : '#b49aff');
            marker.setAttribute('fill', p.phase === 'empty' ? '#111' : p.phase === 'out_of_service' ? '#555' : p.phase === 'parked' ? '#67528e' : '#b49aff');
            marker.firstChild.textContent = `${p.truckId}: ${p.phase}`;
        }
    }
}
