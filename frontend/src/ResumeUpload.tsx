
import { useState } from "react";
import api from "./services/api";

interface UploadResult {
  file: string;
  ok: boolean;
  error?: string;
  candidate?: {
    name?: string;
    email?: string;
    skills?: string[];
  };
}

export default function ResumeUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUpload = async () => {
    if (files.length === 0) {
      setError("Please select a PDF or DOCX resume.");
      return;
    }

    const formData = new FormData();

    files.forEach((file) => {
      formData.append("files", file);
    });

    try {
      setLoading(true);
      setError("");
      setResults([]);

      const response = await api.post(
        "/api/resumes/upload",
        formData,
        {
          headers: {
            "Content-Type": undefined,
          },
        }
      );

      setResults(response.data);
      setFiles([]);
    } catch (err: any) {
      console.error("Upload error:", err.response?.data || err);

      const detail = err.response?.data?.detail;

      if (Array.isArray(detail)) {
        setError(
          detail.map((item: any) =>
            `${item.loc?.join(".") || "Field"}: ${item.msg}`
          ).join(" | ")
        );
      } else if (typeof detail === "string") {
        setError(detail);
      } else {
        setError("Resume upload failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-slate-900">
        Resume Screening
      </h2>

      <p className="mt-2 text-sm text-slate-500">
        Upload PDF or DOCX resumes for AI-powered screening.
      </p>

      <input
        type="file"
        multiple
        accept=".pdf,.docx"
        className="mt-5 block w-full rounded-xl border p-3"
        onChange={(e) => {
          setFiles(Array.from(e.target.files || []));
          setError("");
          setResults([]);
        }}
      />

      <p className="mt-2 text-sm text-slate-500">
        Selected files: {files.length}
      </p>

      <button
        onClick={handleUpload}
        disabled={loading || files.length === 0}
        className="mt-5 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Uploading..." : "Upload Resumes"}
      </button>

      {error && (
        <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {results.map((item, index) => (
        <div key={index} className="mt-4 rounded-xl border p-4">
          <p className="font-semibold">{item.file}</p>

          {item.ok ? (
            <div className="mt-2 text-sm text-green-700">
              <p>Upload successful!</p>
              <p>Name: {item.candidate?.name || "Not detected"}</p>
              <p>Email: {item.candidate?.email || "Not detected"}</p>
              <p>
                Skills: {item.candidate?.skills?.join(", ") || "Not detected"}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-red-600">
              {item.error || "Upload failed"}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
