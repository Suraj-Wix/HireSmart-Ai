
import { useEffect, useState } from "react";
import api from "./services/api";

interface Job {
  id: number;
  title: string;
  description: string;
  active: boolean;
}

interface Candidate {
  id: number;
  match_id: number;
  name: string;
  email: string;
  skills: string[];
  score: number;
  matched: string[];
  missing: string[];
  related: string[];
  explanation?: string;
  decision: string;
}

export default function Jobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [ranking, setRanking] = useState<Candidate[]>([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [editingJob, setEditingJob] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const loadJobs = async () => {
    try {
      const response = await api.get("/api/jobs");
      setJobs(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to load jobs.");
    }
  };

  useEffect(() => {
    loadJobs();
  }, []);

  // CREATE JOB
  const createJob = async () => {
    if (!title.trim() || !description.trim()) {
      setError("Please enter job title and description.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");

      const response = await api.post("/api/jobs", {
        title,
        description,
      });

      setJobs((previous) => [...previous, response.data]);
      setSelectedJob(response.data.id);

      setTitle("");
      setDescription("");
      setRanking([]);
      setEditingJob(false);

      setMessage("Job created successfully!");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Job creation failed.");
    } finally {
      setLoading(false);
    }
  };

  // OPEN JOB EDIT FORM
  const startEditingJob = () => {
    const job = jobs.find((item) => item.id === selectedJob);

    if (!job) {
      setError("Please select a job first.");
      return;
    }

    setEditTitle(job.title);
    setEditDescription(job.description);
    setEditingJob(true);
    setError("");
    setMessage("");
  };

  // UPDATE JOB
  const updateJob = async () => {
    if (!selectedJob) {
      setError("Please select a job first.");
      return;
    }

    if (!editTitle.trim() || !editDescription.trim()) {
      setError("Job title and description are required.");
      return;
    }

    const oldJob = jobs.find((job) => job.id === selectedJob);

    try {
      setLoading(true);
      setError("");
      setMessage("");

      const response = await api.put(`/api/jobs/${selectedJob}`, {
        title: editTitle,
        description: editDescription,
      });

      setJobs((previous) =>
        previous.map((job) =>
          job.id === selectedJob ? response.data : job
        )
      );

      const descriptionChanged =
        oldJob?.description !== editDescription.trim();

      if (descriptionChanged) {
        setRanking([]);
        setMessage(
          "Job updated successfully! Run AI Resume Matching again for fresh rankings."
        );
      } else {
        setMessage("Job updated successfully!");
      }

      setEditingJob(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Job update failed.");
    } finally {
      setLoading(false);
    }
  };

  // DELETE SELECTED JOB
  const deleteJob = async () => {
    if (!selectedJob) {
      setError("Please select a job first.");
      return;
    }

    const job = jobs.find((item) => item.id === selectedJob);

    const confirmed = window.confirm(
      `Are you sure you want to delete "${job?.title}"? This will also delete its candidate matching records.`
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      setError("");
      setMessage("");

      await api.delete(`/api/jobs/${selectedJob}`);

      setJobs((previous) =>
        previous.filter((item) => item.id !== selectedJob)
      );

      setSelectedJob(null);
      setRanking([]);
      setEditingJob(false);

      setMessage("Job deleted successfully!");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Job deletion failed.");
    } finally {
      setLoading(false);
    }
  };

  // AI RESUME MATCHING
  const analyzeResumes = async () => {
    if (!selectedJob) {
      setError("Please select a job first.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");

      await api.post(`/api/jobs/${selectedJob}/analyze`);

      const response = await api.get(
        `/api/jobs/${selectedJob}/ranking`
      );

      setRanking(response.data);
      setMessage("AI resume analysis completed successfully!");
    } catch (err: any) {
      setError(err.response?.data?.detail || "AI analysis failed.");
    } finally {
      setLoading(false);
    }
  };

  // MARK CANDIDATE AS REVIEW
  const updateReview = async (candidate: Candidate) => {
    if (candidate.match_id == null) {
      setError("Match ID not found. Please run AI matching again.");
      return;
    }

    try {
      setError("");
      setMessage("");

      await api.put(
        `/api/matches/${candidate.match_id}/decision`,
        null,
        {
          params: { decision: "review" },
        }
      );

      setRanking((previous) =>
        previous.map((item) =>
          item.match_id === candidate.match_id
            ? { ...item, decision: "review" }
            : item
        )
      );

      setMessage(
        `${candidate.name || "Candidate"} marked as Review.`
      );
    } catch (err: any) {
      setError(err.response?.data?.detail || "Unable to update review.");
    }
  };

  return (
    <div className="space-y-6">

      {/* JOB MANAGEMENT */}
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold">Job Management</h2>

        <p className="mt-2 text-sm text-slate-500">
          Create job descriptions and find matching candidates using AI.
        </p>

        <div className="mt-5 space-y-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Job title (e.g. Python Developer)"
            className="w-full rounded-xl border p-3 outline-none focus:border-blue-500"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter job description and required skills..."
            rows={5}
            className="w-full rounded-xl border p-3 outline-none focus:border-blue-500"
          />

          <button
            onClick={createJob}
            disabled={loading}
            className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            Create Job
          </button>
        </div>
      </section>

      {/* AVAILABLE JOBS */}
      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold">Available Jobs</h3>

        <select
          value={selectedJob ?? ""}
          onChange={(e) => {
            setSelectedJob(
              e.target.value ? Number(e.target.value) : null
            );
            setRanking([]);
            setEditingJob(false);
            setError("");
            setMessage("");
          }}
          className="mt-4 w-full rounded-xl border p-3"
        >
          <option value="">Select a job</option>

          {jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={startEditingJob}
            disabled={!selectedJob || loading}
            className="rounded-xl bg-amber-500 px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            Edit Selected Job
          </button>

          <button
            onClick={deleteJob}
            disabled={!selectedJob || loading}
            className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            Delete Selected Job
          </button>

          <button
            onClick={analyzeResumes}
            disabled={loading || !selectedJob}
            className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Please wait..." : "Run AI Resume Matching"}
          </button>
        </div>

        {/* EDIT JOB FORM */}
        {editingJob && (
          <div className="mt-5 space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-5">
            <h4 className="text-lg font-bold">Edit Job Details</h4>

            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Job title"
              className="w-full rounded-xl border bg-white p-3 outline-none focus:border-blue-500"
            />

            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Edit job description..."
              rows={6}
              className="w-full rounded-xl border bg-white p-3 outline-none focus:border-blue-500"
            />

            <div className="flex flex-wrap gap-3">
              <button
                onClick={updateJob}
                disabled={loading}
                className="rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {loading ? "Updating..." : "Save Changes"}
              </button>

              <button
                onClick={() => setEditingJob(false)}
                disabled={loading}
                className="rounded-xl border bg-white px-5 py-3 font-semibold text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {message && (
          <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {message}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      {/* CANDIDATE RANKING */}
      {ranking.length > 0 && (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="text-xl font-bold">AI Candidate Ranking</h3>

          <p className="mt-1 text-sm text-slate-500">
            Candidates ranked by job relevance. Review results before making hiring decisions.
          </p>

          <div className="mt-5 space-y-4">
            {ranking.map((candidate, index) => (
              <div
                key={candidate.match_id}
                className="rounded-xl border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-600">
                      RANK #{index + 1}
                    </p>

                    <h4 className="mt-1 font-bold">
                      {candidate.name || "Unnamed Candidate"}
                    </h4>

                    <p className="text-sm text-slate-500">
                      {candidate.email}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-700">
                      {Number(candidate.score).toFixed(1)}%
                    </p>

                    <p className="text-xs text-slate-500">
                      Match Score
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-green-50 p-3">
                    <p className="text-xs font-bold text-green-700">
                      Matched Skills
                    </p>

                    <p className="mt-2 text-sm text-green-800">
                      {candidate.matched?.join(", ") || "None"}
                    </p>
                  </div>

                  <div className="rounded-lg bg-red-50 p-3">
                    <p className="text-xs font-bold text-red-700">
                      Missing Skills
                    </p>

                    <p className="mt-2 text-sm text-red-800">
                      {candidate.missing?.join(", ") || "None"}
                    </p>
                  </div>

                  <div className="rounded-lg bg-blue-50 p-3">
                    <p className="text-xs font-bold text-blue-700">
                      Related Skills
                    </p>

                    <p className="mt-2 text-sm text-blue-800">
                      {candidate.related?.join(", ") || "None"}
                    </p>
                  </div>
                </div>

                {candidate.explanation && (
                  <p className="mt-3 text-sm text-slate-600">
                    {candidate.explanation}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Hiring decision: {candidate.decision || "Review"}
                  </p>

                  <button
                    onClick={() => updateReview(candidate)}
                    className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    Review
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {ranking.length === 0 && selectedJob && (
        <p className="text-sm text-slate-500">
          Select Run AI Resume Matching to generate candidate rankings.
        </p>
      )}

    </div>
  );
}
