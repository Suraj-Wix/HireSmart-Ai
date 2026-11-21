import os, io; os.environ["DATABASE_URL"] = "sqlite:///./test.db"
from fastapi.testclient import TestClient
from app.main import app
from app import ml
import docx
c = TestClient(app)
t = c.post("/api/auth/register", json={"email": "hr@x.com", "password": "password123"}).json(); H = {"Authorization": "Bearer " + t["token"]}
assert t["role"] == "admin"
c.post("/api/demo/seed", headers=H)
job = c.get("/api/jobs", headers=H).json()[0]; print("JOB", job["required"], job["optional"])
d = docx.Document(); d.add_paragraph("Test Person"); d.add_paragraph("tp@x.com"); d.add_paragraph("Python and FastAPI, 4 years. Docker."); b = io.BytesIO(); d.save(b)
r = c.post("/api/resumes/upload", headers=H, files=[("files", ("a.docx", b.getvalue())), ("files", ("bad.exe", b"MZ"))]).json(); print("UPLOAD", [(x["file"], x["ok"]) for x in r])
for x in c.post(f"/api/jobs/{job['id']}/analyze", headers=H).json(): print(x["score"], x["name"], "missing:", x["missing"], "related:", x["related"])
rk = c.get(f"/api/jobs/{job['id']}/ranking", headers=H).json(); print(c.put(f"/api/matches/{rk[0]['match_id']}/decision?decision=shortlisted", headers=H).json())
print(c.get(f"/api/jobs/{job['id']}/export.csv", headers=H).text.splitlines()[:2]); print(c.get("/api/dashboard", headers=H).json()["avg_score"])
assert c.get("/api/jobs").status_code in (401, 403)
print("EVAL", ml.evaluate([1,0,1,0],[1,0,0,0],[3,0,2,1],[.9,.1,.5,.3]))
