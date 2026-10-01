"""
Career Path Pipeline - LLM-Powered Stage Extraction with Gemini
================================================================
Purpose: Process biography datasets, generate structured career paths
using Google Gemini as the LLM, validate outputs, and write seed data.

Flow:
  1. Read final_biographies.csv  → meta per Wikidata ID
  2. Read few_shot_for_CPMAP.csv → labelled sentences per person
  3. Resolve occupation → SOC code via O*NET API
  4. Fetch O*NET skills for the resolved SOC code
  5. Call Gemini to extract structured career-path JSON
  6. Validate and normalise the LLM output
  7. Fallback to regex extraction if LLM fails / is disabled
  8. Write generated_career_paths.json

Environment variables:
  GEMINI_API_KEY            – Google Gemini API key  (required for LLM mode)
  USE_LLM                   – 'true' to enable Gemini  (default: true)
  USE_SEMANTIC_OCCUPATION   – 'true' to use semantic SOC matching (default: true)
  NODE_BIN                  – path to node binary  (default: node)
  ONET_API_KEY              – O*NET Web Services key (read from ../.env)

Run:
  python3 scripts/pipeline_build_career_paths.py
"""

import csv, importlib.util, json, os, re, subprocess, sys, time
from collections import defaultdict
from urllib import request, error as urllib_error

# Force a global socket timeout so urllib SSL handshakes don't hang forever
# on Windows (where timeout= kwarg to urlopen is ignored during connect/SSL).
import socket as _socket
_socket.setdefaulttimeout(15)

# ── Load .env from backend directory ─────────────────────────────────────────
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env')
if os.path.exists(_env_path):
    with open(_env_path, encoding='utf-8') as _ef:
        for _line in _ef:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _, _v = _line.partition('=')
                # Strip surrounding quotes that editors/shells sometimes add (e.g. KEY="value")
                _v = _v.strip().strip('"').strip("'")
                os.environ.setdefault(_k.strip(), _v)

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
UNIFIED_CSV  = os.path.join(PROJECT_ROOT, 'unified_biographies_1000.csv')
FEW_SHOT_CSV = os.path.join(PROJECT_ROOT, 'few_shot_for_CPMAP.csv')
BIO_CSV      = os.path.join(PROJECT_ROOT, 'final_biographies.csv')
OUTPUT_JSON  = os.path.join(SCRIPT_DIR,   'generated_career_paths.json')

# ── Feature flags ─────────────────────────────────────────────────────────────
USE_LLM                 = os.getenv('USE_LLM', 'true').lower() in ('1', 'true', 'yes', 'on')
USE_SEMANTIC_OCCUPATION = os.getenv('USE_SEMANTIC_OCCUPATION', 'true').lower() in ('1', 'true', 'yes', 'on')
NODE_BIN                = os.getenv('NODE_BIN', 'node')
SEMANTIC_EMBEDDING_SCRIPT = os.path.join(SCRIPT_DIR, 'semantic_embed.js')

# ── Gemini API settings ───────────────────────────────────────────────────────
GEMINI_API_KEY   = os.getenv('GEMINI_API_KEY', '')
GEMINI_BASE_URL  = 'generativelanguage.googleapis.com'
GEMINI_MODEL     = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')   # fast + cheap for batch work
GEMINI_MAX_RETRIES = 3
GEMINI_RETRY_DELAY = 5   # seconds between retries

TOP_N_SKILLS = 8

# Default SOC used when O*NET resolution fails entirely
DEFAULT_SOC      = '25-1011.00'
DEFAULT_CATEGORY = 'Other'

# ── SOC → Display Category mapping ───────────────────────────────────────────
# Maps O*NET SOC major group prefixes to human-readable categories shown in UI.
# This replaces the old hardcoded OCCUPATION_SOC_MAP. Any SOC not matched here
# falls back to DEFAULT_CATEGORY.
SOC_CATEGORY_MAP = [
    ('11-',  'Commerce & Management'),   # Management Occupations
    ('13-',  'Commerce & Management'),   # Business & Financial Operations
    ('15-',  'Engineering & Tech'),      # Computer & Mathematical
    ('17-',  'Engineering & Tech'),      # Architecture & Engineering
    ('19-',  'Research & Academia'),     # Life, Physical & Social Science
    ('21-',  'Government & Public Service'), # Community & Social Service
    ('23-',  'Law & Administration'),    # Legal
    ('25-',  'Research & Academia'),     # Education, Training & Library
    ('27-',  'Creative Fields'),         # Arts, Design, Entertainment, Sports, Media
    ('29-',  'Medical'),                 # Healthcare Practitioners
    ('31-',  'Medical'),                 # Healthcare Support
    ('33-',  'Law & Administration'),    # Protective Service
    ('35-',  'Skilled Trades'),          # Food Preparation & Serving
    ('37-',  'Skilled Trades'),          # Building & Grounds Cleaning
    ('39-',  'Skilled Trades'),          # Personal Care & Service
    ('41-',  'Commerce & Management'),   # Sales
    ('43-',  'Law & Administration'),    # Office & Administrative Support
    ('45-',  'Rural / Non-traditional'), # Farming, Fishing & Forestry
    ('47-',  'Skilled Trades'),          # Construction & Extraction
    ('49-',  'Skilled Trades'),          # Installation, Maintenance & Repair
    ('51-',  'Skilled Trades'),          # Production
    ('53-',  'Skilled Trades'),          # Transportation & Material Moving
    ('55-',  'Government & Public Service'), # Military Specific
]

# Override specific SOC codes that the prefix rule would miscategorise
SOC_OVERRIDE = {
    '27-2021.00': 'Sports & Athletics',  # Athletes and Sports Competitors
    '27-2022.00': 'Sports & Athletics',  # Coaches and Scouts
    '27-2023.00': 'Sports & Athletics',  # Umpires, Referees, and Other Sports Officials
    '19-3094.00': 'Government & Public Service',  # Political Scientists
    '21-1021.00': 'Government & Public Service',  # Social Workers
    '21-1093.00': 'Government & Public Service',  # Social and Human Service Assistants
}


def soc_to_category(soc_code):
    """Derive a display category from an O*NET SOC code."""
    if not soc_code:
        return DEFAULT_CATEGORY
    if soc_code in SOC_OVERRIDE:
        return SOC_OVERRIDE[soc_code]
    for prefix, category in SOC_CATEGORY_MAP:
        if soc_code.startswith(prefix):
            return category
    return DEFAULT_CATEGORY


# ── Occupation candidate pool (populated from O*NET on first use) ─────────────
OCCUPATION_CANDIDATES = []          # list of (title, soc_code)
OCCUPATION_CANDIDATE_EMBEDDINGS = None  # parallel list of embeddings


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
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.decode('utf-8', 'ignore').strip() or 'semantic embedding failed')
    output = completed.stdout.decode('utf-8', 'ignore').strip()
    if not output:
        raise RuntimeError('semantic embedding returned no output')
    data = json.loads(output)
    if isinstance(data, list) and data and isinstance(data[0], list):
        return data
    return [data]


def get_embedding(text):
    embeddings = run_semantic_embeddings([normalize_text(text)])
    return embeddings[0]


