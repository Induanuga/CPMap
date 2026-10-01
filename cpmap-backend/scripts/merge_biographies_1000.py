"""
Merge Biographies 1000
=======================
Consolidates sentence text and section classification labels from:
  - few_shot_for_CPMAP.csv (250 biographies)
  - human_dataset.csv     (50 biographies)
  - cpmap_700.csv         (700 biographies)

Enriches all records with metadata from:
  - final_biographies.csv (10,896 biographies master lookup)

Output:
  - unified_biographies_1000.csv
"""

import ast
import csv
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))

BIO_CSV       = os.path.join(PROJECT_ROOT, 'final_biographies.csv')
FEW_SHOT_CSV  = os.path.join(PROJECT_ROOT, 'few_shot_for_CPMAP.csv')
HUMAN_CSV     = os.path.join(PROJECT_ROOT, 'human_dataset.csv')
CPMAP_700_CSV = os.path.join(PROJECT_ROOT, 'cpmap_700.csv')

OUTPUT_CSV    = os.path.join(PROJECT_ROOT, 'unified_biographies_1000.csv')


def parse_label_field(raw_val):
    """Normalize label fields into clean semicolon-separated string."""
    if not raw_val:
        return ''
    raw_val = str(raw_val).strip()
    if not raw_val:
        return ''

    labels = []
    # Check if raw_val is formatted as a Python list string e.g. "['Background', 'Work Experience']"
    if raw_val.startswith('['):
        try:
            parsed = ast.literal_eval(raw_val)
            if isinstance(parsed, (list, tuple)):
                labels = [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass

    if not labels:
        # Semicolon or comma separated string e.g. "Work Experience; Background"
        labels = [l.strip() for l in raw_val.replace(';', ',').split(',') if l.strip()]

    # Filter out 'Others'
    clean = [l for l in labels if l != 'Others']
    return '; '.join(clean)


def load_master_metadata(bio_csv_path):
    """Load metadata dictionary keyed by Wikidata_ID."""
    meta = {}
    with open(bio_csv_path, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            wid = row.get('Wikidata_ID', '').strip()
            if wid:
                meta[wid] = row
    return meta


def run_merge():
    print('=' * 60)
    print('Merging & Standardizing 1,000 Biographies Dataset')
    print('=' * 60)

    # 1. Load Master Metadata
    print(f'Loading master metadata from {BIO_CSV}...')
    meta_dict = load_master_metadata(BIO_CSV)
    print(f'  Loaded {len(meta_dict)} master metadata records.')

    sentence_files = [
        ('few_shot_250', FEW_SHOT_CSV,  'label'),
        ('human_50',     HUMAN_CSV,     'labels'),
        ('cpmap_700',    CPMAP_700_CSV, 'labels_bert-multilabel-classifier_few_shot'),
    ]

    fieldnames = [
        'Wikidata_ID',
        'doc_id',
        'sent_id',
        'title',
        'text',
        'label',
        'dataset_source',
        'name',
        'gender',
        'level1_main_occ',
        'level2_main_occ',
        'level2_second_occ',
        'level3_main_occ',
        'level3_all_occ',
        'un_subregion',
        'un_region',
        'birth',
        'death',
    ]

    total_rows = 0
    unique_wids = set()
    rows_by_source = {}

    output_rows = []

    for source_name, filepath, label_col in sentence_files:
        if not os.path.exists(filepath):
            print(f'WARNING: File not found: {filepath}')
            continue

        print(f'\nProcessing {source_name} from {os.path.basename(filepath)}...')
        count = 0
        file_wids = set()

        with open(filepath, encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            for row in reader:
                wid = row.get('Wikidata_ID', '').strip()
                if not wid:
                    continue

                text = row.get('text', '').strip()
                title = row.get('title', '').strip()
                raw_label = row.get(label_col, '')
                label = parse_label_field(raw_label)

                # Fetch master metadata (fallback to row metadata if present in human_dataset)
                master = meta_dict.get(wid, {})

                name = master.get('name', '').strip() or title.replace('_', ' ')
                gender = master.get('gender', '').strip() or row.get('gender', '').strip()
                l1 = master.get('level1_main_occ', '').strip() or row.get('level1_main_occ', '').strip()
                l2 = master.get('level2_main_occ', '').strip() or row.get('level2_main_occ', '').strip()
                l2_2 = master.get('level2_second_occ', '').strip() or row.get('level2_second_occ', '').strip()
                l3 = master.get('level3_main_occ', '').strip() or row.get('level3_main_occ', '').strip()
                l3_all = master.get('level3_all_occ', '').strip() or row.get('level3_all_occ', '').strip()
                subregion = master.get('un_subregion', '').strip()
                region = master.get('un_region', '').strip()
                birth = master.get('birth', '').strip()
                death = master.get('death', '').strip()

                out_row = {
                    'Wikidata_ID': wid,
                    'doc_id': row.get('doc_id', '').strip(),
                    'sent_id': row.get('sent_id', '').strip(),
                    'title': title,
                    'text': text,
                    'label': label,
                    'dataset_source': source_name,
                    'name': name,
                    'gender': gender,
                    'level1_main_occ': l1,
                    'level2_main_occ': l2,
                    'level2_second_occ': l2_2,
                    'level3_main_occ': l3,
                    'level3_all_occ': l3_all,
                    'un_subregion': subregion,
                    'un_region': region,
                    'birth': birth,
                    'death': death,
                }

                output_rows.append(out_row)
                count += 1
                file_wids.add(wid)
                unique_wids.add(wid)

        rows_by_source[source_name] = (count, len(file_wids))
        print(f'  Added {count} sentences for {len(file_wids)} people.')

    # Write output CSV
    print(f'\nWriting output to {OUTPUT_CSV}...')
    with open(OUTPUT_CSV, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)

    print('\n' + '=' * 60)
    print('Merge Summary:')
    print(f'  Total sentence rows written: {len(output_rows)}')
    print(f'  Total unique biographies:  {len(unique_wids)}')
    for src, (rcount, pcount) in rows_by_source.items():
        print(f'    - {src:12s}: {rcount:6d} sentences ({pcount} people)')
    print(f'  Output file location:       {OUTPUT_CSV}')
    print('=' * 60)


if __name__ == '__main__':
    run_merge()
