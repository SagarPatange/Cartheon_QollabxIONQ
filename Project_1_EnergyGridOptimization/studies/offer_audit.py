import csv
import json
from collections import Counter
from pathlib import Path

source_dir = Path(__file__).resolve().parents[1] / 'data'
reports = {}
codes = {}
for kind, filename in [('energy', 'DA-ENERGY-OFFERS-202607010100.csv'), ('reserve', 'DA-OR-OFFERS-202607010100.csv')]:
    with (source_dir / filename).open(newline='', encoding='utf-8-sig') as stream:
        reader = csv.DictReader(stream)
        headers = reader.fieldnames
        rows = list(reader)
    hours = Counter(row['CPTHourEnd'] for row in rows)
    utc_hours = Counter(row['GMTHourEnd'] for row in rows)
    keys = Counter((row['GMTHourEnd'], row['RCode']) for row in rows)
    codes[kind] = {row['RCode'].removeprefix('1_').removeprefix('0_') for row in rows}
    report = {
        'filename': filename, 'bytes': (source_dir / filename).stat().st_size,
        'headers': headers, 'rows': len(rows), 'unique_rcodes': len({r['RCode'] for r in rows}),
        'hour_counts': dict(sorted(hours.items())), 'utc_hours': sorted(utc_hours),
        'nulls_by_column': {h: sum(r[h] == '' for r in rows) for h in headers},
        'extra_field_rows': sum(None in r for r in rows),
        'duplicate_hour_rcode_keys': sum(v > 1 for v in keys.values()),
        'extra_rows_on_hour_rcode_keys': sum(v - 1 for v in keys.values() if v > 1),
        'exact_duplicate_rows': len(rows) - len({tuple(r.get(h) for h in headers) for r in rows}),
    }
    if kind == 'energy':
        prefixes = Counter(r['RCode'].split('_')[0] for r in rows)
        curve_counts = Counter()
        slopes = Counter(r['Use_Bid_Slope'] for r in rows)
        prices = []
        mws = []
        mismatched = 0
        decreasing_mw = 0
        noncontiguous = 0
        no_curve = 0
        direction = Counter()
        examples = []
        for row in rows:
            pairs = []
            indices = []
            for i in range(1, 11):
                mw, price = row[f'MW{i}'], row[f'Price{i}']
                mismatched += bool(mw) != bool(price)
                if mw and price:
                    pair = (float(mw), float(price))
                    pairs.append(pair)
                    indices.append(i)
                    mws.append(pair[0])
                    prices.append(pair[1])
            curve_counts[len(pairs)] += 1
            no_curve += not pairs
            noncontiguous += indices != list(range(1, len(indices) + 1))
            decreasing_mw += any(a[0] > b[0] for a, b in zip(pairs, pairs[1:]))
            prefix = row['RCode'].split('_')[0]
            if len(pairs) > 1:
                increasing = all(a[1] <= b[1] for a, b in zip(pairs, pairs[1:]))
                decreasing = all(a[1] >= b[1] for a, b in zip(pairs, pairs[1:]))
                direction[f'{prefix}:nondecreasing_price'] += increasing
                direction[f'{prefix}:nonincreasing_price'] += decreasing
                direction[f'{prefix}:neither_price'] += not increasing and not decreasing
            if len(examples) < 4 and len(pairs) >= 3:
                examples.append({'hour': row['CPTHourEnd'], 'rcode': row['RCode'], 'slope': row['Use_Bid_Slope'], 'pairs': pairs})
        report.update(prefix_counts=dict(prefixes), slope_counts=dict(slopes), curve_point_counts=dict(sorted(curve_counts.items())),
                      price_min=min(prices), price_max=max(prices), negative_price_points=sum(p < 0 for p in prices),
                      mw_min=min(mws), mw_max=max(mws), negative_mw_points=sum(m < 0 for m in mws),
                      mismatched_mw_price_pairs=mismatched, decreasing_mw_rows=decreasing_mw,
                      noncontiguous_curve_rows=noncontiguous, no_curve_rows=no_curve,
                      price_direction_counts=dict(direction), curve_examples=examples)
    else:
        products = Counter(r['ASProduct'] for r in rows)
        product_keys = Counter((r['GMTHourEnd'], r['RCode'], r['ASProduct']) for r in rows)
        product_stats = {}
        for product in products:
            values = [float(r['Price']) for r in rows if r['ASProduct'] == product and r['Price']]
            product_stats[product or '<blank>'] = {'rows': products[product], 'priced_rows': len(values),
                'min': min(values) if values else None, 'max': max(values) if values else None,
                'negative_prices': sum(v < 0 for v in values), 'zero_prices': sum(v == 0 for v in values)}
        report.update(products=product_stats, duplicate_hour_rcode_product_keys=sum(v > 1 for v in product_keys.values()),
                      product_without_price_rows=sum(bool(r['ASProduct']) and not r['Price'] for r in rows),
                      price_without_product_rows=sum(bool(r['Price']) and not r['ASProduct'] for r in rows),
                      examples=[r for r in rows if r['ASProduct']][:10])
    reports[kind] = report
reports['code_overlap'] = {'energy_unprefixed_codes': len(codes['energy']), 'reserve_codes': len(codes['reserve']),
    'shared_codes': len(codes['energy'] & codes['reserve'])}
print(json.dumps(reports, indent=2))
