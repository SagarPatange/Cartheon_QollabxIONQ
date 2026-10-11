# July 1, 2026 SPP offer data audit

Inspected October 10, 2026 using Python's CSV reader. All rows were parsed. Source CSVs were subsequently moved unchanged into this project's data folder at the user's request. These observations describe offers, not cleared quantities or realized prices.

## Operating-day coverage

Both files contain 24 distinct Central Prevailing Time hour-ending timestamps: July 1 at 01:00 through July 2 at 00:00. The final timestamp is the end of July 1's last operating hour. Corresponding GMT timestamps are July 1 at 06:00 through July 2 at 05:00.

## DA energy

Source: `data/DA-ENERGY-OFFERS-202607010100.csv`.

- 12,004,097 bytes; 126,393 data rows; 2,351 distinct prefixed RCodes.
- Columns: CPTHourEnd, GMTHourEnd, RCode, ten MW/Price pairs, Use_Bid_Slope.
- Prefix 1_: 90,001 offer rows. Prefix 0_: 36,392 bid rows. SPP's public description says offers include physical and virtual offers, and bids include demand and virtual bids. Prefix alone does not identify a physical generator.
- Use_Bid_Slope = 0 on 81,267 rows and 1 on 45,126 rows. Exact interpolation and endpoint semantics must be confirmed before computing costs.
- Every row has 1-10 complete MW/Price pairs; 67,449 have one pair and 2,898 have ten.
- No mismatched MW/Price blanks, interior gaps in populated curve points, or decreasing MW sequences were found.
- Numeric Price values range from -991.81 to 2000.00; 74,991 price points are negative. Numeric MW values range from -252.000 to 1225.000; 408 MW points are negative. These are point counts, not offer-row counts. Their market meaning must be established before selecting physical resource curves.
- There are 23,537 repeated (GMT hour, RCode) groups and 80,391 rows beyond the first row in those groups. No exact full-row duplicates were found. Preserve a source row ID; do not drop records based on hour/RCode.
- MW points are nondecreasing. Every multi-point row's price sequence is monotonic (some are constant). That is consistent with structured bid/offer curves, but does not prove their integration/dispatch semantics.

## DA operating reserve

Source: `data/DA-OR-OFFERS-202607010100.csv`.

- 7,624,413 bytes; 116,401 data rows; 1,026 distinct RCodes.
- Columns: CPTHourEnd, GMTHourEnd, RCode, ASProduct, Price. There is no MW quantity column.
- All 1,026 RCodes occur in the energy file after removing energy's 0_/1_ prefix. This proves string overlap only, not that a unique physical-resource join is valid.
- No exact full-row duplicates. There are 17,296 repeated (GMT hour, RCode, ASProduct) groups. A first-match join would lose records and a many-to-many join could multiply them.
- 24,624 records have both ASProduct and Price blank. Another 5,390 name SPIN or SUPP but have blank Price. None have Price without a product. Blank prices must not become zero offers.

| ASProduct | Rows | Populated numeric values |
| --- | ---: | ---: |
| SPIN | 13,200 | 10,714 |
| SUPP | 13,224 | 10,320 |
| Capability Offer Reg-Down | 6,694 | 6,694 |
| Capability Offer Reg-Up | 6,166 | 6,166 |
| Mileage Factor Reg-Down | 26,733 | 26,733 |
| Mileage Factor Reg-Up | 24,004 | 24,004 |
| Mileage Offer Reg-Down | 926 | 926 |
| Mileage Offer Reg-Up | 830 | 830 |
| Blank product | 24,624 | 0 |

The column name Price is overloaded: mileage-factor entries are factors, not interchangeable dollar offers. Product-specific units and calculations need verification. All populated numeric entries parse successfully.

OR means Operating Reserve. SPP identifies Regulation-Up, Regulation-Down, Spinning Reserve, and Supplemental Reserve as its OR products. This file includes regulation capability, mileage offers, and mileage factors as separate records.

## Implications for the design

1. One full operating day is sufficient for the first formulation/data audit; no additional days are needed yet.
2. These files provide curves and reserve-related offer fields but not an entire market model. They lack explicit startup/no-load costs, initial commitment states, minimum up/down times, ramp limits, transmission topology/security constraints, reserve requirements, and reserve MW availability.
3. Confirm physical versus virtual resource identification, repeated-row semantics, bid-slope interpolation, and the interpretation of negative MW points with a current guide or the user's SPP expertise.
4. An unconstrained energy clearing problem with continuous offers may be LP/convex optimization, rather than a binary unit-commitment problem. Do not introduce artificial binary restrictions just to fit QAOA.
5. With appropriate additional commitment inputs, keep classical dispatch and test a small quantum commitment neighborhood. Otherwise revise the target subroutine or explicitly label synthetic constraints.
6. For reserves, establish capacities, product-specific requirements, eligibility and shared energy/reserve headroom before attempting co-optimization.
7. Both raw files exceed Qollab's documented 2 MB per-file cap. Prepare a small attributed demo slice once the modeling rules are established; preserve the full local sources for benchmarking.

## References

- SPP historical-offers description: https://portal.spp.org/groups/im-historical-offers
- SPP glossary: https://www.spp.org/glossary/?term=Operating+Reserve
- Historical schema reference (older guide; not authority for current slope semantics): https://www.spp.org/Documents/37657/SPP%20Markets%20Public%20Data%20Guide--v13.pdf
- Qollab runtime and file limits: https://qollab.xyz/learn/docs/runtime-environment
