/**
 * The US dispatch map: OpenStreetMap streets in grey, the real road path of every lane (thicker for busier city
 * pairs), loads on the road as moving markers, and the 20 lane cities shaded from white (receives more than it
 * sends) to black (sends more than it receives).
 *
 * Lanes are not highlighted per day: with about 78 loads a day on 58 lanes, nearly every lane is used every day.
 */

import * as L from "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet-src.esm.js";

import { cityShade } from "./dispatch_day.js";
import { pathForLane, pointAlongPath } from "./route_paths.js";

const LEAFLET_CSS_URL = "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css";
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · routes: OSRM';

const LANE_STYLE = { color: "#9a9a9a", opacity: 0.7 };
// Cities whose label would cover a close neighbour's label get it on the left instead.
const LABEL_ON_LEFT = new Set(["Indianapolis"]);
const LANE_MIN_WEIGHT_PX = 0.75;
const LANE_MAX_EXTRA_WEIGHT_PX = 1;
const CITY_MIN_RADIUS_PX = 5;
const CITY_MAX_EXTRA_RADIUS_PX = 7;

export class UsMapView {
    constructor(container, cities, lanes, routePaths) {
        addLeafletStylesheet();
        this.map = L.map(container, { zoomSnap: 0.25, attributionControl: true });
        L.tileLayer(TILE_URL, { maxZoom: 12, attribution: ATTRIBUTION }).addTo(this.map);
        this.lanePaths = lanes.map((lane) => pathForLane(lane, routePaths));
        this.drawCityPairs(lanes, routePaths);
        this.transitLayer = L.layerGroup().addTo(this.map);
        this.drawCities(cities);
        const cityBounds = L.latLngBounds(cities.map((city) => [city.lat, city.lon]));
        // Extra room on the right, where city labels sit.
        this.map.fitBounds(cityBounds, { paddingTopLeft: [30, 30], paddingBottomRight: [110, 30] });
    }

    /** One line per pair of cities (both directions share a road), weighted by its loads over all three years. */
    drawCityPairs(lanes, routePaths) {
        const loadsPerPair = new Map();
        for (const lane of lanes) {
            const key = pairKey(lane.origin, lane.destination);
            loadsPerPair.set(key, (loadsPerPair.get(key) ?? 0) + lane.loads);
        }
        const busiestPairLoads = Math.max(...loadsPerPair.values());
        for (const route of routePaths) {
            const key = pairKey(route.cities[0], route.cities[1]);
            const weight = LANE_MIN_WEIGHT_PX + LANE_MAX_EXTRA_WEIGHT_PX * Math.sqrt(loadsPerPair.get(key) / busiestPairLoads);
            const line = L.polyline(route.points, { ...LANE_STYLE, weight }).addTo(this.map);
            line.bindTooltip(describePair(route, lanes), { sticky: true, className: "map-tooltip" });
        }
    }

    drawCities(cities) {
        const busiestCityLoads = Math.max(...cities.map((city) => city.outbound + city.inbound));
        for (const city of cities) {
            const totalLoads = city.outbound + city.inbound;
            const radius = CITY_MIN_RADIUS_PX + CITY_MAX_EXTRA_RADIUS_PX * Math.sqrt(totalLoads / busiestCityLoads);
            const marker = L.circleMarker([city.lat, city.lon], {
                radius,
                color: "#0a0a0a",
                weight: 1,
                fillColor: cityShade(city),
                fillOpacity: 1,
            }).addTo(this.map);
            const isLabelOnLeft = LABEL_ON_LEFT.has(city.name);
            marker.bindTooltip(city.name, {
                permanent: true,
                direction: isLabelOnLeft ? "left" : "right",
                offset: [isLabelOnLeft ? -radius : radius, 0],
                className: "city-label",
            });
            marker.bindPopup(
                `<strong>${city.name}, ${city.state}</strong><br>${city.outbound.toLocaleString("en-US")} loads out · ` +
                `${city.inbound.toLocaleString("en-US")} in (2022–2024)`,
            );
        }
    }

    /** Place a marker for every load on the road, at its share of the way along its lane's road path. */
    update(loadsOnRoad) {
        this.transitLayer.clearLayers();
        for (const load of loadsOnRoad) {
            const position = pointAlongPath(this.lanePaths[load.lane], load.progress);
            const isReefer = load.equipment === "R";
            L.circleMarker(position, {
                radius: 4,
                color: "#0a0a0a",
                weight: 1.5,
                fillColor: isReefer ? "#0a0a0a" : "#ffffff",
                fillOpacity: 1,
                interactive: false,
            }).addTo(this.transitLayer);
        }
    }
}

function pairKey(firstCity, secondCity) {
    return [firstCity, secondCity].sort().join(" | ");
}

/** "Columbus, OH ↔ Los Angeles, CA · 2,290 road miles" plus each direction's loads and rate. */
function describePair(route, lanes) {
    const lines = [`<strong>${route.cities[0]} ↔ ${route.cities[1]}</strong> · ${Math.round(route.road_miles).toLocaleString("en-US")} road mi`];
    for (const lane of lanes) {
        const isThisPair = pairKey(lane.origin, lane.destination) === pairKey(route.cities[0], route.cities[1]);
        if (isThisPair) {
            lines.push(
                `${lane.origin.split(",")[0]} → ${lane.destination.split(",")[0]}: ${lane.loads.toLocaleString("en-US")} loads, ` +
                `$${lane.rate_per_mile.toFixed(2)}/mi, ${lane.transit_days} d`,
            );
        }
    }
    return lines.join("<br>");
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
