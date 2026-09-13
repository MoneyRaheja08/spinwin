import { useState } from "react";
import { get, post, useAsync } from "./api";

export default function Inventory() {
  const { data, loading, error, reload } = useAsync(() => get("/api/admin/inventory"));
  const [busy, setBusy] = useState(null);

  async function restock(inv) {
    const qty = Number(prompt(`Add stock for ${inv.prize_name}:`, "10"));
    if (!qty || qty <= 0) return;
    setBusy(inv.id);
    try { await post(`/api/admin/inventory/${inv.id}/restock`, { quantity: qty }); reload(); }
    catch (e) { alert(e.message); } finally { setBusy(null); }
  }
  async function adjust(inv) {
    const v = prompt(`Set remaining for ${inv.prize_name} (0\u2013${inv.quantity_initial}):`, String(inv.quantity_remaining));
    if (v === null) return;
    setBusy(inv.id);
    try { await post(`/api/admin/inventory/${inv.id}/adjust`, { set_remaining: Number(v) }); reload(); }
    catch (e) { alert(e.message); } finally { setBusy(null); }
  }

  return (
    <div>
      <h1 className="page-h">Inventory</h1>
      {loading ? <p className="muted">Loading\u2026</p> : error ? <p className="adm-err">{error}</p> : (
        <div className="card">
          <table className="table">
            <thead><tr><th>Prize</th><th>Remaining</th><th>Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.prize_name}</td>
                  <td>{inv.quantity_remaining}</td>
                  <td>{inv.quantity_initial}</td>
                  <td>
                    {inv.quantity_remaining === 0
                      ? <span className="tag off">Out</span>
                      : inv.low_stock
                        ? <span className="tag low">Low</span>
                        : <span className="tag on">OK</span>}
                  </td>
                  <td className="row-actions">
                    <button className="btn btn-ghost sm" disabled={busy === inv.id} onClick={() => restock(inv)}>Restock</button>
                    <button className="btn btn-ghost sm" disabled={busy === inv.id} onClick={() => adjust(inv)}>Adjust</button>
                  </td>
                </tr>
              ))}
              {!data.length && <tr><td colSpan="5" className="muted">No inventory rows. Add stock from a prize.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
