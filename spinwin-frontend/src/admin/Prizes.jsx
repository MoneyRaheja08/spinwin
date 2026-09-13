import { useState } from "react";
import { get, post, patch, useAsync } from "./api";
import { branding } from "../branding";

const blank = { name: "", value: 0, category: "", priority: 0, max_winners: "", image_url: "", is_active: true };

export default function Prizes() {
  const { data, loading, error, reload } = useAsync(() => get("/api/admin/prizes"));
  const [form, setForm] = useState(blank);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  function edit(p) {
    setEditId(p.id);
    setForm({ name: p.name, value: p.value, category: p.category || "", priority: p.priority,
              max_winners: p.max_winners ?? "", image_url: p.image_url || "", is_active: p.is_active });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function reset() { setEditId(null); setForm(blank); }

  async function save() {
    setSaving(true); setMsg("");
    const payload = { ...form, value: Number(form.value), priority: Number(form.priority),
      max_winners: form.max_winners === "" ? null : Number(form.max_winners) };
    try {
      if (editId) await patch(`/api/admin/prizes/${editId}`, payload);
      else await post("/api/admin/prizes", payload);
      reset(); reload();
    } catch (e) { setMsg(e.message); } finally { setSaving(false); }
  }

  async function toggle(p) {
    await patch(`/api/admin/prizes/${p.id}`, { is_active: !p.is_active });
    reload();
  }

  return (
    <div>
      <h1 className="page-h">Prizes</h1>

      <div className="card">
        <h3>{editId ? "Edit prize" : "Add a prize"}</h3>
        <div className="form-grid">
          <label className="field"><span>Name</span>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="field"><span>Value ({branding.currency})</span>
            <input className="input" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></label>
          <label className="field"><span>Category</span>
            <input className="input" value={form.category} placeholder="VOUCHER / ACCESSORY\u2026"
                   onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
          <label className="field"><span>Priority (wheel order)</span>
            <input className="input" type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></label>
          <label className="field"><span>Max winners (blank = \u221E)</span>
            <input className="input" type="number" value={form.max_winners} onChange={(e) => setForm({ ...form, max_winners: e.target.value })} /></label>
          <label className="field"><span>Image URL</span>
            <input className="input" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} /></label>
        </div>
        {msg && <p className="adm-err">{msg}</p>}
        <div className="row">
          <button className="btn btn-gold" onClick={save} disabled={saving || !form.name}>
            {saving ? "Saving\u2026" : editId ? "Save changes" : "Add prize"}</button>
          {editId && <button className="btn btn-ghost" onClick={reset}>Cancel</button>}
        </div>
      </div>

      {loading ? <p className="muted">Loading\u2026</p> : error ? <p className="adm-err">{error}</p> : (
        <div className="card">
          <table className="table">
            <thead><tr><th>Name</th><th>Value</th><th>Category</th><th>Priority</th><th>Max</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{branding.currency}{p.value}</td>
                  <td>{p.category || "\u2014"}</td>
                  <td>{p.priority}</td>
                  <td>{p.max_winners ?? "\u221E"}</td>
                  <td><span className={`tag ${p.is_active ? "on" : "off"}`}>{p.is_active ? "Active" : "Off"}</span></td>
                  <td className="row-actions">
                    <button className="btn btn-ghost sm" onClick={() => edit(p)}>Edit</button>
                    <button className="btn btn-ghost sm" onClick={() => toggle(p)}>{p.is_active ? "Disable" : "Enable"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
