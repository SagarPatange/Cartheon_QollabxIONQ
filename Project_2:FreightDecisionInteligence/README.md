# Freight Decision Intelligence

A truckload dispatch simulator: loads are tendered over time across US lanes, and different dispatch policies,
classical and quantum, decide which loads to accept and which truck hauls each. Every policy runs on the same
stream of loads and is scored the same way.

This effort is supported by Qollab & IonQ.

## Data

The load stream, lanes, rates, facilities and fleet come from the **Logistics Operations Database** on Kaggle,
a synthetic three-year dataset of a US over-the-road truckload carrier (MIT). The imported tables and the changes
made to them are in `data/kaggle_logistics/README.md`; what the data contains and where it is unrealistic is in
`docs/data_profile.md`.

To rebuild `data/kaggle_logistics/` from the Kaggle download:

```sh
python tools/import_kaggle_logistics.py path/to/unzipped/kaggle/files
```

## Disclosures

- Dataset: "Logistics Operations Database" by yogape on Kaggle, MIT.
  https://www.kaggle.com/datasets/yogape/logistics-operations-database
- AI tools: Claude Code was used to research datasets, write code and draft documentation.
