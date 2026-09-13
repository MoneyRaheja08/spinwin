import { useState } from "react";
import { get, post, useAsync } from "./api";

export default function Devices() {
  const { data, loading, error, reload } = useAsync(() => get("/api/admin/tv-devices"));
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  async function add() {
    if (!code.trim()) return;
    try { await post("/api/admin/tv-devices", { code: code.trim(), name: name.trim() || null }); setCode(""); setName(""); reload(); }
    catch (e) { alert(e.message); }
  }
  async function repair(id) { await post(`/api/admin/tv-devices/${id}/repair`); reload(); }

  return (
    <div>
      <h1 className="page-h">TV devices</h1>

      <div className="card">
        <h3>Add a TV</h3>
        <div className="row">
          <input className="input" placeholder="Code (e.g. TV-002)" value={code} onChange={(e) => setCode(e.target.value)} />
          <input className="input" placeholder="Name (e.g. Dhakoli Store)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn btn-gold" onClick={add}>Add</button>
        </div>
      </div>

      {loading ? <p className="muted">Loading\u2026</p> : error ? <p className="adm-err">{error}</p> : (
        <div className="card">
          <table className="table">
            <thead><tr><th>Code</th><th>Name</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.map((tv) => (
                <tr key={tv.id}>
                  <td>{tv.code}</td>
                  <td>{tv.name || "\u2014"}</td>
                  <td><span className={`tag ${tv.is_active ? "on" : "off"}`}>{tv.is_active ? "Active" : "Off"}</span></td>
                  <td className="row-actions">
                    <a className="btn btn-ghost sm" href={`/tv?tv=${encodeURIComponent(tv.code)}`} target="_blank" rel="noreferrer">Open</a>
                    <button className="btn btn-ghost sm" onClick={() => repair(tv.id)}>Re-pair</button>
                  </td>
                </tr>
              ))}
              {!data.length && <tr><td colSpan="4" className="muted">No TVs yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
