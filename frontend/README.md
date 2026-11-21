# HireSmart AI – AI-Powered Recruitment & Resume Screening System

An intelligent recruitment management platform that helps HR teams manage candidates, analyze resumes, compare skills with job requirements, and streamline the hiring process.

## 🚀 About the Project

**HireSmart AI** is an AI-powered recruitment and resume screening system designed to simplify the hiring process.

The platform allows recruiters to upload resumes, manage job openings, evaluate candidates, view ATS-style matching scores, and manage candidate selection decisions from a centralized dashboard.

It aims to reduce manual resume screening efforts and make recruitment more organized and efficient.

## ✨ Key Features

- **Resume Upload:** Upload candidate resumes in supported PDF and DOCX formats.
- **Resume Parsing:** Extract relevant information and skills from resumes.
- **AI-Based Candidate Matching:** Compare candidate skills with job requirements.
- **ATS Score:** Generate an estimated resume matching score.
- **Candidate Ranking:** Rank candidates based on their matching scores.
- **Job Management:** Create and manage job openings.
- **Candidate Management:** View and manage candidate profiles.
- **Hiring Decisions:** Mark candidates as Shortlisted, Rejected, Under Review, or On Hold.
- **Resume Preview:** Open uploaded original resumes.
- **Email Notifications:** Send shortlisted and rejection emails using Brevo SMTP.
- **Talent Pool:** Maintain eligible candidate records for future recruitment.
- **Dashboard Analytics:** View recruitment statistics and candidate activity.

## 🛠️ Technology Stack

### Frontend
- React.js
- TypeScript
- Vite
- HTML5
- CSS3
- JavaScript

### Backend
- Python
- FastAPI
- SQLAlchemy
- REST API

### Database
- SQLite

### Machine Learning / Data Processing
- Python
- Resume Parsing
- NLP-based text processing
- Scikit-learn (if enabled in the implementation)

### Email Integration
- Brevo SMTP

## 📂 Project Structure

```text
HireSmart-AI/
│
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   └── ...
│   ├── venv/
│   ├── .env
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── assets/
│   │   └── ...
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

*Note: The structure above is representative. Adjust folder names to match your actual project.*

## ⚙️ Installation and Setup

### 1. Clone the Repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd HireSmart-AI
```

### 2. Backend Setup

Open a terminal:

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv venv
```

Activate the environment on Windows:

```powershell
.\venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file inside the `backend` directory.

```env
DATABASE_URL=sqlite:///./hiresmart.db

SECRET_KEY=replace_with_a_secure_secret

USE_TRANSFORMERS=0

COMPANY_NAME=HireSmart-AI

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USERNAME=your_brevo_smtp_login
SMTP_PASSWORD=your_brevo_smtp_key
SMTP_FROM=your_verified_sender_email
```

**Important:**
- Replace all placeholder values with your actual configuration.
- Use a Brevo SMTP key, not a Brevo API key.
- Verify your sender email in Brevo.
- Never upload `.env` or SMTP credentials to GitHub.
- Add `.env` to `.gitignore`.

### 4. Run the Backend

```bash
python -m uvicorn app.main:app --reload
```

Backend URL:

```text
http://127.0.0.1:8000
```

API Documentation:

```text
http://127.0.0.1:8000/docs
```

### 5. Frontend Setup

Open another terminal:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local URL shown in your terminal, usually:

```text
http://localhost:5173
```

## 🔄 Application Workflow

1. Recruiter creates a job opening.
2. Candidate resumes are uploaded.
3. The backend extracts resume information.
4. Candidate skills are compared with job requirements.
5. The system calculates estimated matching scores.
6. Candidates are ranked based on matching scores.
7. HR reviews candidate resumes.
8. HR selects, rejects, or puts candidates on hold.
9. Recruiters can send email notifications to candidates.

## 🔐 Security

- Store sensitive credentials in environment variables.
- Never expose SMTP keys or secret keys in frontend code.
- Keep `.env` out of version control.
- Use secure authentication and authorization.
- Validate uploaded files before processing.

## ⚠️ Important Note

The ATS matching score is an estimated compatibility indicator. It should support recruiter decisions, not replace human evaluation.

Email delivery depends on valid Brevo SMTP credentials and sender verification.

## 🔮 Future Enhancements

- Advanced NLP-based resume analysis.
- AI-powered job recommendations.
- Semantic resume and job matching.
- Interview scheduling and tracking.
- Advanced recruitment analytics.
- Multi-user HR access and role-based permissions.

## 👨‍💻 Developer

**Project:** HireSmart AI  
**Category:** Artificial Intelligence / Machine Learning / Full-Stack Development

## 📄 License

This project is developed for educational and portfolio purposes. Add an appropriate open-source license if you intend to distribute it publicly.
