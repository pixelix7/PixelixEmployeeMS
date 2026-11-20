import axios from "axios";
import { API_URL } from "../config";

export const TOKEN_KEY = "ems_token";

const api = axios.create({ baseURL: API_URL });

// Attach the JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// If the server says the token is no longer valid, log out everywhere in the app
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes("/auth/login");
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event("auth:logout"));
    }
    return Promise.reject(error);
  }
);

// Turns an axios error into a message that can be shown to the user
export const getErrorMessage = (error) => {
  if (!error.response) return "Cannot reach the server. Please try again.";
  return error.response.data?.message || "Something went wrong.";
};

export default api;