def cosine_similarity(vec1, vec2):
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    dot = sum(a * b for a, b in zip(vec1, vec2))
    norm1 = sum(a * a for a in vec1) ** 0.5
    norm2 = sum(b * b for b in vec2) ** 0.5
    return dot / (norm1 * norm2) if norm1 and norm2 else 0.0


def init_occupation_candidate_embeddings():
    """
    Populate OCCUPATION_CANDIDATES with the full O*NET occupation list
    and compute embeddings of all occupation titles for semantic matching.
    """
    global OCCUPATION_CANDIDATES, OCCUPATION_CANDIDATE_EMBEDDINGS
    if OCCUPATION_CANDIDATE_EMBEDDINGS is not None:
        return
    try:
        onet_module = load_onet_fetcher_module()
        all_occupations = onet_module.get_all_onet_occupations()   # [(soc, title), ...]
        if not all_occupations:
            print('  Warning: O*NET occupation list is empty — semantic matching will be skipped.')
            OCCUPATION_CANDIDATES = []
            OCCUPATION_CANDIDATE_EMBEDDINGS = []
            return

        OCCUPATION_CANDIDATES = [(title, soc) for soc, title in all_occupations]
        titles = [normalize_text(title) for title, _ in OCCUPATION_CANDIDATES]
        OCCUPATION_CANDIDATE_EMBEDDINGS = run_semantic_embeddings(titles)
    except Exception as exc:
        print(f'Occupation candidate embedding init failed: {exc}')
        OCCUPATION_CANDIDATES = []
        OCCUPATION_CANDIDATE_EMBEDDINGS = []


def choose_semantic_soc(label):
    """
    Semantically match a raw occupation label to the closest O*NET SOC code
    by comparing the label embedding against all official O*NET occupation titles.
    Returns (soc_code, category) or (None, None) on failure.
    """
    if not USE_SEMANTIC_OCCUPATION or not label:
        return None, None
    try:
        init_occupation_candidate_embeddings()
        if not OCCUPATION_CANDIDATE_EMBEDDINGS or not OCCUPATION_CANDIDATES:
            return None, None
        label_emb = get_embedding(normalize_text(label))
        best_score = 0.0
        best_soc = None
        for (title, soc), cand_emb in zip(OCCUPATION_CANDIDATES, OCCUPATION_CANDIDATE_EMBEDDINGS):
            score = cosine_similarity(label_emb, cand_emb)
            if score > best_score:
                best_score = score
                best_soc = soc
        if not best_soc:
            return None, None
        return best_soc, soc_to_category(best_soc)
    except Exception as exc:
        print(f'Semantic occupation mapping failed: {exc}')
        return None, None

# ── Degree normalisation ──────────────────────────────────────────────────────
DEGREE_NORM = {
    'bachelor':"Bachelor's",'bachelors':"Bachelor's",
    'ba':'B.A.','bs':'B.S.','bsc':'B.Sc.','be':'B.E.','btech':'B.Tech',
    'undergraduate':'Undergraduate',
    'master':"Master's",'masters':"Master's",
    'ma':'M.A.','ms':'M.S.','msc':'M.Sc.','mtech':'M.Tech','mba':'MBA',
    'phd':'PhD','doctorate':'Doctorate','doctoral':'Doctorate',
    'jd':'J.D.','md':'M.D.','postgrad':'Postgraduate','divinity':'M.Div.',
}

POSTGRAD_DEGREES = {'PhD','Doctorate','M.D.','J.D.','M.A.','M.S.','M.Sc.','M.Tech','MBA',
                    "Master's",'Postgraduate','M.Div.'}

# ── Year extractor ────────────────────────────────────────────────────────────
YEAR_RE = re.compile(r'\b(19[0-9]{2}|20[0-2][0-9])\b')

def first_year(text):
    m = YEAR_RE.search(text)
    return m.group(1) if m else ''

# ── School name extractor ─────────────────────────────────────────────────────
# Pattern: "X High School / Secondary School / Prep School"
SCHOOL_RE = re.compile(
    r'([A-Z][A-Za-z\'\.\-]+'
    r'(?:\s+[A-Z][A-Za-z\'\.\-]+){0,5}'
    r'\s+(?:High School|Secondary School|Preparatory School|Prep School|Grammar School|Gymnasium))',
)

def find_school(sents):
    """Return the best school name from education sentences, or None."""
    text = ' '.join(sents)
    m = SCHOOL_RE.search(text)
    if m:
        name = m.group(1).strip()
        if len(name) < 70:
            return name
    # Fallback: "X High School" in lower text
    fb = re.search(r'([A-Z][A-Za-z\s\'\.\-]{3,40}High School)', text)
    if fb:
        return fb.group(1).strip()
    return None

# ── University name extractor ─────────────────────────────────────────────────
UNI_RE = re.compile(
    r'([A-Z][A-Za-z\'\.\-]+'
    r'(?:\s+(?:of|for|and|de|van|von)\s+[A-Z][A-Za-z\'\.\-]+|\s+[A-Z][A-Za-z\'\.\-]+){0,5}'
    r'\s+(?:University|College|Institute(?:\s+of\s+Technology)?|Conservatory|Academy|Seminary|Polytechnic))',
)

# Also catch "college for/at X University" style sentences
COLLEGE_FOR_RE = re.compile(
    r'(?:college|university)\s+(?:for|at|basketball|football|baseball|soccer|sports)\s+'
    r'(?:the\s+)?([A-Z][A-Za-z\s\'\.\-]+?)(?:\s+(?:Seawolves|Wolverines|Wildcats|Tigers|Eagles|Knights|Bears|'
    r'Cardinals|Bulldogs|Trojans|Spartans|Longhorns|Aggies|Cowboys|Panthers|Gators|Volunteers|Tar\s+Heels|'
    r'Jayhawks|Ducks|Beavers|Huskies|Bruins|Buffaloes|Rebels|Mean\s+Green|'
    r'[A-Z][a-z]+s)\b|,|\.)',
    re.IGNORECASE
)

DEGREE_RE = re.compile(
    r'\b(bachelor(?:\'s)?|bachelors?|B\.?A\.?|B\.?S\.?|B\.?Sc\.?|B\.?E\.?|B\.?Tech'
    r'|undergraduate|master(?:\'s)?|masters?|M\.?A\.?|M\.?S\.?|M\.?Sc\.?|M\.?Tech|M\.?B\.?A'
    r'|Ph\.?D\.?|doctorate|doctoral|J\.?D\.?|M\.?D\.?|postgrad(?:uate)?|divinity)\b',
    re.IGNORECASE
)

