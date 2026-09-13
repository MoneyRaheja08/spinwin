import { useEffect, useState } from "react";
import { get, post, patch, del, useAsync } from "./api";

export default function Slabs() {
  const { data: slabs, loading, error, reload } = useAsync(() => get("/api/admin/slabs"));
  const [sel, setSel] = useState(null);
  const [newSlab, setNewSlab] = useState({ name: "", min_price: "", max_price: "", priority: 0 });

  async function addSlab() {
    await post("/api/admin/slabs", {
      name: newSlab.name, min_price: Number(newSlab.min_price),
      max_price: newSlab.max_price === "" ? null : Number(newSlab.max_price),
      priority: Number(newSlab.priority),
    });
    setNewSlab({ name: "", min_price: "", max_price: "", priority: 0 });
    reload();
  }

  return (
    <div>
      <h1 className="page-h">Price slabs &amp; weights</h1>

      <div className="card">
        <h3>Add a slab</h3>
        <div className="form-grid">
          <label className="field"><span>Name</span>
            <input className="input" value={newSlab.name} onChange={(e) => setNewSlab({ ...newSlab, name: e.target.value })} /></label>
          <label className="field"><span>Min price</span>
            <input className="input" type="number" value={newSlab.min_price} onChange={(e) => setNewSlab({ ...newSlab, min_price: e.target.value })} /></label>
          <label className="field"><span>Max price (blank = open)</span>
            <input className="input" type="number" value={newSlab.max_price} onChange={(e) => setNewSlab({ ...newSlab, max_price: e.target.value })} /></label>
          <label className="field"><span>Priority</span>
            <input className="input" type="number" value={newSlab.priority} onChange={(e) => setNewSlab({ ...newSlab, priority: e.target.value })} /></label>
        </div>
        <button className="btn btn-gold" onClick={addSlab} disabled={!newSlab.name || newSlab.min_price === ""}>Add slab</button>
      </div>

      {loading ? <p className="muted">Loading\u2026</p> : error ? <p className="adm-err">{error}</p> : (
        <div className="card">
          <table className="table">
            <thead><tr><th>Slab</th><th>Range</th><th>Priority</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {slabs.map((s) => (
                <tr key={s.id} className={sel === s.id ? "sel" : ""}>
                  <td>{s.name}</td>
                  <td>{s.min_price} \u2013 {s.max_price ?? "\u221E"}</td>
                  <td>{s.priority}</td>
                  <td><span className={`tag ${s.is_active ? "on" : "off"}`}>{s.is_active ? "Active" : "Off"}</span></td>
                  <td><button className="btn btn-ghost sm" onClick={() => setSel(s.id)}>Weights</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sel && <RuleEditor slabId={sel} slabName={slabs.find((s) => s.id === sel)?.name} />}
    </div>
  );
}

function RuleEditor({ slabId, slabName }) {
  const [rules, setRules] = useState(null);
  const [total, setTotal] = useState(0);
  const [prizes, setPrizes] = useState([]);
  const [addPrize, setAddPrize] = useState("");
  const [addWeight, setAddWeight] = useState(1);

  async function load() {
    const r = await get(`/api/admin/slabs/${slabId}/rules`);
    setRules(r.rules); setTotal(r.total_active_weight);
    if (!prizes.length) setPrizes(await get("/api/admin/prizes"));
  }
  useEffect(() => { setRules(null); load(); /* eslint-disable-next-line */ }, [slabId]);

  async function setWeight(ruleId, weight) {
    await patch(`/api/admin/rules/${ruleId}`, { weight: Number(weight) });
    load();
  }
  async function remove(ruleId) { await del(`/api/admin/rules/${ruleId}`); load(); }
  async function add() {
    if (!addPrize) return;
    await post("/api/admin/rules", { slab_id: slabId, prize_id: addPrize, weight: Number(addWeight) });
    setAddPrize(""); setAddWeight(1); load();
  }

  const usedIds = new Set((rules || []).map((r) => r.prize_id));
  const available = prizes.filter((p) => !usedIds.has(p.id));

  return (
    <div className="card">
      <h3>Weights for “{slabName}”</h3>
      <p className="muted">Percentages are calculated live from the weights of active prizes.</p>
      {!rules ? <p className="muted">Loading\u2026</p> : (
        <table className="table">
          <thead><tr><th>Prize</th><th>Weight</th><th>Chance</th><th></th></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td>{r.prize_name}</td>
                <td>
                  <input className="input sm" type="number" defaultValue={r.weight}
                         onBlur={(e) => e.target.value != r.weight && setWeight(r.id, e.target.value)} />
                </td>
                <td><b>{r.percentage}%</b></td>
                <td><button className="btn btn-ghost sm" onClick={() => remove(r.id)}>Remove</button></td>
              </tr>
            ))}
            {!rules.length && <tr><td colSpan="4" className="muted">No prizes in this slab yet.</td></tr>}
          </tbody>
        </table>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <select className="input" value={addPrize} onChange={(e) => setAddPrize(e.target.value)}>
          <option value="">Add a prize\u2026</option>
          {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="input sm" type="number" value={addWeight} onChange={(e) => setAddWeight(e.target.value)} />
        <button className="btn btn-gold" onClick={add} disabled={!addPrize}>Add</button>
      </div>
    </div>
  );
}
