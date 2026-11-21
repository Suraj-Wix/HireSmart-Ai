import csv, io, json, os, time, hashlib, hmac, secrets
from typing import List
import jwt
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, ForeignKey, DateTime, func
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from . import ml

SECRET = os.getenv("SECRET_KEY", "dev-only-change-me")
engine = create_engine(os.getenv("DATABASE_URL", "sqlite:///./hiresmart.db"))
SessionLocal = sessionmaker(bind=engine); Base = declarative_base()

class User(Base):
    __tablename__ = "users"; id = Column(Integer, primary_key=True); email = Column(String, unique=True, index=True)
    pw = Column(String); role = Column(String, default="hr")  # admin | hr | viewer
class Job(Base):
    __tablename__ = "jobs"; id = Column(Integer, primary_key=True); title = Column(String); description = Column(Text)
    required = Column(Text); optional = Column(Text); min_years = Column(Integer, default=0); active = Column(Integer, default=1)
class Candidate(Base):
    __tablename__ = "candidates"; id = Column(Integer, primary_key=True); name = Column(String); email = Column(String)
    education = Column(Text); skills = Column(Text); experience_years = Column(Integer); text = Column(Text)
    filename = Column(String); is_demo = Column(Integer, default=0)
class Match(Base):
    __tablename__ = "matches"; id = Column(Integer, primary_key=True); job_id = Column(Integer, ForeignKey("jobs.id"))
    candidate_id = Column(Integer, ForeignKey("candidates.id")); score = Column(Float); detail = Column(Text)
    decision = Column(String, default="review")  # shortlisted | rejected | review (human-set only)
class Activity(Base):
    __tablename__ = "activity"; id = Column(Integer, primary_key=True); msg = Column(String); at = Column(DateTime, server_default=func.now())
Base.metadata.create_all(engine)