def find_university(sents):
    """Return (degree, university_name, field, year) from college sentences."""
    text = ' '.join(sents)

    # Degree
    dm = DEGREE_RE.search(text)
    degree = ''
    if dm:
        key = dm.group(1).lower().replace('.','').replace("'",'').replace(' ','')
        degree = DEGREE_NORM.get(key, dm.group(1).title())

    # University name — standard pattern first
    uni = ''
    for m in UNI_RE.finditer(text):
        name = m.group(1).strip()
        if 4 < len(name) < 60:
            uni = name
            break

    # Fallback: "played college X for the Y University/team"
    if not uni:
        m2 = COLLEGE_FOR_RE.search(text)
        if m2:
            cand = m2.group(1).strip()
            if 3 < len(cand) < 50:
                uni = cand

    # Also try: "attended X University" simple pattern
    if not uni:
        m3 = re.search(r'(?:attended|enrolled (?:in|at)|studied at)\s+([A-Z][A-Za-z\s\'\.\-]{3,50}?)(?=[,.\(]|$)', text)
        if m3:
            cand = m3.group(1).strip().rstrip('.,')
            if any(w in cand for w in ['University','College','Institute','Academy','School','Conservatory']):
                uni = cand[:60]
            elif len(cand.split()) <= 4 and cand[0].isupper():
                uni = cand

    # Clean up any partial prepositions accidentally captured
    uni = re.sub(r'^(?:for the|at the|for|at|the)\s+', '', uni).strip()
    uni = re.sub(r'\s+and\s*$', '', uni).strip()
    if len(uni) < 3:
        uni = ''

    # Field of study — several patterns, in order of specificity
    field = ''

    # Pattern 1: "degree in X", "bachelor in X", "master in X", "PhD in X"
    fm1 = re.search(
        r'(?:degree|bachelor(?:\'s)?|master(?:\'s)?|ph\.?d|doctorate|'
        r'specializ(?:ed|ing)|major(?:ed|ing)?)\s+(?:of\s+\w+\s+)?in\s+'
        r'([\w][\w\s]{2,40}?)(?:\s+(?:from|at|,|\.|\()|$)',
        text, re.I)
    if fm1:
        candidate = fm1.group(1).strip().title()
        if candidate.lower() not in ('the','a','an','his','her','their','which'):
            field = candidate

    # Pattern 2: "Bachelor of Science/Arts/Commerce in X"
    if not field:
        fm2 = re.search(
            r'(?:Bachelor|Master|Doctor)\s+of\s+(?:Science|Arts|Commerce|Laws|Medicine|'
            r'Fine Arts|Engineering|Education|Business|Technology)\s+(?:degree\s+)?in\s+'
            r'([\w][\w\s]{2,40}?)(?:\s+(?:from|at|,|\.|\()|$)',
            text, re.I)
        if fm2:
            field = fm2.group(1).strip().title()

    # Pattern 3: "Bachelor of Science degree in geosciences" (no "in" before subject)
    if not field:
        fm3 = re.search(
            r'(?:Bachelor|Master|Doctor)\s+of\s+([\w\s]{3,30}?)\s+degree(?:\s+in\s+'
            r'([\w][\w\s]{2,30}?))?(?:\s+(?:from|at|,|\.|\()|$)',
            text, re.I)
        if fm3:
            # prefer the "in X" part, fall back to degree subject
            field = (fm3.group(2) or fm3.group(1) or '').strip().title()

    # Clean up
    if field and field.lower() in ('the','a','an','his','her','their','which','science',
                                   'arts','commerce','laws','medicine','technology'):
        field = ''

    # Year — only from sentences that mention the person's own attendance
    # Avoid years from historical references (e.g., 1923 from a dissertation subject)
    year = ''
    for s in sents:
        # Skip sentences about other people or historical references
        if re.search(r'dissertation|subject|thesis|research|named after|founded in', s, re.I):
            continue
        y = first_year(s)
        if y:
            year = y
            break

    return degree, uni, field, year

# ── Career / org extractor ────────────────────────────────────────────────────
# Known major sports teams, companies, institutions — to rank importance
PRESTIGE_ORGS = [
    # Sports leagues / top teams
    'NBA','NFL','MLB','NHL','KBL','CMLL','AAA','UFC','PGA',
    'New York Times','Times','BBC','CNN','Reuters','Associated Press',
    'Supreme Court','Congress','Senate','Parliament','United Nations',
    'Metropolitan Museum','Smithsonian','White House',
    'Harvard','Oxford','Cambridge','MIT','Stanford','Yale',
]

ORG_PATTERNS = [
    # "signed with X", "joined X", "played for X", "worked for X"
    re.compile(
        r'(?:signed with|joined|played for|worked (?:for|at)|reported for|'
        r'served (?:at|with|for)|appointed (?:to|as)|hired (?:by|at)|'
        r'employed (?:by|at)|contracted (?:by|with))\s+(?:the\s+)?'
        r'([A-Z][A-Za-z\'\.\-&\s]{2,50}?)(?=[,.\(\n]|$)',
        re.IGNORECASE
    ),
    # "at the X" when X is a proper org
    re.compile(
        r'(?:at|for)\s+the\s+([A-Z][A-Za-z\'\.\-&\s]{2,50}?)(?=[,.\(\n]|$)',
    ),
]

ROLE_PATTERNS = re.compile(
    r'(?:served as|worked as|appointed as|became|named)\s+(?:a\s+|an\s+)?'
    r'([A-Z][A-Za-z\s\-]{3,40}?)(?=[,.\(]|$)',
)

def find_career_stage(work_sents, occ_label):
    """
    Return (role, organisation) for the single most significant career stage.
    Priority: most prestigious/specific org mentioned.
    """
    candidates = []  # list of (role, org, prestige_score)

    for s in work_sents:
        # Skip intro sentences
        if re.search(r'\(born|\bis an?\b.*\bplayer\b|\bis an?\b.*\bactor\b', s, re.I):
            continue

        org = ''
        for pat in ORG_PATTERNS:
            m = pat.search(s)
            if m:
                cand = m.group(1).strip().rstrip('.,;')
                # Must be at least 2 words or a known acronym, max 50 chars
                if (len(cand.split()) >= 2 or cand.upper() == cand) and len(cand) < 50:
                    org = cand
                    break

        role = ''
        rm = ROLE_PATTERNS.search(s)
        if rm:
            role = rm.group(1).strip().rstrip('.,;')
            role = ' '.join(role.split()[:5])

        if not org and not role:
            continue

        # Reject orgs that look like awards, events, or long phrases (not actual employers)
        bad_org_re = re.compile(
            r'\b(prize|award|championship|cup|tournament|medal|trophy|'
            r'framework|initiative|committee|advisory|component|'
            r'series|season|round|game|match|episode|position)\b', re.IGNORECASE)
        if org and bad_org_re.search(org):
            org = ''

        # Clean partial prepositions
        org = re.sub(r'^(?:for the|at the|for|at|the)\s+', '', org).strip()
        org = re.sub(r"'s\s*$", '', org).strip()

        # Reject orgs that are too short (1 word, not a known acronym)
        KNOWN_ACRONYMS = {'NBA','NFL','MLB','NHL','KBL','UEFA','FIFA','UFC',
                          'PGA','BBC','CNN','CBS','NBC','ABC','ESPN','UN','WHO'}
        if org and len(org.split()) == 1 and org not in KNOWN_ACRONYMS:
            org = ''

        if not org and not role:
            continue

        score = 0
        for po in PRESTIGE_ORGS:
            if po.lower() in (org + ' ' + s).lower():
                score += 2
        if org:
            score += 1

        candidates.append((role, org, score))

    if not candidates:
        return occ_label, ''

    # Pick highest score
    candidates.sort(key=lambda x: -x[2])
    best_role, best_org, _ = candidates[0]

    # If no specific role extracted, use occ_label
    if not best_role:
        best_role = occ_label

    return best_role, best_org


# ── Stage builder ─────────────────────────────────────────────────────────────

