import { useCallback, useEffect, useState } from "react";
import { API_URL } from "../config";

const tok = () => localStorage.getItem("sw_token");

async function req(method, path, body) {
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(tok() ? { Authorization: `Bearer ${tok()}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    logout();
    throw new Error("Session expired \u2014 sign in again");
  }
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) throw new Error((data && data.detail) || "Request failed");
  return data;
}

export const get = (p) => req("GET", p);
export const post = (p, b) => req("POST", p, b);
export const patch = (p, b) => req("PATCH", p, b);
export const del = (p) => req("DELETE", p);

export async function login(username, password) {
  const form = new URLSearchParams();
  form.set("username", username);
  form.set("password", password);
  const res = await fetch(API_URL + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Invalid username or password");
  localStorage.setItem("sw_token", data.access_token);
  localStorage.setItem("sw_role", data.role);
  return data;
}

export function logout() {
  localStorage.removeItem("sw_token");
  localStorage.removeItem("sw_role");
}
export const isAuthed = () => !!tok();
export const role = () => localStorage.getItem("sw_role");

export async function downloadCsv(qs) {
  const res = await fetch(API_URL + "/api/history/export.csv" + (qs ? `?${qs}` : ""), {
    headers: { Authorization: `Bearer ${tok()}` },
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "spin_history.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// tiny data-fetching hook with loading/error/reload
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((d) => setState({ loading: false, data: d, error: null }))
      .catch((e) => setState({ loading: false, data: null, error: e.message }));
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}
