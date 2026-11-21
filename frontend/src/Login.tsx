
import { useState } from "react";
import { loginUser, registerUser } from "./services/api";

interface LoginProps {
  onLoginSuccess: (role: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    try {
      setLoading(true);

      if (isRegister) {
        await registerUser(email, password);
        setMessage("Registration successful! Please login.");
        setIsRegister(false);
      } else {
        const result = await loginUser(email, password);
        onLoginSuccess(result.role);
      }
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-5">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-2xl font-bold text-white">
            H
          </div>

          <h1 className="text-3xl font-bold text-slate-900">
            HireSmart AI
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Intelligent Resume Screening & Job Matching
          </p>
        </div>

        <h2 className="mb-2 text-xl font-semibold text-slate-800">
          {isRegister ? "Create your account" : "Welcome back"}
        </h2>

        <p className="mb-6 text-sm text-slate-500">
          {isRegister
            ? "Register to get started with HireSmart AI."
            : "Login to access your dashboard."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Email Address
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              minLength={8}
              required
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {message && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {loading
              ? "Please wait..."
              : isRegister
                ? "Create Account"
                : "Login"}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600">
          {isRegister ? "Already have an account?" : "Don't have an account?"}

          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
              setMessage("");
            }}
            className="ml-2 font-semibold text-blue-600 hover:underline"
          >
            {isRegister ? "Login" : "Register"}
          </button>
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          © 2026 HireSmart AI. All rights reserved.
        </p>
      </div>
    </div>
  );
}