def make_stage(stage_type, stage_name, what, where, field, year, skills, suggestions):
    return {
        'stageType':   stage_type,
        'stageName':   stage_name,
        'what':        what,
        'where':       where,
        'field':       field,
        'year':        year,
        'skills':      skills,
        'suggestions': suggestions,
        # legacy fields kept empty
        'education':'','experience':'','livingConditions':'','helpReceived':'','ageRange':'',
    }


def build_stages(sbl, skill_names, occ_label):
    """
    Build a clean, non-redundant set of career progression stages.
    Max stages: school → undergraduate → postgraduate → career role
    """
    edu_sents  = sbl.get('Education', [])
    work_sents = sbl.get('Work Experience', [])

    stages = []

    # ── Split education sentences: HS vs college vs postgrad ────────────────
    hs_sents, ug_sents, pg_sents = [], [], []

    for s in edu_sents:
        sl = s.lower()
        is_hs = bool(re.search(
            r'high school|secondary school|prep school|preparatory|gymnasium|grade school', sl))
        is_pg = bool(re.search(
            r'ph\.?d|doctorate|doctoral|master|m\.a|m\.s|mba|j\.d|m\.d|postgrad|divinity', sl))
        is_ug = bool(re.search(
            r'bachelor|undergraduate|b\.a|b\.s|b\.sc|college|university|institute|conservatory|academy', sl))

        if is_hs and not is_ug and not is_pg:
            hs_sents.append(s)
        elif is_pg:
            pg_sents.append(s)
        elif is_ug:
            ug_sents.append(s)
        else:
            # Ambiguous — assign to HS if nothing found yet, else UG
            (hs_sents if not hs_sents and not ug_sents else ug_sents).append(s)

    # ── Stage 1: School ──────────────────────────────────────────────────────
    if hs_sents:
        school = find_school(hs_sents) or 'High School'
        yr = first_year(' '.join(hs_sents))
        stages.append(make_stage(
            'school', school,
            what='High School / Secondary Education',
            where=school, field='General Education', year=yr,
            skills=[],   # no O*NET job skills at school level
            suggestions='Build a strong academic foundation and explore your interests.',
        ))

    # ── Stage 2: Undergraduate ───────────────────────────────────────────────
    if ug_sents:
        degree, uni, field, yr = find_university(ug_sents)
        # Stage name: "Bachelor's in East Asian Languages, Indiana University"
        if degree and field and uni:
            sname = '{} in {}, {}'.format(degree, field, uni)
        elif degree and field:
            sname = '{} in {}'.format(degree, field)
        elif degree and uni:
            sname = '{}, {}'.format(degree, uni)
        elif uni:
            sname = uni
        elif degree:
            sname = '{} Studies'.format(degree)
        else:
            sname = 'Undergraduate Studies'
        # what = the qualification description
        what = '{} in {}'.format(degree, field) if (degree and field) \
               else degree if degree else 'Undergraduate'
        stages.append(make_stage(
            'undergraduate', sname,
            what=what, where=uni, field=field, year=yr,
            skills=skill_names[:2],   # only 2 foundational skills at this stage
            suggestions='Go beyond the syllabus — internships and projects matter as much as grades.',
        ))

    # ── Stage 3: Postgraduate (only if explicitly mentioned) ────────────────
    if pg_sents:
        degree, uni, field, yr = find_university(pg_sents)
        if not degree:
            dm = DEGREE_RE.search(' '.join(pg_sents))
            if dm:
                key = dm.group(1).lower().replace('.','').replace("'",'').replace(' ','')
                degree = DEGREE_NORM.get(key, dm.group(1).title())
        if degree or uni:
            if degree and field and uni:
                sname = '{} in {}, {}'.format(degree, field, uni)
            elif degree and field:
                sname = '{} in {}'.format(degree, field)
            elif degree and uni:
                sname = '{}, {}'.format(degree, uni)
            elif uni:
                sname = uni
            else:
                sname = '{} Studies'.format(degree)
            what = '{} in {}'.format(degree, field) if (degree and field) \
                   else degree if degree else 'Postgraduate'
            stages.append(make_stage(
                'postgraduate', sname,
                what=what, where=uni, field=field, year=yr,
                skills=skill_names[:4],   # more skills at postgrad level
                suggestions='Specialize deeply — your postgrad focus often defines your career trajectory.',
            ))

    # ── Stage 4: Career (single, most significant) ──────────────────────────
    # Combine work + achievement sentences to find the best org
    career_sents = work_sents + sbl.get('Achievements', [])
    role, org = find_career_stage(career_sents, occ_label)

    # Stage name: "Professional Basketball Player, Seoul SK Knights"
    # or just "Screenwriter" if no specific org found
    if org:
        sname = '{}, {}'.format(occ_label, org)
        what  = role if role != occ_label else occ_label
        where = org
    else:
        sname = occ_label
        what  = role if role else occ_label
        where = ''

    yr = first_year(' '.join(career_sents)) if career_sents else ''

    # Advice from Learnings sentences
    learn_sents = sbl.get('Learnings', [])
    career_tip = learn_sents[0][:200] if learn_sents else \
                 'Stay persistent, keep building your network, and never stop learning.'

    stages.append(make_stage(
        'job', sname,
        what=what, where=where, field=occ_label, year=yr,
        skills=skill_names,
        suggestions=career_tip,
    ))

    return stages


def build_transitions(stages):
    transitions = []
    for i in range(len(stages) - 1):
        transitions.append({
            'fromStage': stages[i]['stageName'],
            'toStage':   stages[i+1]['stageName'],
            'optionsAvailable': [],
            'reasonChosen': 'Followed passion and seized the right opportunity.',
            'mistakes': '',
            'advice': 'Be open to unexpected paths — the journey rarely looks like the plan.',
        })
    return transitions


# ── Metadata helpers ──────────────────────────────────────────────────────────

