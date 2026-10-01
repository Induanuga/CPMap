"""
O*NET Real Skills Fetcher
==========================
Fetches real skill data from O*NET Web Services API for every occupation
in the biography dataset using live API calls.

Usage:
    python3 scripts/onet_fetch_skills.py

Output:
    Live skill data for each matched SOC code, printed and used in memory.
"""

import csv
import json
import os
import subprocess
import time
import urllib.request
import urllib.parse
import urllib.error

SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
BIO_CSV     = os.path.join(PROJECT_ROOT, 'final_biographies.csv')
API_KEY     = os.getenv('ONET_API_KEY', '9pLbo-D8UN2-bm5vo-7t6LX')
BASE_URL    = 'https://api-v2.onetcenter.org'
NODE_BIN    = os.getenv('NODE_BIN', 'node')
SEMANTIC_EMBEDDING_SCRIPT = os.path.join(SCRIPT_DIR, 'semantic_embed.js')

# Default SOC used when O*NET search and semantic matching both fail
DEFAULT_SOC = '25-1011.00'  # Business Teachers, Postsecondary

# ── In-memory caches ──────────────────────────────────────────────────────────
_ONET_OCCUPATIONS_CACHE = None   # full occupation list: [(soc_code, title)]
_SKILLS_CACHE: dict = {}         # soc_code → [skill_dicts]  (avoids re-fetching same SOC)

# ── Network timeout ───────────────────────────────────────────────────────────
# urllib on Windows ignores the timeout= kwarg during SSL handshake.
# Setting the global socket default forces it to be respected everywhere.
import socket as _socket
_socket.setdefaulttimeout(15)


# ── Semantic SOC selection helpers ───────────────────────────────────────────

def normalize_text(text):
    if not text:
        return ''
    return ' '.join(text.lower().replace('_', ' ').split())


def run_semantic_embeddings(texts):
    payload = json.dumps(texts).encode('utf-8')
    completed = subprocess.run(
        [NODE_BIN, SEMANTIC_EMBEDDING_SCRIPT],
        input=payload,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=SCRIPT_DIR,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.decode('utf-8', 'ignore').strip() or 'semantic embedding failed')
    output = completed.stdout.decode('utf-8', 'ignore').strip()
    if not output:
        raise RuntimeError('semantic embedding returned no output')
    data = json.loads(output)
    return data if isinstance(data[0], list) else [data]


def cosine_similarity(vec1, vec2):
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    dot = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = sum(a * a for a in vec1) ** 0.5
    norm2 = sum(b * b for b in vec2) ** 0.5
    return dot / (norm1 * norm2) if norm1 and norm2 else 0.0


