"""Road distances between the lane cities, and how long a truck takes to cover them.

Miles come from the OSRM table (data/osm_routes/city_matrix.json, © OpenStreetMap contributors). OSRM's times are
for cars, so truck time is miles at an average truck speed plus simplified hours-of-service rests.
"""

import json
import math
from pathlib import Path

AVERAGE_TRUCK_MPH = 50
# Simplified hours of service: at most 11 hours of driving, then a 10-hour rest.
MAX_DRIVING_HOURS_BEFORE_REST = 11
REST_HOURS = 10

CITY_MATRIX_PATH = Path("data/osm_routes/city_matrix.json")


def drive_and_rest_hours(driving_hours: float) -> float:
    """Driving time plus a rest after every full 11-hour block that is followed by more driving."""
    if driving_hours <= 0:
        return 0
    blocks_of_driving = math.ceil(driving_hours / MAX_DRIVING_HOURS_BEFORE_REST)
    rest_count = blocks_of_driving - 1
    return driving_hours + rest_count * REST_HOURS


class RoadNetwork:
    """Road miles and truck hours between any two lane cities."""

    def __init__(self, cities: list[str], road_miles: list[list[float]], average_mph: float = AVERAGE_TRUCK_MPH):
        self.index_of_city = {city: index for index, city in enumerate(cities)}
        self.road_miles = road_miles
        self.average_mph = average_mph

    def miles(self, from_city: str, to_city: str) -> float:
        """Road miles from one city to another (0 for the same city)."""
        return self.road_miles[self.index_of_city[from_city]][self.index_of_city[to_city]]

    def truck_hours(self, from_city: str, to_city: str) -> float:
        """Hours a truck needs for the trip, rests included."""
        driving_hours = self.miles(from_city, to_city) / self.average_mph
        return drive_and_rest_hours(driving_hours)


def load_road_network(path: Path = CITY_MATRIX_PATH) -> RoadNetwork:
    """The network from the OSRM city matrix file."""
    matrix = json.loads(path.read_text())
    return RoadNetwork(matrix["cities"], matrix["road_miles"])