def load_onet_fetcher_module():
    module_path = os.path.join(SCRIPT_DIR, 'onet_fetch_skills.py')
    spec = importlib.util.spec_from_file_location('onet_fetch_skills', module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Unable to load O*NET fetcher from {module_path}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ONET_FETCHER_MODULE = None


def get_onet_skills(soc_code):
    """Return cached O*NET skills for a SOC code. Returns [] on any failure."""
    global ONET_FETCHER_MODULE
    if ONET_FETCHER_MODULE is None:
        ONET_FETCHER_MODULE = load_onet_fetcher_module()
    try:
        return ONET_FETCHER_MODULE.fetch_all_skills(soc_code)
    except Exception as exc:
        print(f'  get_onet_skills({soc_code}) failed: {exc}')
        return []


def get_occupation_info(bio_row, onet_module):
    l3 = bio_row.get('level3_main_occ','').strip()
    l2 = bio_row.get('level2_main_occ','').strip()
    l1 = bio_row.get('level1_main_occ','').strip()
    raw_label = l3 or l2 or l1

    soc, cat = None, DEFAULT_CATEGORY

    if raw_label:
        try:
            # Step 1: Try O*NET keyword search for an exact title-token match
            soc = onet_module.choose_soc_from_search(raw_label)
            if soc:
                cat = soc_to_category(soc)
            else:
                # Step 2: Semantic similarity against full O*NET occupation titles
                soc, cat = choose_semantic_soc(raw_label)
        except Exception as exc:
            print(f'  SOC resolution failed for "{raw_label}": {exc}')

    if not soc:
        soc = DEFAULT_SOC
        cat = DEFAULT_CATEGORY

    raw   = get_onet_skills(soc)[:TOP_N_SKILLS]
    names = [s['skillName'] for s in raw if s.get('skillName')]
    objs  = [{'skillName': s['skillName'], 'onetCode': s.get('onetCode',''),
              'description': s.get('description', '')} for s in raw if s.get('skillName')]
    return cat, names, objs

def derive_gender(bio_row):
    g = bio_row.get('gender','').strip()
    return g if g in ('Male','Female') else ''

def derive_background(bio_row):
    r = bio_row.get('un_subregion','').strip()
    urban = {'Northern America','Western Europe','Northern Europe','Southern Europe',
             'Eastern Europe','Australia and New Zealand'}
    if r in urban: return 'Urban'
    if 'Africa' in r: return 'Rural'
    return 'Semi-Urban' if r else ''

def derive_edu_history(stages):
    """Build compact string: 'Roselle Catholic High School → B.A., Stony Brook University'"""
    parts = []
    for s in stages:
        if s['stageType'] in ('school','undergraduate','postgraduate','training'):
            parts.append(s['stageName'])
    return ' → '.join(parts) if parts else ''


def clean_llm_json_text(text):
    if not text:
        return ''
    text = text.strip()
    if text.startswith('```json'):
        text = text[7:]
    if text.startswith('```'):
        text = text[3:]
    if text.endswith('```'):
        text = text[:-3]
    return text.strip()


# ── Gemini API call ───────────────────────────────────────────────────────────

# Shared flag — set to True when a 429 is received so subsequent records
# skip the LLM call immediately without wasting retry attempts.
_GEMINI_CREDITS_DEPLETED = False

import http.client as _gemini_http
import ssl as _gemini_ssl
import socket as _gemini_socket

_GEMINI_HOST    = 'generativelanguage.googleapis.com'
_GEMINI_SSL_CTX = _gemini_ssl.create_default_context()


class _TimeoutGeminiHTTPS(_gemini_http.HTTPSConnection):
    """HTTPSConnection that enforces timeout during SSL handshake on Windows."""
    def connect(self):
        raw = _gemini_socket.create_connection((self.host, self.port), timeout=self.timeout)
        raw.settimeout(self.timeout)
        self.sock = _GEMINI_SSL_CTX.wrap_socket(raw, server_hostname=self.host)


def call_gemini(prompt_text):
    """
    Send a prompt to Gemini and return the text response.
    Uses http.client with manual socket timeout (urllib SSL hangs on Windows).
    Returns the raw text string or None on failure.

    Sets _GEMINI_CREDITS_DEPLETED=True on a 429 so the rest of the pipeline
    falls back to regex immediately without burning retry time.
    """
    global _GEMINI_CREDITS_DEPLETED

    if not GEMINI_API_KEY:
        print('  [Gemini] GEMINI_API_KEY not set — skipping LLM extraction.')
        return None

    if _GEMINI_CREDITS_DEPLETED:
        return None   # silent fast-path once we know credits are gone

    payload = json.dumps({
        'contents': [{'parts': [{'text': prompt_text}]}],
        'generationConfig': {
            'temperature':      0.2,
            'responseMimeType': 'application/json',
        },
    }).encode('utf-8')

    # Normalize model name (env may include or omit the "models/" prefix)
    _model = GEMINI_MODEL
    if _model.startswith('models/'):
        _model = _model[len('models/'):]
    path = f'/v1beta/models/{_model}:generateContent?key={GEMINI_API_KEY}'

    for attempt in range(1, GEMINI_MAX_RETRIES + 1):
        conn = _TimeoutGeminiHTTPS(_GEMINI_HOST, timeout=45)
        try:
            conn.request('POST', path, body=payload,
                         headers={'Content-Type': 'application/json'})
            resp = conn.getresponse()
            body_bytes = resp.read()
            body_str   = body_bytes.decode('utf-8', 'ignore')

            if resp.status == 429:
                snippet = body_str[:200]
                print(f'  [Gemini] HTTP 429 (attempt {attempt}): {snippet}')
                if 'depleted' in body_str.lower() or 'prepayment' in body_str.lower():
                    print('  [Gemini] Credits depleted — switching to regex-only for remaining records.')
                    _GEMINI_CREDITS_DEPLETED = True
                    return None
                # Temporary rate-limit — wait and retry
                if attempt < GEMINI_MAX_RETRIES:
                    time.sleep(GEMINI_RETRY_DELAY * attempt)
                    continue
                return None

            if resp.status >= 400:
                snippet = body_str[:200]
                print(f'  [Gemini] HTTP {resp.status} (attempt {attempt}): {snippet}')
                if attempt < GEMINI_MAX_RETRIES and resp.status in (500, 503):
                    time.sleep(GEMINI_RETRY_DELAY * attempt)
                    continue
                return None

            data = json.loads(body_str)
            candidates = data.get('candidates', [])
            if not candidates:
                print(f'  [Gemini] No candidates in response (attempt {attempt})')
                return None
            parts = candidates[0].get('content', {}).get('parts', [])
            if not parts:
                print(f'  [Gemini] No parts in candidate (attempt {attempt})')
                return None
            return parts[0].get('text', '')

        except Exception as exc:
            print(f'  [Gemini] Error (attempt {attempt}): {type(exc).__name__}: {exc}')
            if attempt < GEMINI_MAX_RETRIES:
                time.sleep(GEMINI_RETRY_DELAY)
                continue
            return None
        finally:
            conn.close()

    return None


# ── Validation helpers ────────────────────────────────────────────────────────

VALID_STAGE_TYPES = {'school', 'undergraduate', 'postgraduate', 'job', 'training', 'senior_role'}

def validate_stage(stage):
    """
    Validate and normalise a single stage dict from the LLM.
    Returns a cleaned stage dict, or None if the stage is unusable.
    """
    if not isinstance(stage, dict):
        return None

    stage_name = str(stage.get('stageName') or stage.get('stage_name') or '').strip()
    if not stage_name:
        return None

    stage_type = str(stage.get('stageType') or stage.get('stage_type') or 'job').strip().lower()
    if stage_type not in VALID_STAGE_TYPES:
        stage_type = 'job'

    skills_raw = stage.get('skills') or []
    if isinstance(skills_raw, str):
        skills_raw = [s.strip() for s in skills_raw.split(',') if s.strip()]
    skills = [str(s).strip() for s in skills_raw if str(s).strip()][:8]

    return {
        'stageType':      stage_type,
        'stageName':      stage_name[:120],
        'what':           str(stage.get('what')        or '').strip()[:120],
        'where':          str(stage.get('where')       or '').strip()[:120],
        'field':          str(stage.get('field')       or '').strip()[:80],
        'year':           str(stage.get('year')        or '').strip()[:10],
        'skills':         skills,
        'suggestions':    str(stage.get('suggestions') or '').strip()[:400],
        'education':      '',
        'experience':     '',
        'livingConditions': '',
        'helpReceived':   '',
        'ageRange':       '',
    }


def validate_llm_output(raw):
    """
    Validate the full LLM JSON payload for a career path.
    Returns a cleaned dict, or None if the payload is not usable.

    Rules:
    - Must have at least 1 valid stage
    - title must be non-empty
    - category must be non-empty
    - stages with invalid stageType or empty stageName are dropped
    - transitions are validated from LLM if present, otherwise re-derived
    """
    if not isinstance(raw, dict):
        return None

    title = str(raw.get('title') or '').strip()
    if not title:
        return None

    category = str(raw.get('category') or '').strip() or DEFAULT_CATEGORY

    stages_raw = raw.get('stages') or []
    if not isinstance(stages_raw, list):
        return None

    stages = []
    for s in stages_raw:
        validated = validate_stage(s)
        if validated:
            stages.append(validated)

    if not stages:
        return None

    # Enforce stage ordering: school → undergraduate → postgraduate → job
    # Drop duplicate stageTypes (keep first encountered)
    seen_types = set()
    ordered_stages = []
    type_order = ['school', 'undergraduate', 'postgraduate', 'training', 'job', 'senior_role']
    stages_by_type = defaultdict(list)
    for s in stages:
        stages_by_type[s['stageType']].append(s)

    for t in type_order:
        if t in stages_by_type:
            ordered_stages.append(stages_by_type[t][0])   # keep first of each type

    # Any remaining types not in order list
    for s in stages:
        if s not in ordered_stages:
            ordered_stages.append(s)

    if not ordered_stages:
        return None

    skills_raw = raw.get('submitterSkills') or []
    if isinstance(skills_raw, str):
        skills_raw = [x.strip() for x in skills_raw.split(',') if x.strip()]
    submitter_skills = [str(s).strip() for s in skills_raw if str(s).strip()][:12]

    # Validate transitions from LLM if present
    llm_transitions = raw.get('transitions')
    valid_transitions = []
    if isinstance(llm_transitions, list) and len(llm_transitions) > 0:
        for t in llm_transitions:
            if isinstance(t, dict) and t.get('fromStage') and t.get('toStage'):
                valid_transitions.append({
                    'fromStage': str(t.get('fromStage')).strip(),
                    'toStage': str(t.get('toStage')).strip(),
                    'optionsAvailable': [str(o).strip() for o in (t.get('optionsAvailable') or []) if str(o).strip()],
                    'reasonChosen': str(t.get('reasonChosen') or '').strip(),
                    'mistakes': str(t.get('mistakes') or '').strip(),
                    'advice': str(t.get('advice') or '').strip(),
                })
    if not valid_transitions:
        valid_transitions = build_transitions(ordered_stages)

    return {
        'title':                     title[:200],
        'category':                  category,
        'description':               str(raw.get('description') or '').strip()[:500],
        'submitterSkills':           submitter_skills,
        'submitterEducationHistory': str(raw.get('submitterEducationHistory') or '').strip()[:300],
        'submitterBackground':       str(raw.get('submitterBackground') or '').strip(),
        'submitterEconomicStatus':   str(raw.get('submitterEconomicStatus') or '').strip(),
        'stages':                    ordered_stages,
        'transitions':               valid_transitions,
    }


# ── LLM extraction (Gemini) ───────────────────────────────────────────────────

def call_llm_extract(person_data, bio_row, category, skill_names, occ_label):
    """
    Use Gemini to extract a structured career path from the labelled biography
    sentences. Returns a validated dict or None if extraction fails.
    """
    if not USE_LLM:
        return None

    if not GEMINI_API_KEY:
        print('  [Gemini] No API key — LLM disabled. Set GEMINI_API_KEY in .env')
        return None

    # Build text blocks from labelled sentences
    labels = ['Background', 'Education', 'Work Experience', 'Achievements', 'Learnings']
    text_blocks = []
    sbl = person_data.get('sents_by_label', {})
    for label in labels:
        sentences = sbl.get(label, [])
        if sentences:
            joined = ' '.join(sentences[:5])
            text_blocks.append(f'[{label}] {joined}')

    name        = bio_row.get('name', '').replace('_', ' ')
    gender_hint = bio_row.get('gender', '')
    region_hint = bio_row.get('un_subregion', '')

    prompt = f"""You are a structured career-path extraction assistant.

Extract a career path from the biography data below. Return ONLY a valid JSON object — no markdown, no explanation.

Required JSON schema:
{{
  "title": "Occupation — Person Name  (e.g. 'Lawyer & Professor — Anita Hill')",
  "category": "one of: Sports & Athletics | Creative Fields | Government & Public Service | Law & Administration | Commerce & Management | Research & Academia | Engineering & Tech | Medical | Skilled Trades | Rural / Non-traditional | Other",
  "description": "2–3 sentence summary of the career journey (not a biography intro)",
  "submitterSkills": ["skill1", "skill2"],
  "submitterEducationHistory": "10th → College → Job  (compact arrow-separated string)",
  "submitterBackground": "Rural | Urban | Semi-Urban | Tribal",
  "submitterEconomicStatus": "Poor | Middle | Rich",
  "stages": [
    {{
      "stageType": "school | undergraduate | postgraduate | job",
      "stageName": "Short descriptive name  e.g. 'Morris High School' or 'B.S. in Psychology, Oklahoma State University'",
      "what": "qualification or role title",
      "where": "institution or organisation name",
      "field": "subject or industry",
      "year": "year or empty string",
      "skills": ["skill relevant at this stage"],
      "suggestions": "1–2 sentence practical advice for someone aiming for this stage"
    }}
  ],
  "transitions": [
    {{
      "fromStage": "Exact stageName of starting stage",
      "toStage": "Exact stageName of destination stage",
      "optionsAvailable": ["option1", "option2"],
      "reasonChosen": "Why this path was chosen",
      "advice": "Actionable advice for this specific transition"
    }}
  ]
}}

Rules:
- Include AT MOST: 1 school stage, 1 undergraduate stage, 1 postgraduate stage, 1 job stage
- Every stage MUST have a non-empty stageName and stageType
- The job stage must name the most significant employer or role
- Include transitions connecting each stage to the next in sequence with options, reason, and advice
- suggestions must be actionable advice for the career seeker, NOT a description of the person
- description must describe the career journey, NOT just restate the first biography sentence
- Do NOT include achievement stages or award stages
- If a field is unknown, use an empty string ""

Few-shot Example Output:
{{
  "wikidataId": "Q2850177",
  "title": "Lawyer & Professor — Anita Hill",
  "category": "Law & Administration",
  "description": "Anita Hill's career spans legal practice in civil rights, trailblazing tenured law professorships, national advocacy for gender equality, and leading social policy research as University Professor at Brandeis University.",
  "submitterName": "Anita Hill",
  "submitterGender": "Female",
  "submitterEducationHistory": "Morris High School (1973) → Oklahoma State University (B.S., 1977) → Yale Law School (J.D., 1980) → Brandeis University",
  "submitterSkills": [
    "Legal Analysis",
    "Civil Rights Law",
    "Public Policy Reform",
    "Academic Research",
    "Commercial Law",
    "Public Speaking",
    "Gender Studies & Advocacy",
    "Ethical Leadership"
  ],
  "submitterBackground": "Rural",
  "submitterEconomicStatus": "Middle",
  "stages": [
    {{
      "stageType": "school",
      "stageName": "Morris High School",
      "what": "High School Diploma (Valedictorian)",
      "where": "Morris High School, Oklahoma",
      "field": "General Education",
      "year": "1973",
      "skills": ["Academic Excellence", "Leadership", "Critical Thinking"],
      "suggestions": "Build strong study habits and aim for high academic standing early; top honors unlock college entry and scholarship opportunities."
    }},
    {{
      "stageType": "undergraduate",
      "stageName": "B.S. in Psychology, Oklahoma State University",
      "what": "B.S. in Psychology",
      "where": "Oklahoma State University",
      "field": "Psychology",
      "year": "1977",
      "skills": ["Behavioral Analysis", "Research Methods", "Analytical Writing"],
      "suggestions": "Focus on foundational social sciences to prepare for specialized law or graduate degrees."
    }},
    {{
      "stageType": "postgraduate",
      "stageName": "J.D., Yale Law School",
      "what": "Juris Doctor (J.D.)",
      "where": "Yale Law School",
      "field": "Law",
      "year": "1980",
      "skills": ["Legal Research", "Constitutional & Civil Rights Law", "Jurisprudence", "Contract Law"],
      "suggestions": "Master legal research and statutory interpretation; rigorous law school training provides tools for systemic advocacy."
    }},
    {{
      "stageType": "job",
      "stageName": "Professor of Law and Social Policy, Brandeis University",
      "what": "University Professor of Social Policy, Law, and Women's Studies",
      "where": "Brandeis University",
      "field": "Law & Social Policy",
      "year": "1998",
      "skills": [
        "Legal Education",
        "Public Policy Reform",
        "Civil Rights Advocacy",
        "Gender & Equality Research",
        "Public Speaking"
      ],
      "suggestions": "Leverage research and teaching platforms to address pressing social inequities and drive lasting structural change."
    }}
  ],
  "transitions": [
    {{
      "fromStage": "Morris High School",
      "toStage": "B.S. in Psychology, Oklahoma State University",
      "optionsAvailable": ["Local workforce", "State university degree"],
      "reasonChosen": "Sought higher education to expand academic and career horizons.",
      "advice": "Maintain valedictorian-level focus in secondary school to secure university admissions."
    }},
    {{
      "fromStage": "B.S. in Psychology, Oklahoma State University",
      "toStage": "J.D., Yale Law School",
      "optionsAvailable": ["Graduate psychology program", "Corporate entry-level job", "Professional law school"],
      "reasonChosen": "Transitioned to law to combine analytical skills with formal advocacy for civil rights.",
      "advice": "Develop strong logical reasoning and writing skills in college for success on the LSAT and in law school."
    }},
    {{
      "fromStage": "J.D., Yale Law School",
      "toStage": "Professor of Law and Social Policy, Brandeis University",
      "optionsAvailable": ["Private law firm partner", "Government civil service", "Tenured academic career"],
      "reasonChosen": "Moved into academia to educate future lawyers, publish foundational policy research, and advocate for gender and racial equality.",
      "advice": "Combine early practice experience in legal/government sectors with scholarly publishing to build a successful academic career."
    }}
  ]
}}

Context hints:
- Name: {name}
- Category hint: {category}
- Gender: {gender_hint}
- Region: {region_hint}
- O*NET skills for this occupation: {', '.join(skill_names[:6]) if skill_names else 'not available'}

Biography data:
{chr(10).join(text_blocks)}
"""

    raw_text = call_gemini(prompt)
    if not raw_text:
        return None

    cleaned = clean_llm_json_text(raw_text)
    if not cleaned:
        return None

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        print(f'  [Gemini] JSON parse error for {name}: {exc}')
        return None

    validated = validate_llm_output(parsed)
    if not validated:
        print(f'  [Gemini] Validation failed for {name} — falling back to regex')
        return None

    return validated


def apply_llm_enrichment(cp, llm_payload):
    """
    Merge a validated LLM payload into the base career-path dict.
    LLM output takes precedence for all fields it provides; O*NET
    skills and wikidata metadata are always preserved from cp.
    """
    if not isinstance(llm_payload, dict):
        return cp

    for field in ('title', 'description', 'submitterEducationHistory',
                  'submitterBackground', 'submitterEconomicStatus'):
        val = llm_payload.get(field)
        if val and str(val).strip():
            cp[field] = str(val).strip()

    # Merge skills: prefer LLM skills but keep O*NET skills if LLM returns none
    llm_skills = llm_payload.get('submitterSkills')
    if isinstance(llm_skills, list) and llm_skills:
        cp['submitterSkills'] = [str(s).strip() for s in llm_skills if str(s).strip()][:12]

    # Replace category only if LLM returned a non-empty value
    llm_cat = llm_payload.get('category', '').strip()
    if llm_cat:
        cp['category'] = llm_cat

    # Replace stages + transitions fully if LLM returned valid stages
    llm_stages = llm_payload.get('stages')
    if isinstance(llm_stages, list) and len(llm_stages) >= 1:
        # Re-inject O*NET skills into each stage (LLM stage skills replace them,
        # but if a stage has no skills, fall back to the O*NET list)
        onet_skill_names = [s['skillName'] for s in cp.get('onetSkills', [])]
        for i, stage in enumerate(llm_stages):
            if not stage.get('skills'):
                # Assign proportional O*NET skills as placeholder
                if stage['stageType'] == 'school':
                    stage['skills'] = []
                elif stage['stageType'] == 'undergraduate':
                    stage['skills'] = onet_skill_names[:2]
                elif stage['stageType'] == 'postgraduate':
                    stage['skills'] = onet_skill_names[:4]
                else:
                    stage['skills'] = onet_skill_names[:8]

        cp['stages'] = llm_stages
        
        # Preserve LLM transitions if present, otherwise build fallback transitions
        llm_transitions = llm_payload.get('transitions')
        if isinstance(llm_transitions, list) and len(llm_transitions) > 0:
            cp['transitions'] = llm_transitions
        else:
            cp['transitions'] = build_transitions(llm_stages)
            
        cp['submitterEducationHistory'] = derive_edu_history(llm_stages)

    return cp


# ── Main career path builder ──────────────────────────────────────────────────

def build_career_path(wid, person_data, bio_row, category, skill_names, onet_obj):
    sbl = person_data['sents_by_label']
    occ_raw   = bio_row.get('level3_main_occ', bio_row.get('level2_main_occ',''))
    occ_label = occ_raw.replace('_',' ').title() if occ_raw else category

    # ── Base: regex-based stage extraction (always runs as foundation / fallback)
    stages = build_stages(sbl, skill_names, occ_label)
    if not stages: return None

    transitions = build_transitions(stages)
    name  = bio_row.get('name', wid).replace('_',' ')
    title = '{} — {}'.format(occ_label, name)

    bg_sents  = sbl.get('Background',   [])
    ach_sents = sbl.get('Achievements', [])
    desc_parts = bg_sents[:1] + ach_sents[:1]
    description = ' '.join(desc_parts)[:400] if desc_parts else \
                  'Career path of {}, a {}.'.format(name, occ_label.lower())

    cp = {
        'title':                     title,
        'category':                  category,
        'description':               description,
        'submitterName':             name,
        'submitterEmail':            '',
        'submitterGender':           derive_gender(bio_row),
        'submitterEducationHistory': derive_edu_history(stages),
        'submitterSkills':           skill_names,
        'submitterBackground':       derive_background(bio_row),
        'submitterEconomicStatus':   'Middle',
        'stages':                    stages,
        'transitions':               transitions,
        'isSeeded':                  True,
        'status':                    'approved',
        'wikidataId':                wid,
        'onetSkills':                onet_obj,
    }

    # ── LLM enrichment: overwrite regex output with Gemini extraction ─────────
    llm_payload = call_llm_extract(person_data, bio_row, category, skill_names, occ_label)
    if llm_payload:
        cp = apply_llm_enrichment(cp, llm_payload)

    return cp


# ── Pipeline ──────────────────────────────────────────────────────────────────

def run_pipeline():
    print('=' * 60)
    print('Career Path Pipeline  (Gemini LLM: {})'.format('ON' if USE_LLM else 'OFF'))
    print('=' * 60)

    if USE_LLM and not GEMINI_API_KEY:
        print('\n⚠  WARNING: USE_LLM=true but GEMINI_API_KEY is not set.')
        print('   Set GEMINI_API_KEY in backend/.env and re-run.')
        print('   Falling back to regex-only extraction for this run.\n')

    # ── Load dataset (Prefer unified 1,000 dataset if available) ──────────────
    bio_data = {}
    persons  = {}

    if os.path.exists(UNIFIED_CSV):
        print(f'Loading unified dataset from {os.path.basename(UNIFIED_CSV)}...')
        with open(UNIFIED_CSV, encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                wid = row.get('Wikidata_ID','').strip()
                if not wid: continue

                if wid not in bio_data:
                    bio_data[wid] = row

                text = row.get('text','').strip()
                raw_label = row.get('label','').strip()
                labels = [l.strip() for l in raw_label.replace(';',',').split(',') if l.strip() and l.strip() != 'Others']
                if not labels: continue

                if wid not in persons:
                    persons[wid] = {'title': row.get('title','').strip(), 'sents_by_label': defaultdict(list)}
                for label in labels:
                    persons[wid]['sents_by_label'][label].append(text)
        print(f'Loaded {len(persons)} person records from {os.path.basename(UNIFIED_CSV)}')
    else:
        # Fallback to loading original split files
        with open(BIO_CSV, encoding='utf-8') as f:
            for row in csv.DictReader(f):
                wid = row.get('Wikidata_ID','').strip()
                if wid: bio_data[wid] = row
        print(f'Loaded {len(bio_data)} biography rows')

        with open(FEW_SHOT_CSV, encoding='utf-8-sig') as f:
            for row in csv.DictReader(f):
                wid   = row['Wikidata_ID']
                text  = row['text'].strip()
                labels= [l.strip() for l in row['label'].split(';') if l.strip() != 'Others']
                if not labels: continue
                if wid not in persons:
                    persons[wid] = {'title':row['title'], 'sents_by_label':defaultdict(list)}
                for label in labels:
                    persons[wid]['sents_by_label'][label].append(text)
        print(f'Loaded {len(persons)} person records')

    # ── Resume: load already-processed paths from disk ────────────────────────
    # If the output file exists from a previous (possibly crashed) run, load it
    # so we can skip already-done wikidata IDs and append new ones.
    career_paths = []
    done_wids    = set()
    if os.path.exists(OUTPUT_JSON):
        try:
            with open(OUTPUT_JSON, encoding='utf-8') as f:
                existing = json.load(f)
            if isinstance(existing, list) and existing:
                career_paths = existing
                done_wids    = {cp.get('wikidataId','') for cp in career_paths if cp.get('wikidataId')}
                print(f'Resuming: {len(done_wids)} already processed, '
                      f'{len(persons) - len(done_wids)} remaining\n')
            else:
                print('Starting fresh (output file is empty)\n')
        except Exception:
            print('Could not read existing output — starting fresh\n')
    else:
        print('Starting fresh\n')

    # ── Load O*NET fetcher module once ────────────────────────────────────────
    onet_module = load_onet_fetcher_module()

    # ── Process each person ───────────────────────────────────────────────────
    stage_dist   = defaultdict(int)
    llm_success  = 0
    llm_fallback = 0
    errors       = 0
    total        = len(persons)
    processed    = 0   # count for this run only

    for idx, (wid, person_data) in enumerate(persons.items(), 1):
        # Skip already-done wikidata IDs (resume support)
        if wid in done_wids:
            continue

        name = person_data['title'].replace('_', ' ')
        print(f'  [{idx:3}/{total}] {name}', end=' ... ', flush=True)

        try:
            bio_row = bio_data.get(wid, {})
            category, skill_names, onet_obj = get_occupation_info(bio_row, onet_module)

            used_llm_before = USE_LLM and bool(GEMINI_API_KEY)

            cp = build_career_path(wid, person_data, bio_row, category, skill_names, onet_obj)
            if not cp:
                print('SKIP (no stages)')
                errors += 1
                continue

            regex_title = '{} — {}'.format(
                (bio_row.get('level3_main_occ') or bio_row.get('level2_main_occ') or category).replace('_',' ').title(),
                bio_row.get('name', wid).replace('_',' ')
            )
            if used_llm_before and cp.get('title') != regex_title:
                llm_success += 1
                print(f'✓ LLM  [{category}]')
            else:
                llm_fallback += 1
                print(f'~ regex [{category}]')

            stage_dist[len(cp['stages'])] += 1
            career_paths.append(cp)
            done_wids.add(wid)
            processed += 1

            # ── Incremental save every 10 records ────────────────────────────
            # This means a crash loses at most 9 records, not everything.
            if processed % 10 == 0:
                with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
                    json.dump(career_paths, f, ensure_ascii=False, indent=2)

        except Exception as exc:
            print(f'ERROR: {exc}')
            errors += 1

        # Polite delay between Gemini calls to avoid rate-limit
        if USE_LLM and GEMINI_API_KEY and processed % 10 == 0:
            time.sleep(1)

    # ── Final save ────────────────────────────────────────────────────────────
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(career_paths, f, ensure_ascii=False, indent=2)

    print(f'\n── Pipeline Summary {"─"*40}')
    print(f'   Total persons:        {total}')
    print(f'   Already done (skip):  {len(done_wids) - processed}')
    print(f'   Processed this run:   {processed}')
    print(f'   Career paths in file: {len(career_paths)}')
    print(f'   LLM-enriched:         {llm_success}')
    print(f'   Regex fallback:       {llm_fallback}')
    print(f'   Errors/skipped:       {errors}')
    print(f'   Stages per path:      {dict(sorted(stage_dist.items()))}')
    print(f'   Output:               {OUTPUT_JSON}')
    print()

    # ── Sample output preview ─────────────────────────────────────────────────
    print('── Sample outputs ──────────────────────────────────────')
    for cp in career_paths[:4]:
        print('\n  {} [{}]'.format(cp['title'], cp['category']))
        print('  ' + cp['description'][:120] + ('…' if len(cp['description']) > 120 else ''))
        for s in cp['stages']:
            print('    → [{}] {}  |  {}  |  {}'.format(
                s['stageType'], s['stageName'][:50],
                s['what'][:30], s['where'][:30]))
    print('\n' + '='*60)
    return career_paths


if __name__ == '__main__':
    run_pipeline()
