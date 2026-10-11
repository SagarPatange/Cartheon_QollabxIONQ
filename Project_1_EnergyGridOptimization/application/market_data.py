"""Validated, UTC-indexed SPP datasets; uploaded files retain their own rights."""
from copy import deepcopy
import csv
from datetime import datetime, timedelta
import hashlib
import io
import json
import math
from pathlib import Path
import threading
from uuid import uuid4

from optimizer.energy_auction import PROJECT, curve_from_row

ENERGY_LIMIT = 24 * 1024 * 1024
CLEARING_LIMIT = 4 * 1024 * 1024
STAMP = '%m/%d/%Y %H:%M:%S'
ENERGY_COLUMNS = {'CPTHourEnd','GMTHourEnd','RCode','Use_Bid_Slope'} | {
    field for i in range(1,11) for field in (f'MW{i}',f'Price{i}')}
CLEARING_COLUMNS = {'Interval','GMTIntervalEnd','BAA','Cleared Fixed Demand Bid','SMP'}


def _rows(text, required):
    reader = csv.DictReader(io.StringIO(text.lstrip('\ufeff'), newline=''))
    names = reader.fieldnames or []
    if not required.issubset(names) or len(names) != len(set(names)):
        raise ValueError('Missing or duplicate required CSV columns')
    count = 0
    for count, row in enumerate(reader,1):
        if None in row or any(v is None for v in row.values()):
            raise ValueError(f'CSV row {count}: incorrect field count')
        yield count,row
    if not count:
        raise ValueError('CSV contains no data rows')


def _stamp(value):
    try:
        result = datetime.strptime(value, STAMP)
    except (TypeError, ValueError) as error:
        raise ValueError('Require timestamps in MM/DD/YYYY HH:MM:SS format') from error
    if result.minute or result.second:
        raise ValueError('Require hourly interval-ending timestamps')
    return result


def _number(value, label):
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f'{label}: require a finite number') from error
    if not math.isfinite(result):
        raise ValueError(f'{label}: require a finite number')
    return result


class DatasetStore:
    def __init__(self, upload_root=None, *, load_default=True):
        self.upload_root = Path(upload_root or PROJECT/'data/uploads')
        self._datasets = {}
        self._lock = threading.Lock()
        self.default_id = None
        if load_default:
            energy = PROJECT/'data/DA-ENERGY-OFFERS-202607010100.csv'
            clearing = PROJECT/'data/DA-MC-202607010100.csv'
            result = self._register({'name':energy.name,'text':energy.read_bytes().decode('utf-8')},
                                    {'name':clearing.name,'text':clearing.read_bytes().decode('utf-8')},persist=False)
            self.default_id = result['dataset_id']

    def register(self, energy, clearing):
        return self._register(energy, clearing, persist=True)

    def _register(self, energy, clearing, *, persist):
        for item, limit in ((energy,ENERGY_LIMIT),(clearing,CLEARING_LIMIT)):
            if not isinstance(item,dict) or set(item) != {'name','text'}:
                raise ValueError('Each file requires name and text')
            if not isinstance(item['name'],str) or not 0 < len(item['name']) <= 240 or not isinstance(item['text'],str):
                raise ValueError('Require a filename and CSV text')
            if not 0 < len(item['text'].encode('utf-8')) <= limit:
                raise ValueError(f'CSV file is empty or exceeds {limit//(1024*1024)} MiB')
        grouped, local = {}, {}
        for number,row in _rows(energy['text'],ENERGY_COLUMNS):
            utc,cpt = _stamp(row['GMTHourEnd']),_stamp(row['CPTHourEnd'])
            if utc in local and local[utc] != cpt:
                raise ValueError('Ambiguous CPT label for one UTC interval')
            local[utc] = cpt
            grouped.setdefault(utc,[]).append(curve_from_row(row,f'energy.csv:data-row-{number}'))
        market = {}
        seen = set()
        for number,row in _rows(clearing['text'],CLEARING_COLUMNS):
            utc,cpt = _stamp(row['GMTIntervalEnd']),_stamp(row['Interval'])
            key = (utc,row['BAA'])
            if not row['BAA'] or key in seen:
                raise ValueError('Missing or duplicate BAA row for an interval')
            seen.add(key)
            fixed = _number(row['Cleared Fixed Demand Bid'],'Fixed demand')
            smp = _number(row['SMP'],'Historical SMP')
            if fixed < 0:
                raise ValueError('Fixed demand must be nonnegative')
            if utc not in local or local[utc] != cpt:
                raise ValueError('CSV files have mismatched intervals or CPT labels')
            if row['BAA'] == 'SPP':
                market[utc] = (fixed,smp)
        hours = sorted(grouped)
        if set(market) != set(hours):
            raise ValueError('Require exactly one SPP clearing row for every offered interval')
        if not 1 <= len(hours) <= 25 or any(b-a != timedelta(hours=1) for a,b in zip(hours,hours[1:])):
            raise ValueError('Require 1–25 consecutive hourly UTC intervals')
        days = {(local[u]-timedelta(microseconds=1)).date() for u in hours}
        if len(days) != 1:
            raise ValueError('Files must describe one operating day')
        dataset_id = uuid4().hex
        metadata = dict(dataset_id=dataset_id, operating_day=next(iter(days)).isoformat(),
                        complete_day=len(hours) in (23,24,25) and local[hours[0]].hour == 1 and local[hours[-1]].hour == 0,
                        filenames={'energy':energy['name'],'clearing':clearing['name']},
                        sha256={k:hashlib.sha256(v['text'].encode('utf-8')).hexdigest()
                                for k,v in [('energy',energy),('clearing',clearing)]},
                        rights='SPP inputs excluded from MIT; original terms apply.',
                        hours=[dict(index=i,utc_end=u.strftime(STAMP),cpt_end=local[u].strftime(STAMP),
                                    fixed_demand_mw=market[u][0],historical_smp=market[u][1],
                                    submission_count=len(grouped[u])) for i,u in enumerate(hours)])
        if persist:
            folder = self.upload_root/dataset_id
            folder.mkdir(parents=True,exist_ok=False)
            try:
                (folder/'energy.csv').write_bytes(energy['text'].encode('utf-8'))
                (folder/'clearing.csv').write_bytes(clearing['text'].encode('utf-8'))
                (folder/'metadata.json').write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf-8')
            except OSError:
                # Only our three newly created files; no recursive deletion.
                for name in ('energy.csv','clearing.csv','metadata.json'):
                    (folder/name).unlink(missing_ok=True)
                folder.rmdir()
                raise
        with self._lock:
            self._datasets[dataset_id] = (metadata,[grouped[u] for u in hours])
        return deepcopy(metadata)

    def describe(self,dataset_id):
        with self._lock:
            return deepcopy(self._datasets[dataset_id][0])

    def curves(self,dataset_id,hour_index):
        with self._lock:
            rows = self._datasets[dataset_id][1]
            if type(hour_index) is not int or not 0 <= hour_index < len(rows):
                raise ValueError('Unknown hour index')
            return list(rows[hour_index])

    def hour(self,dataset_id,hour_index):
        curves = self.curves(dataset_id,hour_index)
        metadata = self.describe(dataset_id)
        return dict(dataset_id=dataset_id,**metadata['hours'][hour_index],
                    submissions=[dict(row_id=c.row_id,rcode=c.rcode,side=c.side,slope=c.slope,
                                      points=c.points,segments=list(c.pieces()),
                                      lower_mw=c.lower,upper_mw=c.upper) for c in curves])
