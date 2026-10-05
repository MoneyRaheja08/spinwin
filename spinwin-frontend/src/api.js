import { API_URL } from "./config";

async function post(path, body) {
  const res = await fetch(API_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export const checkEligibility = (tvCode, billNumber) =>
  post("/api/eligibility", { tv_code: tvCode, bill_number: billNumber });

export const createSession = (billId, tvCode) =>
  post("/api/sessions", { bill_id: billId, tv_code: tvCode });

export const kioskSpin = (sessionId) =>
  post(`/api/sessions/${sessionId}/kiosk-spin`, {});

export const registerPublic = (tvCode, customerName, billNumber, categoryId) =>
  post("/api/public/register", {
    tv_code: tvCode, customer_name: customerName,
    bill_number: billNumber, category_id: categoryId,
  });

export async function getCategories(tvCode) {
  const res = await fetch(API_URL + `/api/tv/${encodeURIComponent(tvCode)}/categories`);
  if (!res.ok) throw new Error("Couldn't load categories");
  return res.json();
}

export async function getTvState(tvCode) {
  const res = await fetch(API_URL + `/api/tv/${encodeURIComponent(tvCode)}/state`);
  if (!res.ok) throw new Error("TV not reachable");
  return res.json();
}
