import { useEffect, useState } from "react";
import { get, downloadCsv } from "./api";
import { branding } from "../branding";

const empty = { bill_number: "", customer_mobile: "", prize_id: "", date_from: "", date_to: "", price_min: "", price_max: "" };

export default function History() {
  const [filters, setFilters] = useState(empty);
  const [rows, setRows] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  function qs(f) {
    const p = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v !== "" && v != null) p.set(k, v); });
    return p.toString();
  }

  async function load() {
    setLoading(true); setErr("");
    try { setRows((await get("/api/history?" + qs(filters))).rows); }
    catch (e) { setErr(e.message); } finally { setLoading(false); }
  }

  useEffect(() => { get("/api/admin/prizes").then(setPrizes).catch(() => {}); load(); /* eslint-disable-next-line */ }, []);

  return (
    <div>
      <h1 className="page-h">Spin history</h1>

      <div className="card">
        <div className="form-grid">
          <label className="field"><span>Bill number</span>
            <input className="input" value={filters.bill_number} onChange={(e) => setFilters({ ...filters, bill_number: e.target.value })} /></label>
          <label className="field"><span>Customer mobile</span>
            <input className="input" value={filters.customer_mobile} onChange={(e) => setFilters({ ...filters, customer_mobile: e.target.value })} /></label>
          <label className="field"><span>Prize</span>
            <select className="input" value={filters.prize_id} onChange={(e) => setFilters({ ...filters, prize_id: e.target.value })}>
              <option value="">Any</option>
              {prizes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label className="field"><span>From</span>
            <input className="input" type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} /></label>
          <label className="field"><span>To</span>
            <input className="input" type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} /></label>
          <label className="field"><span>Min price</span>
            <input className="input" type="number" value={filters.price_min} onChange={(e) => setFilters({ ...filters, price_min: e.target.value })} /></label>
          <label className="field"><span>Max price</span>
            <input className="input" type="number" value={filters.price_max} onChange={(e) => setFilters({ ...filters, price_max: e.target.value })} /></label>
        </div>
        <div className="row">
          <button className="btn btn-gold" onClick={load}>Apply filters</button>
          <button className="btn btn-ghost" onClick={() => { setFilters(empty); setTimeout(load, 0); }}>Clear</button>
          <button className="btn btn-ghost" onClick={() => downloadCsv(qs(filters))}>Export CSV</button>
        </div>
      </div>

      <div className="card">
        {loading ? <p className="muted">Loading\u2026</p> : err ? <p className="adm-err">{err}</p> : (
          <table className="table">
            <thead><tr><th>Date</th><th>Bill</th><th>Mobile</th><th>Product</th><th>Price</th><th>Prize</th><th>Value</th><th>Staff</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.session_id}>
                  <td>{r.datetime ? new Date(r.datetime).toLocaleString("en-IN") : "\u2014"}</td>
                  <td>{r.bill_number || "\u2014"}</td>
                  <td>{r.customer_mobile || "\u2014"}</td>
                  <td>{r.product || "\u2014"}</td>
                  <td>{r.mobile_price != null ? branding.currency + r.mobile_price : "\u2014"}</td>
                  <td>{r.prize}</td>
                  <td>{branding.currency}{r.prize_value}</td>
                  <td>{r.employee || "\u2014"}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan="8" className="muted">No spins match these filters.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
