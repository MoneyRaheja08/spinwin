// Render's Blueprint passes the backend as a bare hostname (no scheme), so
// prepend https:// when a scheme is missing. Local dev keeps http://localhost.
function withScheme(u) {
  if (!u) return u;
  return /^https?:\/\//.test(u) ? u : "https://" + u;
}
export const API_URL = withScheme(import.meta.env.VITE_API_URL) || "http://localhost:8000";
export const SOCKET_URL = withScheme(import.meta.env.VITE_SOCKET_URL) || API_URL;