def get_unique_labels():
    labels = set()
    if not os.path.exists(BIO_CSV):
        return labels
    with open(BIO_CSV, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            for key in ('level3_main_occ', 'level2_main_occ', 'level1_main_occ'):
                value = row.get(key, '').strip()
                if value:
                    labels.add(value)
    return labels


def get_all_onet_occupations():
    """
    Fetch the full occupation list from O*NET API, paginating through all results.
    Returns a list of (soc_code, title) tuples. Results are cached in memory.
    """
    global _ONET_OCCUPATIONS_CACHE
    if _ONET_OCCUPATIONS_CACHE is not None:
        return _ONET_OCCUPATIONS_CACHE

    occupations = []
    start = 1
    page_size = 100

    print('  Fetching full O*NET occupation list...')
    while True:
        path = f'/online/occupations?language=EN&start={start}&end={start + page_size - 1}'
        try:
            data = api_get(path)
        except Exception as exc:
            print(f'  O*NET occupation list fetch failed at start={start}: {type(exc).__name__}')
            break

        page_items = data.get('occupation', [])
        for item in page_items:
            code = item.get('code')
            title = item.get('title', '')
            if code:
                occupations.append((code, title))

        total = data.get('total', 0)
        end = data.get('end', start)
        if end >= total or not page_items:
            break
        start = end + 1
        time.sleep(0.2)

    print(f'  Loaded {len(occupations)} occupations from O*NET.')
    _ONET_OCCUPATIONS_CACHE = occupations
    return occupations


def build_soc_candidate_texts(soc_codes):
    """Build (soc, candidate_text) pairs using O*NET occupation titles."""
    all_occupations = get_all_onet_occupations()
    title_by_soc = {code: title for code, title in all_occupations}

    candidate_texts = []
    for soc in sorted(soc_codes):
        title = title_by_soc.get(soc, '')
        candidate_text = normalize_text(title) if title else soc
        candidate_texts.append((soc, candidate_text))
    return candidate_texts


def init_candidate_embeddings(soc_codes):
    candidate_texts = [text for _, text in build_soc_candidate_texts(soc_codes)]
    return run_semantic_embeddings(candidate_texts)


def choose_semantic_soc(label, candidate_embeddings=None, candidate_socs=None):
    """
    Semantically match a label against a set of O*NET SOC codes using
    embeddings of their official titles. Falls back to DEFAULT_SOC if no
    good match is found.
    """
    if not label:
        return None
    normalized = normalize_text(label)
    try:
        label_emb = run_semantic_embeddings([normalized])[0]
    except Exception as exc:
        print(f'  Semantic embedding failed for label "{label}": {exc}')
        return None

    if candidate_embeddings is None or candidate_socs is None:
        print('  Candidate SOC embeddings not initialized')
        return None

    best_score = -1.0
    best_soc = None
    for soc, cand_emb in zip(candidate_socs, candidate_embeddings):
        score = cosine_similarity(label_emb, cand_emb)
        if score > best_score:
            best_score = score
            best_soc = soc

    if best_soc is None:
        return None

    if best_score < 0.45:
        print(f'  Low match ({best_score:.2f}) for "{label}" → selecting best SOC {best_soc}')

    return best_soc


# ── API helpers ───────────────────────────────────────────────────────────────

# Timeout in seconds for each O*NET API call.
ONET_TIMEOUT = 12

import http.client as _http_client
import ssl as _ssl
import socket as _socket

_ONET_HOST = 'api-v2.onetcenter.org'
_ONET_SSL_CTX = _ssl.create_default_context()


class _TimeoutHTTPS(_http_client.HTTPSConnection):
    """
    HTTPSConnection subclass that applies the timeout at the socket level,
    including during the SSL handshake. The stdlib HTTPSConnection does not
    reliably enforce timeout on Windows during SSL wrap.
    """
    def connect(self):
        raw = _socket.create_connection((self.host, self.port), timeout=self.timeout)
        raw.settimeout(self.timeout)
        self.sock = _ONET_SSL_CTX.wrap_socket(raw, server_hostname=self.host)


def api_get(path):
    """
    Make a GET request to the O*NET API and return parsed JSON.
    Uses a custom HTTPSConnection that enforces timeout during SSL handshake.
    """
    conn = _TimeoutHTTPS(_ONET_HOST, timeout=ONET_TIMEOUT)
    try:
        conn.request(
            'GET', path,
            headers={'X-API-Key': API_KEY, 'Accept': 'application/json'},
        )
        resp = conn.getresponse()
        body = resp.read().decode('utf-8')
        if resp.status >= 400:
            raise urllib.error.HTTPError(
                BASE_URL + path, resp.status, resp.reason, {}, None
            )
        return json.loads(body)
    finally:
        conn.close()


def search_soc_by_label(label):
    encoded = urllib.parse.quote(label)
    path = f'/online/occupations?language=EN&keyword={encoded}'
    try:
        data = api_get(path)
    except urllib.error.HTTPError as e:
        print(f'  O*NET search HTTP {e.code} for "{label}"')
        return []
    except Exception as e:
        print(f'  O*NET search failed for "{label}": {type(e).__name__}')
        return []

    occupations = data.get('occupation', [])
    results = []
    for item in occupations:
        code = item.get('code')
        title = item.get('title')
        if code:
            results.append((code, title or ''))
    return results


def choose_soc_from_search(label):
    """
    Search O*NET for the label and return the best-matching SOC code.
    Returns None if no result has at least 1 token overlap with the label,
    so that pure-noise matches (e.g. "basket" → "Accountants") are rejected
    and fall through to semantic matching.
    """
    results = search_soc_by_label(label)
    if not results:
        return None

    label_tokens = set(normalize_text(label).split())
    best_score = 0          # require at least 1 overlapping token
    best_soc = None
    for code, title in results:
        title_tokens = set(normalize_text(title).split())
        score = len(label_tokens & title_tokens)
        if score > best_score:
            best_score = score
            best_soc = code

    if best_soc:
        print(f'  O*NET search matched "{label}" → {best_soc} (overlap={best_score})')
    else:
        print(f'  O*NET search: no token overlap for "{label}" — skipping to semantic')
    return best_soc


def fetch_all_skills(soc_code):
    """
    Fetch ALL skills for a SOC code by paginating through the details endpoint.
    Returns list of {skillName, onetCode, description}.

    Results are cached in _SKILLS_CACHE so the same SOC is never fetched twice
    in a single pipeline run. On any network / timeout error the function
    returns whatever skills were collected so far (possibly an empty list) so
    that the caller can fall back gracefully rather than crashing.
    """
    global _SKILLS_CACHE
    if soc_code in _SKILLS_CACHE:
        return _SKILLS_CACHE[soc_code]

    skills = []
    start = 1
    page_size = 20

    while True:
        path = f'/online/occupations/{soc_code}/details/skills?start={start}&end={start+page_size-1}'
        try:
            data = api_get(path)
        except urllib.error.HTTPError as e:
            print(f'      HTTP {e.code} for {soc_code} at start={start}')
            break
        except (TimeoutError, OSError, ConnectionError, Exception) as e:
            print(f'      Network error fetching skills for {soc_code}: {type(e).__name__} — skipping')
            break

        elements = data.get('element', [])
        for el in elements:
            skills.append({
                'skillName':   el.get('name', ''),
                'onetCode':    el.get('id', ''),
                'description': el.get('description', ''),
            })

        total = data.get('total', 0)
        end   = data.get('end', start)
        if end >= total:
            break
        start = end + 1
        time.sleep(0.3)   # be polite to the API

    _SKILLS_CACHE[soc_code] = skills
    return skills


# ── Main ──────────────────────────────────────────────────────────────────────

def run():
    print('=' * 60)
    print('O*NET Real Skills Fetcher')
    print('=' * 60)

    # Step 1: Load all occupations from O*NET API
    all_occupations = get_all_onet_occupations()
    if not all_occupations:
        print('ERROR: Could not load any occupations from O*NET API.')
        return {}

    candidate_socs  = [code  for code, _     in all_occupations]
    candidate_titles = [title for _,    title in all_occupations]

    # Build semantic embeddings for all O*NET occupation titles
    print('  Building semantic embeddings for O*NET occupation titles...')
    candidate_embeddings = run_semantic_embeddings(candidate_titles)

    # Step 2: Resolve biography labels → SOC codes
    unique_labels = get_unique_labels()
    print(f'Unique occupation labels found: {len(unique_labels)}')

    label_to_soc = {}
    for label in sorted(unique_labels):
        # Try O*NET keyword search first (exact/partial title match)
        soc = choose_soc_from_search(label)
        if soc:
            label_to_soc[label] = soc
            continue

        # Fall back to semantic similarity against full O*NET title list
        soc = choose_semantic_soc(label, candidate_embeddings, candidate_socs)
        if soc:
            label_to_soc[label] = soc
        else:
            print(f'  Could not resolve label: "{label}" → using default SOC {DEFAULT_SOC}')
            label_to_soc[label] = DEFAULT_SOC

    unique_soc = {}
    for label, soc in label_to_soc.items():
        unique_soc.setdefault(soc, []).append(label)

    print(f'Unique SOC codes to fetch: {len(unique_soc)}\n')

    # Step 3: Fetch skills for each resolved SOC code
    fetched = 0
    for soc_code, occ_keys in sorted(unique_soc.items()):
        print(f'  [FETCH]  {soc_code} — {occ_keys[0]}, +{len(occ_keys)-1} more ...', end='', flush=True)
        skills = fetch_all_skills(soc_code)
        fetched += 1
        print(f' {len(skills)} skills')
        time.sleep(0.5)   # rate-limit buffer

    print(f'\n✅ Live O*NET fetch completed')
    print(f'   Fetched: {fetched} SOC codes')
    print()

    # Quick preview: sample labels from the resolved set
    print('── Sample Skills by Occupation ─────────────────────────')
    for sample_occ in list(sorted(label_to_soc.keys()))[:5]:
        soc = label_to_soc[sample_occ]
        skills = fetch_all_skills(soc)[:5]
        names  = [s['skillName'] for s in skills]
        print(f'  {sample_occ:20} ({soc}): {names}')
    print('=' * 60)

    return {}


if __name__ == '__main__':
    run()
