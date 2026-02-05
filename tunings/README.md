# Tunings directory

Tuning files are organized first by **type**, then by **subcategory** to make browsing manageable.

## Top-level categories
- `equal_temperament`
- `meantone_well`
- `historical_keyboard_organ`
- `world_traditional`
- `mos_temperaments` (porcupine/marvel/magic/etc. families)
- `just_intonation`
- `experimental_other` (fallback / uncategorized)
- `complimit.lst` stays at the root (reference list)

## Subcategories
- **equal_temperament**: `et_<=12`, `et_13-24`, `et_25-53`, `et_54plus`, `et_misc`
- **just_intonation**: `limit_5`, `limit_7`, `limit_11`, `limit_13`, `limit_17`, `limit_19`, `limit_23plus`, `ji_misc`
- **mos_temperaments**: `porcupine`, `mavila`, `marvel`, `miracle`, `magic`, `starling`, `leapday`, `secor`, `catakleismic`, `diamond`, `pajara`, `breed`, `tritriad`, `catfish`, `hedge`, `mos_generic`, `mos_misc`
- **world_traditional**: `indonesia_gamelan`, `africa_mbira_balafon`, `east_asia`, `middle_east_maqam`, `south_asia_india`, `europe_bagpipe`, `other_trad`
- **meantone_well**: `meantone`, `well_temperament`, `keyboard_other`
- **historical_keyboard_organ**: `organ`, `harpsichord_clav`, `piano_forte`, `bells_carillon`, `other_historical`
- **experimental_other**: `math_theory`, `creative_misc`

## Re-sort helper (best-effort heuristic)

Run this from the project root after bulk imports. It places new `.scl` files into type/subcategory folders based on filename/description keywords. Files already in subfolders are left alone. Name collisions get a numeric suffix.

