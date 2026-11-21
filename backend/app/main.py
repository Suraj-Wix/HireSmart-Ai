import csv, io, json, os, time, hashlib, hmac, secrets, smtplib, mimetypes
from typing import List
from email.message import EmailMessage
from datetime import datetime, timedelta
import jwt
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Float, Text, ForeignKey, DateTime, LargeBinary, func
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

# Separate tables keep the existing candidates table/database compatible.
class ResumeFile(Base):
    __tablename__ = "resume_files"
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), primary_key=True)
    filename = Column(String, nullable=False)
    content_type = Column(String, nullable=False)
    data = Column(LargeBinary, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class CandidateMeta(Base):
    __tablename__ = "candidate_meta"
    candidate_id = Column(Integer, ForeignKey("candidates.id", ondelete="CASCADE"), primary_key=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    seen_at = Column(DateTime, nullable=True)

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
class CandidateEmailIn(BaseModel): subject: str | None = None; body: str | None = None

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
            raw = await f.read()
            if not raw:
                raise ValueError("The uploaded file is empty")
            text = ml.extract_text(f.filename, raw); p = ml.parse_resume(text)
            c = Candidate(name=p["name"], email=p["email"], education=json.dumps(p["education"]), skills=json.dumps(p["skills"]), experience_years=p["experience_years"], text=text, filename=f.filename)
            s.add(c); s.flush()
            content_type = f.content_type or mimetypes.guess_type(f.filename)[0] or "application/octet-stream"
            s.add(ResumeFile(candidate_id=c.id, filename=f.filename, content_type=content_type, data=raw))
            s.add(CandidateMeta(candidate_id=c.id))
            s.commit(); res.append({"file": f.filename, "ok": True, "candidate": cdict(c)})
        except Exception as e:
            s.rollback()
            res.append({"file": f.filename, "ok": False, "error": str(e)})
    log(s, f"{sum(r['ok'] for r in res)} resume(s) uploaded"); return res
@app.get("/api/candidates")
def cands(u=Depends(user), s: Session = Depends(db)): return [cdict(c) for c in s.query(Candidate)]
@app.get("/api/candidates/{cid}/resume")
def get_resume(cid: int, u=Depends(user), s: Session = Depends(db)):
    stored = s.get(ResumeFile, cid)
    if not stored:
        raise HTTPException(404, "Original resume file is not stored. Please upload this candidate's resume again.")
    safe_name = stored.filename.replace('"', "")
    return Response(content=stored.data, media_type=stored.content_type,
                    headers={"Content-Disposition": f'inline; filename="{safe_name}"'})

@app.post("/api/candidates/{cid}/seen")
def mark_seen(cid: int, u=Depends(writer), s: Session = Depends(db)):
    c = s.get(Candidate, cid)
    if not c:
        raise HTTPException(404, "Candidate not found")
    meta = s.get(CandidateMeta, cid)
    if not meta:
        meta = CandidateMeta(candidate_id=cid)
        s.add(meta)
    meta.seen_at = datetime.utcnow()
    s.commit()
    return {"ok": True, "candidate_id": cid, "seen": True, "seen_at": meta.seen_at.isoformat()}

@app.get("/api/candidates/seen")
def seen_candidates(u=Depends(user), s: Session = Depends(db)):
    return [row.candidate_id for row in s.query(CandidateMeta).filter(CandidateMeta.seen_at.isnot(None)).all()]

@app.get("/api/talent-pool")
def talent_pool(u=Depends(user), s: Session = Depends(db)):
    cutoff = datetime.utcnow() - timedelta(days=90)
    rows = (s.query(Candidate, CandidateMeta)
            .join(CandidateMeta, CandidateMeta.candidate_id == Candidate.id)
            .filter(CandidateMeta.uploaded_at >= cutoff)
            .filter(~s.query(Match).filter(Match.candidate_id == Candidate.id, Match.decision == "shortlisted").exists())
            .order_by(CandidateMeta.uploaded_at.desc()).all())
    return [{**cdict(c), "uploaded_at": meta.uploaded_at.isoformat(),
             "expires_at": (meta.uploaded_at + timedelta(days=90)).isoformat()} for c, meta in rows]

@app.post("/api/candidates/{cid}/send-email")
def send_candidate_email(cid: int, email_type: str, job_id: int | None = None, payload: CandidateEmailIn | None = None, u=Depends(writer), s: Session = Depends(db)):
    c = s.get(Candidate, cid)
    if not c:
        raise HTTPException(404, "Candidate not found")
    if not c.email:
        raise HTTPException(400, "Candidate email address is missing")
    if email_type not in ("shortlisted", "rejected"):
        raise HTTPException(400, "email_type must be shortlisted or rejected")

    host = os.getenv("SMTP_HOST")
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM") or username
    if not all((host, username, password, sender)):
        raise HTTPException(503, "Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD and SMTP_FROM, then restart the backend.")

    if email_type == "shortlisted":
        subject = "Update on your application - Next Interview Round"
        body = f"Dear {c.name or 'Candidate'},\n\nThank you for your application. We are pleased to inform you that you have been shortlisted for the next round. Our team will share the next steps shortly.\n\nRegards,\nRecruitment Team"
    else:
        subject = "Update on your job application"
        body = f"Dear {c.name or 'Candidate'},\n\nThank you for your interest and the time you invested in the application process. After careful review, we will not be moving forward with your application at this time. We appreciate your interest and wish you success.\n\nRegards,\nRecruitment Team"

    if payload is not None:
        if payload.subject and payload.subject.strip():
            subject = payload.subject.strip()
        if payload.body and payload.body.strip():
            body = payload.body.strip()

    # Identify the sender's company and include the relevant role + ATS result.
    company_name = os.getenv("COMPANY_NAME", "Your Company").strip() or "Your Company"
    match_query = s.query(Match, Job).join(Job, Job.id == Match.job_id).filter(Match.candidate_id == cid)
    if job_id is not None:
        match_query = match_query.filter(Match.job_id == job_id)
    match_row = match_query.order_by(Match.id.desc()).first()
    role_title = match_row[1].title if match_row else "Not specified"
    ats_score = match_row[0].score if match_row else None
    detail = json.loads(match_row[0].detail or "{}") if match_row else {}
    matched_skills = detail.get("matched", []) or []
    missing_skills = detail.get("missing", []) or []
    score_text = f"{float(ats_score):.1f}%" if ats_score is not None else "Not available"
    context = (
        f"Company: {company_name}\n"
        f"Position: {role_title}\n"
        f"ATS match score: {score_text}\n"
        f"Matched skills: {', '.join(matched_skills) if matched_skills else 'Not available'}\n"
        f"Skills to develop: {', '.join(missing_skills) if missing_skills else 'Not specified'}\n"
    )
    body = f"{body.rstrip()}\n\n--- Application details ---\n{context}\nRegards,\n{company_name} Recruitment Team\nThis ATS score is an automated matching estimate and is not the sole basis for a hiring decision."
    msg = EmailMessage(); msg["Subject"] = subject; msg["From"] = f"{company_name} Recruitment <{sender}>"; msg["To"] = c.email; msg.set_content(body)
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            smtp.ehlo()
            if os.getenv("SMTP_USE_SSL", "false").lower() == "true":
                raise ValueError("For implicit SSL, configure an SSL SMTP relay; this endpoint uses STARTTLS on port 587.")
            smtp.starttls(); smtp.ehlo(); smtp.login(username, password); smtp.send_message(msg)
    except Exception as exc:
        raise HTTPException(502, f"Email provider failed to send the message: {exc}")

    log(s, f"{email_type} email sent to candidate {cid} by {u.email}")
    return {"ok": True, "message": "Email sent successfully", "candidate_id": cid, "email": c.email}
@app.delete("/api/candidates/{cid}")  # data-protection: allow erasure
def del_c(cid: int, u=Depends(writer), s: Session = Depends(db)):
    s.query(Match).filter_by(candidate_id=cid).delete()
    s.query(ResumeFile).filter_by(candidate_id=cid).delete()
    s.query(CandidateMeta).filter_by(candidate_id=cid).delete()
    s.query(Candidate).filter_by(id=cid).delete(); s.commit(); return {"ok": True}

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
    if decision not in ("shortlisted", "rejected", "review", "on_hold"):
        raise HTTPException(400, "Bad decision")
    m = s.get(Match, mid)
    if not m:
        raise HTTPException(404, "Match not found")
    m.decision = decision
    s.commit()
    log(s, f"Candidate {m.candidate_id} marked {decision} by {u.email}")
    return {"ok": True, "match_id": m.id, "candidate_id": m.candidate_id, "decision": m.decision}
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
