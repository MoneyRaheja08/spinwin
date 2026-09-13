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