app = FastAPI(title="HireSmart AI API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("CORS_ORIGINS", "*").split(","), allow_methods=["*"], allow_headers=["*"])
bearer = HTTPBearer()

def db():
    s = SessionLocal()
    try: yield s
    finally: s.close()
def hpw(p, salt=None):
    salt = salt or secrets.token_hex(8); return salt + "$" + hashlib.pbkdf2_hmac("sha256", p.encode(), salt.encode(), 100_000).hex()
def chk(p, h): return hmac.compare_digest(hpw(p, h.split("$")[0]), h)
def token(u): return jwt.encode({"sub": str(u.id), "role": u.role, "exp": time.time() + 86400}, SECRET, "HS256")
def user(c: HTTPAuthorizationCredentials = Depends(bearer), s: Session = Depends(db)):
    try: u = s.get(User, int(jwt.decode(c.credentials, SECRET, ["HS256"])["sub"]))
    except Exception: raise HTTPException(401, "Invalid token")
    if not u: raise HTTPException(401, "Unknown user")
    return u
def writer(u=Depends(user)):
    if u.role not in ("admin", "hr"): raise HTTPException(403, "Read-only role")
    return u
def log(s, m): s.add(Activity(msg=m)); s.commit()

class Cred(BaseModel): email: str; password: str
class JobIn(BaseModel): title: str; description: str

@app.post("/api/auth/register")
def register(c: Cred, s: Session = Depends(db)):
    if len(c.password) < 8: raise HTTPException(400, "Password must be at least 8 characters")
    if s.query(User).filter_by(email=c.email.lower()).first(): raise HTTPException(409, "Email already registered")
    u = User(email=c.email.lower(), pw=hpw(c.password), role="admin" if s.query(User).count() == 0 else "viewer")
    s.add(u); s.commit(); return {"token": token(u), "role": u.role}
@app.post("/api/auth/login")
def login(c: Cred, s: Session = Depends(db)):
    u = s.query(User).filter_by(email=c.email.lower()).first()
    if not u or not chk(c.password, u.pw): raise HTTPException(401, "Invalid credentials")
    return {"token": token(u), "role": u.role}
@app.put("/api/users/{uid}/role")
def set_role(uid: int, role: str, u=Depends(user), s: Session = Depends(db)):
    if u.role != "admin": raise HTTPException(403, "Admins only")
    if role not in ("admin", "hr", "viewer"): raise HTTPException(400, "Bad role")
    t = s.get(User, uid); t.role = role; s.commit(); return {"ok": True}
@app.get("/api/users")
def users(u=Depends(user), s: Session = Depends(db)):
    if u.role != "admin": raise HTTPException(403, "Admins only")
    return [{"id": x.id, "email": x.email, "role": x.role} for x in s.query(User)]

def make_job(s, title, desc):
    a = ml.analyze_job(desc); j = Job(title=title, description=desc, required=json.dumps(a["required"]), optional=json.dumps(a["optional"]), min_years=a["min_years"])
    s.add(j); s.commit(); return j
def jdict(j): return {"id": j.id, "title": j.title, "description": j.description, "required": json.loads(j.required), "optional": json.loads(j.optional), "min_years": j.min_years, "active": bool(j.active)}
@app.post("/api/jobs")
def add_job(b: JobIn, u=Depends(writer), s: Session = Depends(db)):
    j = make_job(s, b.title, b.description); log(s, f"Job created: {j.title}"); return jdict(j)
@app.get("/api/jobs")
def jobs(u=Depends(user), s: Session = Depends(db)): return [jdict(j) for j in s.query(Job)]
@app.delete("/api/jobs/{jid}")
def del_job(jid: int, u=Depends(writer), s: Session = Depends(db)):
    s.query(Match).filter_by(job_id=jid).delete(); s.query(Job).filter_by(id=jid).delete(); s.commit(); return {"ok": True}

def cdict(c): return {"id": c.id, "name": c.name, "email": c.email, "education": json.loads(c.education), "skills": json.loads(c.skills), "experience_years": c.experience_years, "filename": c.filename, "is_demo": bool(c.is_demo)}
@app.post("/api/resumes/upload")
async def upload(files: List[UploadFile] = File(...), u=Depends(writer), s: Session = Depends(db)):
    res = []
    for f in files:
        try:
            text = ml.extract_text(f.filename, await f.read()); p = ml.parse_resume(text)
            c = Candidate(name=p["name"], email=p["email"], education=json.dumps(p["education"]), skills=json.dumps(p["skills"]), experience_years=p["experience_years"], text=text, filename=f.filename)
            s.add(c); s.commit(); res.append({"file": f.filename, "ok": True, "candidate": cdict(c)})
        except Exception as e: res.append({"file": f.filename, "ok": False, "error": str(e)})
    log(s, f"{sum(r['ok'] for r in res)} resume(s) uploaded"); return res
@app.get("/api/candidates")
def cands(u=Depends(user), s: Session = Depends(db)): return [cdict(c) for c in s.query(Candidate)]
@app.delete("/api/candidates/{cid}")  # data-protection: allow erasure
def del_c(cid: int, u=Depends(writer), s: Session = Depends(db)):
    s.query(Match).filter_by(candidate_id=cid).delete(); s.query(Candidate).filter_by(id=cid).delete(); s.commit(); return {"ok": True}

@app.post("/api/jobs/{jid}/analyze")
def analyze(jid: int, u=Depends(writer), s: Session = Depends(db)):
    j = s.get(Job, jid)
    if not j: raise HTTPException(404, "Job not found")
    cs = s.query(Candidate).all()
    ranked = ml.rank(j.description, jdict(j), [{"id": c.id, "text": c.text, "skills": json.loads(c.skills), "experience_years": c.experience_years} for c in cs])
    for r in ranked:
        m = s.query(Match).filter_by(job_id=jid, candidate_id=r["id"]).first() or Match(job_id=jid, candidate_id=r["id"])
        m.score = r["score"]; m.detail = json.dumps(r); s.add(m)  # decision is preserved: never auto-set
    s.commit(); log(s, f"Analysis run for {j.title} ({len(ranked)} candidates)"); return get_ranking(jid, u, s)
@app.get("/api/jobs/{jid}/ranking")
def get_ranking(jid: int, u=Depends(user), s: Session = Depends(db)):
    rows = s.query(Match, Candidate).join(Candidate, Candidate.id == Match.candidate_id).filter(Match.job_id == jid).order_by(Match.score.desc()).all()
    return [{**cdict(c), "score": m.score, "decision": m.decision, "match_id": m.id, **{k: json.loads(m.detail)[k] for k in ("matched", "missing", "related", "breakdown", "explanation", "semantic_method")}} for m, c in rows]
@app.put("/api/matches/{mid}/decision")
def decide(mid: int, decision: str, u=Depends(writer), s: Session = Depends(db)):
    if decision not in ("shortlisted", "rejected", "review"): raise HTTPException(400, "Bad decision")
    m = s.get(Match, mid); m.decision = decision; s.commit(); log(s, f"Candidate {m.candidate_id} marked {decision} by {u.email}"); return {"ok": True}
@app.get("/api/jobs/{jid}/export.csv")
def export(jid: int, u=Depends(user), s: Session = Depends(db)):
    o = io.StringIO(); w = csv.writer(o); w.writerow(["rank", "name", "email", "score", "decision", "matched", "missing", "related"])
    for i, r in enumerate(get_ranking(jid, u, s), 1): w.writerow([i, r["name"], r["email"], r["score"], r["decision"], "; ".join(r["matched"]), "; ".join(r["missing"]), "; ".join(r["related"])])
    return StreamingResponse(iter([o.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=job_{jid}_report.csv"})

@app.get("/api/dashboard")
def dash(u=Depends(user), s: Session = Depends(db)):
    avg = s.query(func.avg(Match.score)).scalar() or 0
    sk = {}
    for c in s.query(Candidate):
        for x in json.loads(c.skills): sk[x] = sk.get(x, 0) + 1
    per_job = [{"job": j.title, "avg": round(s.query(func.avg(Match.score)).filter_by(job_id=j.id).scalar() or 0, 1), "strong": s.query(Match).filter(Match.job_id == j.id, Match.score >= 60).count()} for j in s.query(Job)]
    return {"total_resumes": s.query(Candidate).count(), "active_jobs": s.query(Job).filter_by(active=1).count(),
            "strong_matches": s.query(Match).filter(Match.score >= 60).count(), "avg_score": round(avg, 1),
            "skill_distribution": sorted(sk.items(), key=lambda x: -x[1])[:10], "per_job": per_job,
            "recent": [{"msg": a.msg, "at": str(a.at)} for a in s.query(Activity).order_by(Activity.id.desc()).limit(8)]}

DEMO = [("Aarav Mehta", "Bachelor B.Tech. Python developer with 5 years building FastAPI, PostgreSQL, Docker and AWS services. Machine learning with scikit-learn and NLP with spacy. Git, CI/CD, REST API."),
        ("Priya Nair", "Master MSc. Frontend engineer, 4 years React, TypeScript, JavaScript, Tailwind CSS, HTML, CSS. Some Node.js and Git."),
        ("Rohan Iyer", "Bachelor B.E. Data analyst with 2 years Excel, SQL, Tableau, pandas and Python. Communication and leadership."),
        ("Sara Khan", "Master. Full-stack developer, 6 years Python, Django, React, PostgreSQL, Docker, Kubernetes, Azure, REST API, Git.")]
@app.post("/api/demo/seed")
def seed(u=Depends(writer), s: Session = Depends(db)):
    for n, t in DEMO:
        t = f"{n}\n{n.split()[0].lower()}@demo.example\n[DEMO DATA - synthetic]\n{t}"; p = ml.parse_resume(t)
        s.add(Candidate(name=n, email=p["email"], education=json.dumps(p["education"]), skills=json.dumps(p["skills"]), experience_years=p["experience_years"], text=t, filename="demo", is_demo=1))
    make_job(s, "[DEMO] Backend ML Engineer", "3+ years experience. Required: Python, FastAPI, PostgreSQL, Docker, machine learning, REST API. Nice to have: AWS, Kubernetes, NLP.")
    s.commit(); log(s, "Demo data loaded"); return {"ok": True}
@app.get("/api/health")
def health(): return {"status": "ok"}
