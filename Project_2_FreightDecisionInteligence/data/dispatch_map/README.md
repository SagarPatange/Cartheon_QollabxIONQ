# Dispatch map data

Written by `tools/build_dispatch_map_data.py` from `data/kaggle_logistics/` (MIT) and the US Census Bureau 2023
Gazetteer of places (public domain: a work of the US government).

| File | Contents |
|---|---|
| `cities.json` | the 20 lane cities: Census internal point (lat, lon), loads sent (`outbound`) and received (`inbound`) in 2022–2024 |
| `lanes.json` | the 58 lanes in `routes.csv` order: origin, destination, miles, rate per mile, transit days, total loads |
| `loads_YYYY.json` | one row per load: day of year (0 = 1 Jan), lane index, scheduled pickup minute, scheduled pickup → delivery minutes, equipment (`R` reefer, `D` dry van), booking (`S` spot, `C` contract, `D` dedicated), revenue in whole dollars |

City coordinates come from the Census, not the Kaggle facilities table, because that table has no coordinates for
Seattle, Memphis, Columbus and Minneapolis.
