/**
 * The US dispatch map. Everything is black, white and grey except the trucks: OpenStreetMap streets in grey,
 * every lane as a thin grey line on its real road, cities from white (receives more freight than it sends) to
 * black (sends more). Trucks are purple arrows: solid when loaded, outlined when driving empty, light purple when
 * parked, grey when out of service.
 */

import * as L from "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet-src.esm.js";

import { pathForLane } from "./route_paths.js";
import { cityColor } from "./run_metrics.js";

const LEAFLET_CSS_URL = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · routes: OSRM';

const LANE_STYLE = { color: "#9a9a9a", opacity: 0.7, weight: 1, interactive: false };
const PURPLE = "#6d28d9";
// Fill and outline for each truck state.
const TRUCK_STYLES = {
    loaded: { fill: PURPLE, stroke: PURPLE },
    loading: { fill: PURPLE, stroke: PURPLE },
    unloading: { fill: PURPLE, stroke: PURPLE },
    empty: { fill: "#ffffff", stroke: PURPLE },
    parked: { fill: "#c4b5fd", stroke: "#7c3aed" },
    out_of_service: { fill: "#d4d4d4", stroke: "#737373" },
};
const DRIVING_ARROW_PX = 13;
const PARKED_ARROW_PX = 10;
// Trucks at a city sit on rings around it, so a busy city shows how many trucks are there.
const RING_FIRST_RADIUS_PX = 13;
const RING_STEP_PX = 7;
const TRUCKS_PER_RING = 12;
const CITY_RADIUS_PX = 7;
const LABEL_ON_LEFT = new Set(["Indianapolis"]);

export class UsMapView {
    constructor(container, cities, lanes, routePaths) {
        addLeafletStylesheet();
        this.map = L.map(container, { zoomSnap: 0.25 });
        L.tileLayer(TILE_URL, { maxZoom: 12, attribution: ATTRIBUTION }).addTo(this.map);
        for (const lane of uniqueCityPairs(lanes)) {
            L.polyline(pathForLane(lane, routePaths), LANE_STYLE).addTo(this.map);
        }
        this.drawCities(cities);
        this.truckMarkers = new Map();
        const cityBounds = L.latLngBounds(cities.map((city) => [city.lat, city.lon]));
        this.map.fitBounds(cityBounds, { paddingTopLeft: [30, 30], paddingBottomRight: [110, 30] });
    }

    drawCities(cities) {
        for (const city of cities) {
            const marker = L.circleMarker([city.lat, city.lon], {
                radius: CITY_RADIUS_PX,
                color: "#0a0a0a",
                weight: 1.5,
                fillColor: cityColor(city),
                fillOpacity: 1,
            }).addTo(this.map);
            const isLabelOnLeft = LABEL_ON_LEFT.has(city.name);
            marker.bindTooltip(city.name, {
                permanent: true,
                direction: isLabelOnLeft ? "left" : "right",
                offset: [isLabelOnLeft ? -CITY_RADIUS_PX - 14 : CITY_RADIUS_PX + 14, 0],
                className: "city-label",
            });
            marker.bindPopup(
                `<strong>${city.name}, ${city.state}</strong><br>${city.outbound.toLocaleString("en-US")} loads out · ` +
                `${city.inbound.toLocaleString("en-US")} in (2022–2024)`,
            );
        }
    }

    /** Move every truck marker to its position; trucks at the same city are spread on rings around it.
     * Out-of-service trucks are parked at their city in grey. */
    showTrucks(positions, outOfService, cityPoints) {
        const slotsTaken = new Map();
        const allTrucks = [...positions];
        for (const truck of outOfService) {
            const [lat, lon] = cityPoints[truck.city];
            allTrucks.push({ truckId: truck.id, phase: "out_of_service", lat, lon, bearing: 0 });
        }
        for (const position of allTrucks) {
            const isDriving = position.phase === "empty" || position.phase === "loaded";
            const key = `${position.lat.toFixed(3)},${position.lon.toFixed(3)}`;
            const slot = isDriving ? null : (slotsTaken.get(key) ?? 0);
            if (!isDriving) {
                slotsTaken.set(key, slot + 1);
            }
            const marker = this.markerFor(position.truckId);
            marker.setLatLng([position.lat, position.lon]);
            drawTruckIcon(marker.getElement(), position, isDriving, slot);
        }
    }

    markerFor(truckId) {
        if (!this.truckMarkers.has(truckId)) {
            const icon = L.divIcon({ className: "truck-icon", html: "<div></div>", iconSize: [0, 0] });
            const marker = L.marker([0, 0], { icon, interactive: false, keyboard: false }).addTo(this.map);
            this.truckMarkers.set(truckId, marker);
        }
        return this.truckMarkers.get(truckId);
    }

    clearTrucks() {
        for (const marker of this.truckMarkers.values()) {
            marker.remove();
        }
        this.truckMarkers.clear();
    }
}

/** Every truck is an arrow. A driving truck points where it goes; a truck at a city points north on that city's
 * ring. */
function drawTruckIcon(element, position, isDriving, slot) {
    const style = TRUCK_STYLES[position.phase];
    const holder = element.firstElementChild;
    const size = isDriving ? DRIVING_ARROW_PX : PARKED_ARROW_PX;
    let offsetX = 0;
    let offsetY = 0;
    if (!isDriving) {
        const ring = Math.floor(slot / TRUCKS_PER_RING);
        const angle = ((slot % TRUCKS_PER_RING) / TRUCKS_PER_RING) * 2 * Math.PI;
        const radius = RING_FIRST_RADIUS_PX + ring * RING_STEP_PX;
        offsetX = Math.cos(angle) * radius;
        offsetY = Math.sin(angle) * radius;
    }
    const translate = `translate(calc(-50% + ${offsetX.toFixed(1)}px), calc(-50% + ${offsetY.toFixed(1)}px))`;
    holder.style.transform = `${translate} rotate(${position.bearing.toFixed(0)}deg)`;
    holder.innerHTML =
        `<svg width="${size}" height="${size}" viewBox="0 0 18 18" aria-hidden="true">` +
        `<path d="M9 1.5 L15.5 16.5 L9 12.5 L2.5 16.5 Z" fill="${style.fill}" stroke="${style.stroke}" ` +
        `stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

/** One lane per pair of cities, whichever direction: both directions share the same road. */
function uniqueCityPairs(lanes) {
    const pairs = new Map();
    for (const lane of lanes) {
        const key = [lane.origin, lane.destination].sort().join(" | ");
        pairs.set(key, lane);
    }
    return [...pairs.values()];
}

function addLeafletStylesheet() {
    if (document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`) !== null) {
        return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS_URL;
    document.head.append(link);
}
