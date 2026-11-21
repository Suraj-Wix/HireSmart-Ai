
import axios from "axios";

const api = axios.create({
  baseURL: "http://127.0.0.1:8000",
  headers: {
    "Content-Type": "application/json",
  },
});

// Automatically attach JWT token to protected requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

// Register
export const registerUser = async (
  email: string,
  password: string
) => {
  const response = await api.post("/api/auth/register", {
    email,
    password,
  });

  return response.data;
};

// Login
export const loginUser = async (
  email: string,
  password: string
) => {
  const response = await api.post("/api/auth/login", {
    email,
    password,
  });

  localStorage.setItem("token", response.data.token);
  localStorage.setItem("role", response.data.role);

  return response.data;
};

// Logout
export const logoutUser = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
};

export default api;
