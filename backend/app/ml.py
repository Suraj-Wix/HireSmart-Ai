"""Modular ML pipeline: parsing -> preprocessing -> skills -> JD analysis -> similarity -> ranking."""
import io, os, re
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.metrics import precision_recall_fscore_support, ndcg_score

MAX_BYTES = 5 * 1024 * 1024
# skill -> related skills (used for "related" matches)
TAXONOMY = {
    "python": ["django", "flask", "fastapi"], "fastapi": ["flask", "python"], "django": ["flask", "python"],
    "flask": ["fastapi", "django"], "java": ["spring", "kotlin"], "spring": ["java"], "javascript": ["typescript", "node.js"],
    "typescript": ["javascript"], "react": ["vue", "angular", "javascript"], "vue": ["react"], "angular": ["react"],
    "node.js": ["javascript", "express"], "sql": ["postgresql", "mysql"], "postgresql": ["mysql", "sql"], "mysql": ["postgresql", "sql"],
    "mongodb": ["postgresql"], "docker": ["kubernetes"], "kubernetes": ["docker"], "aws": ["azure", "gcp"], "azure": ["aws", "gcp"],
    "gcp": ["aws", "azure"], "machine learning": ["scikit-learn", "tensorflow", "pytorch", "nlp"], "nlp": ["machine learning", "spacy"],
    "scikit-learn": ["machine learning"], "tensorflow": ["pytorch"], "pytorch": ["tensorflow"], "spacy": ["nlp"], "pandas": ["numpy"],
    "numpy": ["pandas"], "tailwind css": ["css"], "css": ["html"], "html": ["css"], "git": [], "ci/cd": ["docker", "git"],
    "rest api": ["fastapi", "flask"], "tableau": ["power bi"], "power bi": ["tableau"], "excel": [], "communication": [], "leadership": [],
}
SKILLS = sorted(TAXONOMY, key=len, reverse=True)
EDU = ["phd", "doctorate", "master", "m.tech", "mba", "msc", "m.sc", "bachelor", "b.tech", "b.e.", "bsc", "b.sc", "diploma"]

def extract_text(filename: str, data: bytes) -> str:
    ext = os.path.splitext(filename.lower())[1]
    if ext not in (".pdf", ".docx"): raise ValueError("Only PDF and DOCX files are allowed")
    if not data or len(data) > MAX_BYTES: raise ValueError("File empty or larger than 5 MB")
    if ext == ".pdf":
        if not data.startswith(b"%PDF"): raise ValueError("Not a valid PDF")
        import fitz
        with fitz.open(stream=data, filetype="pdf") as d: return "\n".join(p.get_text() for p in d)
    if not data.startswith(b"PK"): raise ValueError("Not a valid DOCX")
    import docx
    return "\n".join(p.text for p in docx.Document(io.BytesIO(data)).paragraphs)

def preprocess(text: str) -> str:
    text = re.sub(r"\S+@\S+", " ", text.lower())
    return re.sub(r"[^a-z0-9+#./ ]+", " ", text)

def extract_skills(text: str) -> list:
    t = text.lower()
    return sorted({s for s in SKILLS if re.search(r"(?<![a-z0-9])" + re.escape(s) + r"(?![a-z0-9])", t)})

def parse_resume(text: str) -> dict:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    email = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
    name = next((l for l in lines[:5] if "@" not in l and not re.search(r"\d", l) and len(l.split()) <= 4), "Unknown")
    yrs = [int(m) for m in re.findall(r"(\d{1,2})\+?\s*(?:years|yrs)", text.lower())]
    return {"name": name, "email": email.group(0) if email else "",
            "education": sorted({e for e in EDU if e in text.lower()}),
            "skills": extract_skills(text), "experience_years": max(yrs) if yrs else 0}

def analyze_job(text: str) -> dict:
    parts = re.split(r"(?i)nice to have|preferred|optional|bonus", text, maxsplit=1)
    req = extract_skills(parts[0]); opt = [s for s in extract_skills(parts[1]) if s not in req] if len(parts) > 1 else []
    m = re.search(r"(\d{1,2})\+?\s*(?:years|yrs)", text.lower())
    return {"required": req, "optional": opt, "min_years": int(m.group(1)) if m else 0}

_st = None
def semantic_sim(job_text: str, resumes: list):
    """Sentence-Transformers if enabled and installed; else local TF-IDF char n-gram baseline."""
    global _st
    if os.getenv("USE_TRANSFORMERS") == "1":
        try:
            if _st is None:
                from sentence_transformers import SentenceTransformer
                _st = SentenceTransformer("all-MiniLM-L6-v2")
            e = _st.encode([job_text] + resumes, normalize_embeddings=True)
            return (e[1:] @ e[0]).clip(0, 1), "sentence-transformers"
        except Exception: pass
    v = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5)).fit([job_text] + resumes)
    return cosine_similarity(v.transform([job_text]), v.transform(resumes))[0], "tfidf-char-ngram (baseline)"

WEIGHTS = {"required_skills": 0.45, "optional_skills": 0.10, "tfidf": 0.20, "semantic": 0.15, "experience": 0.10}

def rank(job_text: str, job: dict, candidates: list) -> list:
    """candidates: [{id, text, skills, experience_years}] -> scored, sorted list. Uses no personal/sensitive attributes."""
    if not candidates: return []
    docs = [preprocess(c["text"]) for c in candidates]; jt = preprocess(job_text)
    v = TfidfVectorizer(stop_words="english", ngram_range=(1, 2)).fit(docs + [jt])
    tf = cosine_similarity(v.transform([jt]), v.transform(docs))[0]
    sem, method = semantic_sim(jt, docs)
    out = []
    for c, t, s in zip(candidates, tf, sem):
        have = set(c["skills"]); req, opt = job["required"], job["optional"]
        matched = [x for x in req if x in have]; missing = [x for x in req if x not in have]
        related = sorted({r for x in missing for r in TAXONOMY.get(x, []) if r in have})
        om = [x for x in opt if x in have]
        rs = len(matched) / len(req) if req else 0.0
        os_ = len(om) / len(opt) if opt else 0.0
        ex = min(c["experience_years"] / job["min_years"], 1) if job["min_years"] else 1.0
        parts = {"required_skills": rs, "optional_skills": os_, "tfidf": float(t), "semantic": float(s), "experience": ex}
        score = round(100 * sum(WEIGHTS[k] * parts[k] for k in WEIGHTS), 1)
        out.append({"id": c["id"], "score": score, "matched": matched, "missing": missing, "related": related,
                    "optional_matched": om, "breakdown": {k: round(parts[k] * WEIGHTS[k] * 100, 1) for k in WEIGHTS},
                    "semantic_method": method,
                    "explanation": f"Matched {len(matched)}/{len(req)} required skills; experience {c['experience_years']}y vs {job['min_years']}y asked. "
                                   "Score is a weighted similarity index, not a probability. Decision rests with a human recruiter."})
    return sorted(out, key=lambda r: -r["score"])

def evaluate(y_true: list, y_pred: list, rel_true: list = None, scores: list = None) -> dict:
    """Run only when labelled data exists. y_*: 1=suitable. Optional graded relevance for nDCG."""
    p, r, f, _ = precision_recall_fscore_support(y_true, y_pred, average="binary", zero_division=0)
    res = {"precision": p, "recall": r, "f1": f, "n": len(y_true)}
    if rel_true is not None and scores is not None and len(rel_true) > 1:
        res["ndcg"] = float(ndcg_score(np.array([rel_true]), np.array([scores])))
    return res
