import { useEffect, useState } from "react";
import { get, post, role } from "./api";
import { API_URL } from "../config";
async function putSetting(key, value) {
  const res = await fetch(API_URL + "/api/admin/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("sw_token")}` },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "Save failed");
}

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(6);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    get("/api/admin/settings").then((s) => {
      setSettings(s);
      setCompany(s.branding?.company_name || "");
      setTitle(s.branding?.game_title || "");
      setDuration(s.game?.animation_seconds || 6);
    }).catch(() => {});
  }, []);

  async function saveBranding() {
    setMsg("");
    try {
      await putSetting("branding", { ...(settings.branding || {}), company_name: company, game_title: title });
      await putSetting("game", { ...(settings.game || {}), animation_seconds: Number(duration) });
      setMsg("Saved.");
    } catch (e) { setMsg(e.message); }
  }

  return (
    <div>
      <h1 className="page-h">Settings</h1>

      <div className="card">
        <h3>Branding &amp; game</h3>
        <p className="muted">The TV/phone visual branding is also set in <code>src/branding.js</code>; these values sync the backend copy for future use.</p>
        <div className="form-grid">
          <label className="field"><span>Company name</span>
            <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} /></label>
          <label className="field"><span>Game title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field"><span>Wheel animation (seconds)</span>
            <input className="input" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></label>
        </div>
        {msg && <p className={msg === "Saved." ? "adm-ok" : "adm-err"}>{msg}</p>}
        <button className="btn btn-gold" onClick={saveBranding}>Save settings</button>
      </div>

      {role() === "SUPER_ADMIN" && <StaffCreator />}
    </div>
  );
}

function StaffCreator() {
  const [f, setF] = useState({ username: "", password: "", full_name: "", store_id: "", role: "STAFF" });
  const [stores, setStores] = useState([]);
  const [msg, setMsg] = useState("");
  useEffect(() => { get("/api/admin/stores").then(setStores).catch(() => {}); }, []);

  async function create() {
    setMsg("");
    try {
      await post("/api/admin/users", { ...f, store_id: f.store_id || null });
      setMsg(`Created ${f.username}.`);
      setF({ username: "", password: "", full_name: "", store_id: "", role: "STAFF" });
    } catch (e) { setMsg(e.message); }
  }

  return (
    <div className="card">
      <h3>Create a user</h3>
      <div className="form-grid">
        <label className="field"><span>Username</span>
          <input className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
        <label className="field"><span>Password</span>
          <input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        <label className="field"><span>Full name</span>
          <input className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
        <label className="field"><span>Role</span>
          <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="STAFF">Staff</option>
            <option value="STORE_ADMIN">Store admin</option>
            <option value="SUPER_ADMIN">Super admin</option>
          </select></label>
        <label className="field"><span>Store</span>
          <select className="input" value={f.store_id} onChange={(e) => setF({ ...f, store_id: e.target.value })}>
            <option value="">(none / super admin)</option>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
      </div>
      {msg && <p className={msg.startsWith("Created") ? "adm-ok" : "adm-err"}>{msg}</p>}
      <button className="btn btn-gold" onClick={create} disabled={!f.username || !f.password}>Create user</button>
    </div>
  );
}
