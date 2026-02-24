import { useAuth } from "./auth-context"; // keep if you use it elsewhere; not required in this file

// ✅ Prefer an explicit backend base URL via env.
// If not set, fall back to "/api" (works if frontend is served by same backend or via proxy).
// Examples:
// VITE_API_BASE_URL="http://localhost:5000/api"
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE_URL?.replace(/\/+$/, "") || "/api";

// This will be used with a hook to inject token dynamically
let globalToken: string | null = null;

export function setAuthToken(token: string | null) {
  globalToken = token;
}

function normalizePath(path: string) {
  // Ensure it starts with "/" and does NOT double-prefix "/api"
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.startsWith("/api/")) return path.replace(/^\/api/, ""); // "/api/x" -> "/x"
  if (path === "/api") return ""; // edge
  return path;
}

async function parseJSONSafely(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  const text = await res.text();

  // If HTTP error, show body (very useful for debugging)
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} ${res.statusText}\nContent-Type: ${contentType}\nBody (first 300 chars):\n${text.slice(
        0,
        300
      )}`
    );
  }

  // If success but not JSON, also throw (this is your "<!DOCTYPE" case)
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      `Expected JSON but got "${contentType}".\nBody (first 300 chars):\n${text.slice(
        0,
        300
      )}\n\nHint: You're likely hitting the FRONTEND (index.html) instead of the BACKEND API.\nSet VITE_API_BASE_URL to your backend '/api' or configure a proxy.`
    );
  }

  // Parse JSON manually because we already read the text
  try {
    return JSON.parse(text);
  } catch (e: any) {
    throw new Error(
      `JSON parse failed: ${e?.message || e}\nBody (first 300 chars):\n${text.slice(
        0,
        300
      )}`
    );
  }
}

export async function apiFetch(path: string, init?: RequestInit) {
  const tokenFromStorage =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("authToken")
      : null;

  const token = globalToken || tokenFromStorage;
  const masked = token ? `${token.slice(0, 8)}...${token.slice(-8)}` : null;

  const headers = new Headers(init?.headers || {});

  // Only set JSON content-type when we are sending JSON body.
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
    // Some servers/frameworks are case-sensitive in certain middleware setups
    try {
      headers.set("authorization", `Bearer ${token}`);
    } catch {
      // ignore   
    }
  }

  const finalPath = normalizePath(path);
  const url = `${API_BASE}${finalPath}`;

  console.log(
    "[apiFetch]",
    "url:",
    url,
    "globalToken?",
    !!globalToken,
    "fallbackToken?",
    !!tokenFromStorage,
    "token:",
    masked
  );

  const res = await fetch(url, { ...(init || {}), headers });

  if (res.status === 401) {
    console.log("[apiFetch] 401 received, clearing globalToken");
    globalToken = null;
    // optional: localStorage.removeItem("authToken");
  }

  return res;
}

export async function getJSON(path: string) {
  const res = await apiFetch(path, { method: "GET" });
  return parseJSONSafely(res);
}

export async function postJSON(path: string, body: any) {
  const res = await apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
  });
  return parseJSONSafely(res);
}

export async function putJSON(path: string, body: any) {
  const res = await apiFetch(path, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
  });
  return parseJSONSafely(res);
}

export async function deleteJSON(path: string) {
  const res = await apiFetch(path, { method: "DELETE" });
  return parseJSONSafely(res);
}

export default apiFetch;
