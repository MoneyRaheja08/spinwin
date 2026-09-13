import { useState } from "react";
import { login } from "./api";
import { branding } from "../branding";

export default function Login({ onLogin }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setErr("");
    try {
      await login(u.trim(), p);
      onLogin();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-login">
      <div className="adm-login-card">
        <div className="adm-login-brand">{branding.companyName}</div>
        <h1>Admin sign in</h1>
        <input className="input" placeholder="Username" value={u}
               onChange={(e) => setU(e.target.value)} autoFocus />
        <input className="input" type="password" placeholder="Password" value={p}
               onChange={(e) => setP(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <p className="adm-err">{err}</p>}
        <button className="btn btn-gold" onClick={submit} disabled={busy}>
          {busy ? "Signing in\u2026" : "Sign in"}
        </button>
      </div>
    </div>
  );
}