```bash
python - <<'PY'
from pathlib import Path
import re
from itertools import count

root = Path('tunings')
categories = [
    'equal_temperament',
    'meantone_well',
    'historical_keyboard_organ',
    'world_traditional',
    'mos_temperaments',
    'just_intonation',
    'experimental_other',
]
for c in categories:
    (root / c).mkdir(exist_ok=True)

def desc(path: Path) -> str:
    try:
        with path.open(errors='ignore') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('!'):
                    continue
                return line.lower()
    except Exception:
        return ''
    return ''

def text(path: Path) -> str:
    return (path.name + ' ' + desc(path)).lower()

# --- classifiers ---
et_re = re.compile(r'(\\d{1,3})[- ]?(?:et|tet)\\b')
def classify_equal(p):
    m = et_re.search(text(p))
    if m:
        n = int(m.group(1))
        if n <= 12: return 'et_<=12'
        if n <= 24: return 'et_13-24'
        if n <= 53: return 'et_25-53'
        return 'et_54plus'
    return 'et_misc'

limit_re = re.compile(r'(\\d+)[ -]?limit')
def classify_ji(p):
    m = limit_re.search(text(p))
    if m:
        n = int(m.group(1))
        if n <= 5: return 'limit_5'
        if n <= 7: return 'limit_7'
        if n <= 11: return 'limit_11'
        if n <= 13: return 'limit_13'
        if n <= 17: return 'limit_17'
        if n <= 19: return 'limit_19'
        return 'limit_23plus'
    return 'ji_misc'

mos_families = [
    ('porcupine','porcupine'), ('mavila','mavila'), ('marvel','marvel'),
    ('miracle','miracle'), ('magic','magic'), ('starling','starling'),
    ('leap','leapday'), ('secor','secor'), ('catak','catakleismic'),
    ('diamond','diamond'), ('pajara','pajara'), ('breed','breed'),
    ('tritriad','tritriad'), ('catfish','catfish'), ('hedge','hedge'),
]
def classify_mos(p):
    t = text(p)
    for key, name in mos_families:
        if key in t:
            return name
    if 'mos' in t:
        return 'mos_generic'
    return 'mos_misc'

world_map = [
    ('gamelan','indonesia_gamelan'), ('pelog','indonesia_gamelan'), ('slendro','indonesia_gamelan'),
    ('degung','indonesia_gamelan'), ('kebyar','indonesia_gamelan'), ('laras','indonesia_gamelan'),
    ('kacapi','indonesia_gamelan'),
    ('balafon','africa_mbira_balafon'), ('timbila','africa_mbira_balafon'), ('mbira','africa_mbira_balafon'),
    ('kalimba','africa_mbira_balafon'), ('valimba','africa_mbira_balafon'), ('ilimba','africa_mbira_balafon'),
    ('bangwe','africa_mbira_balafon'), ('kora','africa_mbira_balafon'),
    ('bagpipe','europe_bagpipe'), ('pipes','europe_bagpipe'),
    ('thailand','east_asia'), ('thai','east_asia'), ('burma','east_asia'), ('myanmar','east_asia'),
    ('bali','east_asia'), ('javan','east_asia'), ('sunda','east_asia'), ('ranat','east_asia'),
    ('china','east_asia'), ('chinese','east_asia'), ('sheng','east_asia'), ('pipa','east_asia'),
    ('dizi','east_asia'), ('yangqin','east_asia'), ('qin','east_asia'), ('koto','east_asia'),
    ('shakuhachi','east_asia'), ('japan','east_asia'), ('korea','east_asia'), ('viet','east_asia'),
    ('maqam','middle_east_maqam'), ('arab','middle_east_maqam'), ('turkish','middle_east_maqam'),
    ('persian','middle_east_maqam'), ('hijaz','middle_east_maqam'), ('rast','middle_east_maqam'),
    ('bayati','middle_east_maqam'), ('ushshaq','middle_east_maqam'), ('kanun','middle_east_maqam'),
    ('qanun','middle_east_maqam'), ('santur','middle_east_maqam'), ('oud','middle_east_maqam'),
    ('isfahan','middle_east_maqam'),
    ('india','south_asia_india'), ('hindustani','south_asia_india'), ('carnatic','south_asia_india'),
    ('raga','south_asia_india'), ('raag','south_asia_india'), ('shruti','south_asia_india'),
    ('vina','south_asia_india'), ('tanp','south_asia_india'),
]
def classify_world(p):
    t = text(p)
    for key, name in world_map:
        if key in t:
            return name
    return 'other_trad'

meantone_keys = ['meantone','1/4-comma','1/5-comma','1/6-comma','quarter-comma','fifth-comma']
well_keys = ['well','wohl','wohltemper','werck','vallotti','valotti','kirnberger','young','neidhardt','lindley','muffat','silbermann','lehman','kellet','ebvt','bach','schlick']
def classify_meantone(p):
    t = text(p)
    if any(k in t for k in meantone_keys):
        return 'meantone'
    if any(k in t for k in well_keys):
        return 'well_temperament'
    return 'keyboard_other'

instrument_map = [
    ('organ','organ'), ('clav','harpsichord_clav'), ('harpsichord','harpsichord_clav'),
    ('cemb','harpsichord_clav'), ('spinet','harpsichord_clav'), ('virginal','harpsichord_clav'),
    ('piano','piano_forte'), ('forte','piano_forte'), ('fortepiano','piano_forte'),
    ('carillon','bells_carillon'), ('bell','bells_carillon'),
]
def classify_hist(p):
    t = text(p)
    for key, name in instrument_map:
        if key in t:
            return name
    return 'other_historical'

exp_math_keys = ['comma','lattice','temper','temperament','hexany','diamond','limit','mos','fokker','val']
def classify_exp(p):
    t = text(p)
    if any(k in t for k in exp_math_keys):
        return 'math_theory'
    return 'creative_misc'

type_classifiers = {
    'equal_temperament': classify_equal,
    'just_intonation': classify_ji,
    'mos_temperaments': classify_mos,
    'world_traditional': classify_world,
    'meantone_well': classify_meantone,
    'historical_keyboard_organ': classify_hist,
    'experimental_other': classify_exp,
}

def move_into(cat: str, paths):
    moved = 0
    classify = type_classifiers[cat]
    for p in paths:
        sub = classify(p)
        dest_dir = p.parent / sub
        dest_dir.mkdir(exist_ok=True)
        dest = dest_dir / p.name
        if dest.exists():
            for i in count(2):
                cand = dest_dir / f"{p.stem}_{i}{p.suffix}"
                if not cand.exists():
                    dest = cand
                    break
        p.rename(dest)
        moved += 1
    return moved

total = 0
# 1) root-level imports -> type/subcat
root_files = list(root.glob('*.scl'))
if root_files:
    print(f"Root files found: {len(root_files)} — sorting into type/subcat folders")
    # First drop into type roots, then subcat
    for p in root_files:
        t = text(p)
        # coarse type detection using same classifiers as before
        # pick highest priority: ET, meantone, historical, world, MOS, JI, fallback
        if et_re.search(t):
            cat = 'equal_temperament'
        elif any(k in t for k in meantone_keys + well_keys):
            cat = 'meantone_well'
        elif any(k in t for k, _ in instrument_map):
            cat = 'historical_keyboard_organ'
        elif any(k in t for k, _ in world_map):
            cat = 'world_traditional'
        elif any(k in t for k, _ in mos_families) or 'mos' in t:
            cat = 'mos_temperaments'
        elif 'limit' in t or ' ji' in t or 'ratio' in t:
            cat = 'just_intonation'
        else:
            cat = 'experimental_other'

        cat_dir = root / cat
        cat_dir.mkdir(exist_ok=True)
        dest = cat_dir / p.name
        if dest.exists():
            for i in count(2):
                cand = cat_dir / f"{p.stem}_{i}{p.suffix}"
                if not cand.exists():
                    dest = cand
                    break
        p.rename(dest)
        total += 1

# 2) subcategory sorting within each category root
for cat in categories:
    cat_dir = root / cat
    unsorted = list(cat_dir.glob('*.scl'))
    if unsorted:
        total += move_into(cat, unsorted)

print(f"sorted {total} files (root moves + subcategory moves)")
PY
```
