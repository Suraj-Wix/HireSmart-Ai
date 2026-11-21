
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Briefcase,
  BarChart3,
  Settings,
  Search,
  Bell,
  Upload,
  Sparkles,
  Menu,
  X,
  RefreshCw,
  LogOut,
  CheckCircle,
  XCircle,
} from "lucide-react";

import api, { logoutUser } from "./services/api";
import ResumeUpload from "./ResumeUpload";
import Jobs from "./Jobs";

interface DashboardProps {
  role: string;
  onLogout?: () => void;
}

interface DashboardData {
  total_resumes: number;
  active_jobs: number;
  strong_matches: number;
  avg_score: number;
}

interface Job {
  id: number;
  title: string;
}

interface Candidate {
  id: number;
  match_id?: number;
  job_id?: number;
  job_title?: string;
  name?: string;
  email?: string;
  skills?: string[] | string;
  score?: number;
  decision?: string;
  filename?: string;
  matched?: string[];
  missing?: string[];
  related?: string[];
  breakdown?: Record<string, any>;
  explanation?: string;
}

const menu = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Candidates", icon: Users },
  { name: "Talent Pool", icon: Users },
  { name: "Resume Screening", icon: FileText },
  { name: "Jobs", icon: Briefcase },
  { name: "Reports", icon: BarChart3 },
  { name: "Settings", icon: Settings },
];

const getList = (data: any): any[] => {
  if (Array.isArray(data)) return data;

  return (
    data?.candidates ||
    data?.ranking ||
    data?.results ||
    data?.items ||
    []
  );
};

export default function Dashboard({ role, onLogout }: DashboardProps) {
  const [active, setActive] = useState("Overview");
  const [search, setSearch] = useState("");
  const [mobile, setMobile] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [talentPool, setTalentPool] = useState<Candidate[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [emailCandidate, setEmailCandidate] = useState<Candidate | null>(null);
  const [emailType, setEmailType] = useState<"shortlisted" | "rejected">("shortlisted");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [atsCandidate, setAtsCandidate] = useState<Candidate | null>(null);

  // Seen state loaded from backend
  const [seenIds, setSeenIds] = useState<number[]>([]);

  // LOAD DASHBOARD AND ALL JOB RANKINGS
  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");
      setMessage("");

      const [dashboardRes, candidatesRes, jobsRes, seenRes] =
        await Promise.all([
          api.get("/api/dashboard"),
          api.get("/api/candidates"),
          api.get("/api/jobs"),
          api.get("/api/candidates/seen"),
        ]);

      setDashboard(dashboardRes.data);
      setSeenIds(Array.isArray(seenRes.data) ? seenRes.data.map(Number) : []);
      try { const poolRes = await api.get("/api/talent-pool"); setTalentPool(getList(poolRes.data)); } catch { setTalentPool([]); }

      const candidateList: Candidate[] = getList(candidatesRes.data);
      const jobList: Job[] = getList(jobsRes.data);

      setJobs(jobList);

      const rankingResponses = await Promise.all(
        jobList.map(async (job) => {
          try {
            const response = await api.get(
              `/api/jobs/${job.id}/ranking`
            );

            return {
              job,
              ranking: getList(response.data),
            };
          } catch (err) {
            console.error(`Ranking fetch failed for job ${job.id}:`, err);
            return { job, ranking: [] };
          }
        })
      );

      const candidateById = new Map<number, Candidate>(
        candidateList.map((candidate) => [Number(candidate.id), candidate])
      );
      const mergedCandidates: Candidate[] = [];

      rankingResponses.forEach(({ job, ranking }) => {
        ranking.forEach((match: any) => {
          const candidateId = Number(match.id);
          const original = candidateById.get(candidateId);
          if (!original || !candidateId) return;
          mergedCandidates.push({
            ...original,
            ...match,
            id: candidateId,
            match_id: Number(match.match_id),
            job_id: job.id,
            job_title: job.title,
            decision: match.decision || "review",
          });
        });
      });

      const rankedCandidateIds = new Set(mergedCandidates.map((item) => item.id));
      candidateList.forEach((candidate) => {
        if (!rankedCandidateIds.has(Number(candidate.id))) {
          mergedCandidates.push({ ...candidate, decision: "uploaded" });
        }
      });

      setCandidates(mergedCandidates);
    } catch (err: any) {
      console.error("Dashboard error:", err);

      if (err.response?.status === 401) {
        logoutUser();
        onLogout?.();
        return;
      }

      const detail = err.response?.data?.detail;

      setError(
        typeof detail === "string"
          ? detail
          : "Unable to load dashboard data."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleLogout = () => {
    logoutUser();
    onLogout?.();
  };

  // SEARCH CANDIDATES
  const filtered = candidates.filter((candidate) => {
    const name = candidate.name || "";
    const email = candidate.email || "";

    const skills = Array.isArray(candidate.skills)
      ? candidate.skills.join(", ")
      : candidate.skills || "";

    return `${name} ${email} ${skills}`
      .toLowerCase()
      .includes(search.toLowerCase());
  });

  // UPDATE CANDIDATE STATUS
  const updateDecision = async (
    candidate: Candidate,
    decision: "review" | "shortlisted" | "rejected" | "on_hold"
  ) => {
    if (candidate.match_id == null) {
      setError(
        "Match ID not found. Run AI Resume Matching for this candidate first."
      );
      return;
    }

    try {
      setUpdatingId(candidate.match_id);
      setError("");
      setMessage("");

      await api.put(
        `/api/matches/${candidate.match_id}/decision`,
        null,
        { params: { decision } }
      );

      setCandidates((previous) =>
        previous.map((item) =>
          item.match_id === candidate.match_id
            ? { ...item, decision }
            : item
        )
      );

      const label =
        decision === "shortlisted"
          ? "Selected"
          : decision === "rejected"
          ? "Rejected"
          : decision === "on_hold"
          ? "On Hold"
          : "Review";

      setMessage(`${candidate.name || "Candidate"} marked as ${label}.`);
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Unable to update candidate status."
      );
    } finally {
      setUpdatingId(null);
    }
  };

  // REVIEW AND OPEN ORIGINAL RESUME
  const reviewAndViewResume = async (candidate: Candidate) => {
    if (!candidate.id) { setError("Candidate ID not found."); return; }
    const newTab = window.open("", "_blank");
    if (!newTab) { setError("Please allow pop-ups in your browser to view resumes."); return; }
    try {
      setUpdatingId(candidate.match_id ?? candidate.id);
      setError(""); setMessage("");
      if (candidate.match_id != null) {
        await api.put(`/api/matches/${candidate.match_id}/decision`, null, { params: { decision: "review" } });
      }
      const response = await api.get(`/api/candidates/${candidate.id}/resume`, { responseType: "blob" });
      const fileURL = URL.createObjectURL(response.data);
      newTab.location.href = fileURL;
      await api.post(`/api/candidates/${candidate.id}/seen`);
      setSeenIds((previous) => previous.includes(candidate.id) ? previous : [...previous, candidate.id]);
      setCandidates((previous) => previous.map((item) =>
        item.match_id === candidate.match_id && item.id === candidate.id
          ? { ...item, decision: candidate.match_id != null ? "review" : item.decision }
          : item
      ));
      setMessage("Resume opened. Seen status saved permanently.");
      window.setTimeout(() => URL.revokeObjectURL(fileURL), 60000);
    } catch (err: any) {
      newTab.close();
      setError(err.response?.data?.detail || "Unable to open candidate resume.");
    } finally { setUpdatingId(null); }
  };

  const openEmailComposer = (candidate: Candidate, type: "shortlisted" | "rejected") => {
    setEmailCandidate(candidate);
    setEmailType(type);
    setEmailSubject(
      type === "shortlisted"
        ? `Congratulations ${candidate.name || "Candidate"}! You are selected for the next round`
        : `Update on your application - ${candidate.job_title || "Job Application"}`
    );
    setEmailBody(
      type === "shortlisted"
        ? `Dear ${candidate.name || "Candidate"},\\n\\nCongratulations! We are pleased to inform you that you have been selected for the next round of our recruitment process. Our recruitment team will contact you with the next steps.\\n\\nThank you,\\nRecruitment Team`
        : `Dear ${candidate.name || "Candidate"},\\n\\nThank you for applying for the ${candidate.job_title || "position"} role. After careful review, we regret to inform you that you have not been selected for the next round at this time. We appreciate your interest and wish you success in your career.\\n\\nRegards,\\nRecruitment Team`
    );
    setError("");
    setMessage("");
  };

  const sendCandidateEmail = async () => {
    if (!emailCandidate?.id || !emailCandidate.email) return;
    if (!emailSubject.trim() || !emailBody.trim()) {
      setError("Please enter both email subject and message.");
      return;
    }
    try {
      setEmailSending(true);
      setError("");
      const response = await api.post(
        `/api/candidates/${emailCandidate.id}/send-email`,
        { subject: emailSubject, body: emailBody },
        {
          params: {
            email_type: emailType,
            ...(emailCandidate.job_id != null ? { job_id: emailCandidate.job_id } : {}),
          },
        }
      );
      setMessage(response.data?.message || `Email sent successfully to ${emailCandidate.email}.`);
      setEmailCandidate(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to send email. Check SMTP configuration.");
    } finally {
      setEmailSending(false);
    }
  };

  const statusClass = (status?: string) => {
    switch ((status || "").toLowerCase()) {
      case "shortlisted":
        return "bg-green-50 text-green-700";
      case "rejected":
        return "bg-red-50 text-red-700";
      case "review":
        return "bg-blue-50 text-blue-700";
      case "on_hold":
        return "bg-amber-50 text-amber-700";
      default:
        return "bg-slate-100 text-slate-600";
    }
  };

  const stats = [
    {
      title: "Total Resumes",
      value: dashboard?.total_resumes ?? 0,
      Icon: Users,
    },
    {
      title: "Active Jobs",
      value: dashboard?.active_jobs ?? 0,
      Icon: Briefcase,
    },
    {
      title: "Strong Matches",
      value: dashboard?.strong_matches ?? 0,
      Icon: Sparkles,
    },
    {
      title: "Average Match",
      value: `${dashboard?.avg_score ?? 0}%`,
      Icon: BarChart3,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 md:flex">

      {/* MOBILE OVERLAY */}
      {mobile && (
        <div
          onClick={() => setMobile(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}

      {/* SIDEBAR */}
      <aside
        className={`${
          mobile ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-50 w-64 bg-[#101d35] text-white transition-transform md:static md:translate-x-0`}
      >
        <div className="flex items-center gap-3 border-b border-white/10 p-6">
          <div className="rounded-xl bg-blue-600 p-3">
            <Sparkles />
          </div>

          <div>
            <h1 className="text-lg font-bold">HireSmart AI</h1>
            <p className="text-xs text-slate-400">
              Recruitment Intelligence
            </p>
          </div>

          <button
            className="ml-auto md:hidden"
            onClick={() => setMobile(false)}
          >
            <X />
          </button>
        </div>

        <nav className="space-y-2 p-4">
          <p className="mb-4 text-xs uppercase tracking-widest text-slate-500">
            Workspace
          </p>

          {menu.map((item) => (
            <button
              key={item.name}
              onClick={() => {
                setActive(item.name);
                setMobile(false);
                setSearch("");
              }}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm ${
                active === item.name
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <item.icon size={19} />
              {item.name}
            </button>
          ))}
        </nav>

        <div className="absolute bottom-5 left-4 right-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <Sparkles className="mb-2 text-blue-400" />
          <p className="text-sm font-semibold">AI Powered Hiring</p>
          <p className="mt-1 text-xs text-slate-400">
            Smarter recruitment with explainable AI.
          </p>
        </div>
      </aside>

      {/* MAIN */}
      <main className="min-w-0 flex-1">

        {/* HEADER */}
        <header className="flex h-20 items-center justify-between border-b bg-white px-5 md:px-8">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>

            <div>
              <p className="text-xs text-slate-400">
                Workspace / {active}
              </p>
              <h2 className="text-xl font-bold">{active}</h2>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Bell className="text-slate-500" />

            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">
              HR
            </div>

            <span className="hidden text-sm font-semibold sm:block">
              {role === "admin" ? "HR Admin" : "HR User"}
            </span>

            <button
              onClick={handleLogout}
              title="Logout"
              className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-7xl space-y-7 p-5 md:p-8">

          {/* TALENT POOL */}
          {active === "Talent Pool" ? (
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div><h2 className="text-xl font-bold">Talent Pool</h2><p className="mt-1 text-sm text-slate-500">Non-selected candidates retained for up to 90 days.</p></div>
                <button onClick={fetchData} className="rounded-lg border px-3 py-2 text-sm">Refresh</button>
              </div>
              <div className="mt-5 space-y-3">
                {talentPool.map((candidate, index) => (
                  <div key={candidate.id ?? index} className="rounded-xl border p-4">
                    <p className="font-semibold">{candidate.name || "Unnamed Candidate"}</p>
                    <p className="text-sm text-slate-500">{candidate.email || "Email not available"}</p>
                    <p className="mt-2 text-sm">Skills: {Array.isArray(candidate.skills) ? candidate.skills.join(", ") : candidate.skills || "Not available"}</p>
                    <span className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs">Available for future vacancies</span>
                  </div>
                ))}
                {talentPool.length === 0 && <p className="py-5 text-center text-slate-500">No candidates currently in the Talent Pool.</p>}
              </div>
            </section>
          ) : active === "Resume Screening" ? (
            <ResumeUpload />

          ) : active === "Jobs" ? (
            <Jobs />

          ) : active === "Candidates" ? (

            /* ALL CANDIDATES */
            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">All Candidates</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Uploaded candidate resumes
                  </p>
                </div>

                <button
                  onClick={fetchData}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                >
                  <RefreshCw
                    size={16}
                    className={loading ? "animate-spin" : ""}
                  />
                  Refresh
                </button>
              </div>

              <div className="mt-5 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2">
                <Search size={17} className="text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search candidates..."
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>

              <div className="mt-5 space-y-3">
                {filtered.map((candidate, index) => (
                  <div
                    key={candidate.match_id ?? `candidate-${candidate.id}-${index}`}
                    className="rounded-xl border p-4"
                  >
                    <p className="font-bold">
                      {candidate.name || "Unnamed Candidate"}
                    </p>

                    <p className="text-sm text-slate-500">
                      {candidate.email || "Email not available"}
                    </p>

                    <p className="mt-2 text-sm">
                      Skills:{" "}
                      {Array.isArray(candidate.skills)
                        ? candidate.skills.join(", ")
                        : candidate.skills || "Not available"}
                    </p>

                    <p className="mt-2 font-semibold text-blue-700">
                      Match Score:{" "}
                      {candidate.score != null
                        ? `${Number(candidate.score).toFixed(1)}%`
                        : "Not analyzed"}
                    </p>

                    <span
                      className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                        candidate.decision
                      )}`}
                    >
                      {candidate.decision || "Uploaded"}
                    </span>
                  </div>
                ))}

                {!loading && filtered.length === 0 && (
                  <p className="py-5 text-center text-slate-500">
                    No candidates found.
                  </p>
                )}
              </div>
            </section>

          ) : active === "Overview" ? (

            <>
              {/* WELCOME */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    Welcome to HireSmart AI 👋
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    Your intelligent recruitment workspace.
                  </p>
                </div>

                <button
                  onClick={() => setActive("Resume Screening")}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
                >
                  <Upload size={18} />
                  Upload Resumes
                </button>
              </div>

              {loading && (
                <p className="text-sm text-blue-600">
                  Loading dashboard data...
                </p>
              )}

              {/* STATS */}
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {stats.map(({ title, value, Icon }) => (
                  <div
                    key={title}
                    className="rounded-2xl border bg-white p-6 shadow-sm"
                  >
                    <div className="mb-5 inline-flex rounded-xl bg-blue-50 p-3 text-blue-600">
                      <Icon size={22} />
                    </div>

                    <p className="text-sm text-slate-500">{title}</p>

                    <h3 className="mt-2 text-3xl font-bold text-slate-900">
                      {value}
                    </h3>
                  </div>
                ))}
              </div>

              {/* CANDIDATE RANKING */}
              <section className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold">
                      Candidate Ranking
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      Candidates and their latest job match scores
                    </p>
                  </div>

                  <div className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2">
                    <Search size={17} className="text-slate-400" />

                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search candidates..."
                      className="w-40 bg-transparent text-sm outline-none"
                    />
                  </div>

                  <button
                    onClick={fetchData}
                    disabled={loading}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw
                      size={16}
                      className={loading ? "animate-spin" : ""}
                    />
                    Refresh
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {message && (
                    <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
                      {message}
                    </p>
                  )}

                  {error && (
                    <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                      {error}
                    </p>
                  )}
                </div>

                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500">
                      <tr>
                        <th className="p-4">Candidate</th>
                        <th className="p-4">Skills</th>
                        <th className="p-4">Match Score</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filtered.map((candidate, index) => {
                        const score = candidate.score;
                        const isUpdating =
                          updatingId === candidate.match_id;

                        const hasSeen =
                          seenIds.includes(candidate.id);

                        return (
                          <tr
                            key={candidate.match_id ?? `candidate-${candidate.id}-${index}`}
                            className="border-b last:border-0"
                          >
                            <td className="p-4">
                              <p className="font-semibold text-slate-900">
                                {candidate.name || "Unnamed Candidate"}
                              </p>

                              <p className="text-xs text-slate-500">
                                {candidate.email || "Email not available"}
                              </p>

                              {candidate.job_title && (
                                <p className="mt-1 text-xs text-slate-400">
                                  Job: {candidate.job_title}
                                </p>
                              )}
                            </td>

                            <td className="max-w-xs p-4 text-slate-500">
                              {Array.isArray(candidate.skills)
                                ? candidate.skills.join(", ")
                                : candidate.skills || "Not available"}
                            </td>

                            <td className="p-4 font-bold text-blue-700">
                              {score != null
                                ? `${Number(score).toFixed(1)}%`
                                : "Not analyzed"}
                            </td>

                            <td className="p-4">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                                  candidate.decision
                                )}`}
                              >
                                {candidate.decision || "Uploaded"}
                              </span>
                            </td>

                            <td className="p-4">
                              <div className="flex flex-wrap gap-2">

                                {/* REVIEW AND VIEW RESUME */}
                                <button
                                  onClick={() =>
                                    reviewAndViewResume(candidate)
                                  }
                                  disabled={isUpdating}
                                  className={`rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                                    hasSeen
                                      ? "border-green-600 bg-green-50 text-green-700"
                                      : "border-blue-600 text-blue-600"
                                  }`}
                                >
                                  {isUpdating
                                    ? "Opening..."
                                    : hasSeen
                                    ? "Seen"
                                    : "Review"}
                                </button>

                                {/* SELECT */}
                                <button
                                  onClick={() =>
                                    updateDecision(candidate, "shortlisted")
                                  }
                                  disabled={
                                    isUpdating ||
                                    candidate.match_id == null
                                  }
                                  className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                                >
                                  <CheckCircle size={14} />
                                  Select
                                </button>

                                {/* REJECT */}
                                <button
                                  onClick={() =>
                                    updateDecision(candidate, "rejected")
                                  }
                                  disabled={
                                    isUpdating ||
                                    candidate.match_id == null
                                  }
                                  className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                                >
                                  <XCircle size={14} />
                                  Reject
                                </button>
                                <button
                                  onClick={() => openEmailComposer(candidate, "shortlisted")}
                                  disabled={!candidate.email || isUpdating}
                                  className="rounded-lg border border-green-600 px-3 py-2 text-xs font-semibold text-green-700 disabled:opacity-40"
                                >
                                  Message: Selected
                                </button>
                                <button
                                  onClick={() => openEmailComposer(candidate, "rejected")}
                                  disabled={!candidate.email || isUpdating}
                                  className="rounded-lg border border-red-600 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40"
                                >
                                  Message: Rejected
                                </button>
                                <button
                                  onClick={() => setAtsCandidate(candidate)}
                                  disabled={candidate.score == null}
                                  className="rounded-lg border border-indigo-600 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-40"
                                >
                                  View ATS Details
                                </button>
                                <button onClick={() => updateDecision(candidate, "on_hold")} disabled={isUpdating || candidate.match_id == null} className="rounded-lg border border-amber-500 px-3 py-2 text-xs font-semibold text-amber-700 disabled:opacity-40">On Hold</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {!loading && filtered.length === 0 && (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-5 text-center text-slate-500"
                          >
                            No candidates found. Upload resumes to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>

          ) : (

            <section className="rounded-2xl border bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold">{active}</h2>

              <p className="mt-2 text-sm text-slate-500">
                This section is not implemented yet.
              </p>

              <button
                onClick={() => setActive("Overview")}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white"
              >
                Back to Overview
              </button>
            </section>
          )}

          {/* CUSTOM EMAIL COMPOSER */}
          {emailCandidate && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
              <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold">
                      {emailType === "shortlisted" ? "Selection Message" : "Rejection Message"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      To: {emailCandidate.name || "Candidate"} ({emailCandidate.email})
                    </p>
                  </div>
                  <button onClick={() => setEmailCandidate(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">
                    <X />
                  </button>
                </div>

                <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
                  <p><strong>Job:</strong> {emailCandidate.job_title || "Not specified"}</p>
                  <p><strong>ATS Match Score:</strong> {emailCandidate.score != null ? `${Number(emailCandidate.score).toFixed(1)}%` : "Not available"}</p>
                  <p className="mt-1 text-xs text-blue-700">
                    Company name, job title, ATS score and matched/missing skills will be included automatically from backend settings and candidate ranking.
                  </p>
                </div>

                <label className="mt-5 block text-sm font-semibold text-slate-700">Email Subject</label>
                <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500" />

                <label className="mt-4 block text-sm font-semibold text-slate-700">Message</label>
                <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={9} className="mt-2 w-full rounded-lg border px-3 py-3 text-sm outline-none focus:border-blue-500" />

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button onClick={() => setEmailCandidate(null)} disabled={emailSending} className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                  <button onClick={sendCandidateEmail} disabled={emailSending || !emailSubject.trim() || !emailBody.trim()} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${emailType === "shortlisted" ? "bg-green-600" : "bg-red-600"}`}>
                    {emailSending ? "Sending..." : "Send Email"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ATS SCORE DETAILS */}
          {atsCandidate && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4">
              <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold">ATS Match Details</h3>
                    <p className="mt-1 text-sm text-slate-500">{atsCandidate.name} · {atsCandidate.job_title || "Job not specified"}</p>
                  </div>
                  <button onClick={() => setAtsCandidate(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X /></button>
                </div>
                <div className="mt-5 rounded-xl bg-indigo-50 p-5 text-center">
                  <p className="text-sm font-medium text-indigo-700">ATS Match Score</p>
                  <p className="mt-1 text-4xl font-bold text-indigo-900">{atsCandidate.score != null ? `${Number(atsCandidate.score).toFixed(1)}%` : "N/A"}</p>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border p-4">
                    <h4 className="font-semibold text-green-700">Matched Skills</h4>
                    <p className="mt-2 text-sm text-slate-600">{atsCandidate.matched?.length ? atsCandidate.matched.join(", ") : "No matched skills returned."}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <h4 className="font-semibold text-red-700">Missing Skills</h4>
                    <p className="mt-2 text-sm text-slate-600">{atsCandidate.missing?.length ? atsCandidate.missing.join(", ") : "No missing skills returned."}</p>
                  </div>
                  <div className="rounded-xl border p-4 sm:col-span-2">
                    <h4 className="font-semibold text-slate-800">Related Skills</h4>
                    <p className="mt-2 text-sm text-slate-600">{atsCandidate.related?.length ? atsCandidate.related.join(", ") : "No related skills returned."}</p>
                  </div>
                </div>
                {atsCandidate.breakdown && (
                  <div className="mt-4 rounded-xl border p-4">
                    <h4 className="font-semibold">Score Breakdown</h4>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-600">{JSON.stringify(atsCandidate.breakdown, null, 2)}</pre>
                  </div>
                )}
                {atsCandidate.explanation && (
                  <div className="mt-4 rounded-xl border p-4">
                    <h4 className="font-semibold">AI Explanation</h4>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{atsCandidate.explanation}</p>
                  </div>
                )}
                <p className="mt-4 text-xs text-slate-400">ATS score is an automated matching estimate, not a final hiring decision.</p>
                <div className="mt-5 flex justify-end">
                  <button onClick={() => setAtsCandidate(null)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Close</button>
                </div>
              </div>
            </div>
          )}

          <p className="text-center text-xs text-slate-400">
            HireSmart AI · Live backend data · Human decisions required
          </p>
        </div>
      </main>
    </div>
  );
}
