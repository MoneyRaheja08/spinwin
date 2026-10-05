import { useState } from "react";
import { get, post, patch, del, useAsync } from "./api";

const UNLIMITED = 1000000;

async function loadAll() {
  const [slabs, prizes, inventory] = await Promise.all([
    get("/api/admin/slabs"), get("/api/admin/prizes"), get("/api/admin/inventory"),
  ]);
  const rules = {};
  await Promise.all(slabs.map(async (s) => {
    rules[s.id] = (await get(`/api/admin/slabs/${s.id}/rules`)).rules;
  }));
  return { slabs, prizes, inventory, rules };
}

export default function QuickSetup() {
  const { data, loading, error, reload } = useAsync(loadAll);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function addCategory() {
    if (!name.trim()) return;
    setBusy(true); setMsg("");
    try {
      await post("/api/admin/slabs", { name: name.trim(), min_price: 0, max_price: null, priority: 0 });
      setName(""); reload();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="adm-err">{error}</p>;

  const invByPrize = {};
  data.inventory.forEach((i) => { if (invByPrize[i.prize_id] === undefined) invByPrize[i.prize_id] = i; });
  const categories = data.slabs.filter((s) => s.is_active !== false).sort((a, b) => a.priority - b.priority);

  return (
    <div>
      <h1 className="page-h">Categories &amp; gifts</h1>

      <div className="card">
        <p className="muted" style={{ lineHeight: 1.6 }}>
          Add a category (Mobile, LED, Laptop…). Under each, add gifts with the
          <b> percentage</b> chance of winning them. Percentages in a category should add up to 100.
        </p>
        <div className="row">
          <input className="input" placeholder="Category name (e.g. MOBILE)" value={name}
                 onChange={(e) => setName(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && addCategory()} />
          <button className="btn btn-gold" onClick={addCategory} disabled={busy || !name.trim()}>Add category</button>
        </div>
        {msg && <p className="adm-err">{msg}</p>}
      </div>

      {categories.map((s) => (
        <CategoryCard key={s.id} slab={s} rules={data.rules[s.id] || []}
                      prizes={data.prizes} inv={invByPrize} onChange={reload} />
      ))}
      {!categories.length && <p className="muted">No categories yet — add one above.</p>}
    </div>
  );
}

function CategoryCard({ slab, rules, prizes, inv, onChange }) {
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [pct, setPct] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const total = rules.reduce((s, r) => s + Number(r.weight), 0);

  async function addGift() {
    if (!name.trim() || pct === "") return;
    setBusy(true); setMsg("");
    try {
      let prize = prizes.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (!prize) prize = await post("/api/admin/prizes", {
        name: name.trim(), value: 0, is_active: true, image_url: image.trim() || null,
      });
      else if (image.trim()) await patch(`/api/admin/prizes/${prize.id}`, { image_url: image.trim() });
      if (rules.some((r) => r.prize_id === prize.id)) {
        setMsg("That gift is already in this category."); setBusy(false); return;
      }
      if (!inv[prize.id]) await post("/api/admin/inventory", { prize_id: prize.id, quantity_initial: UNLIMITED });
      await post("/api/admin/rules", { slab_id: slab.id, prize_id: prize.id, weight: Number(pct) });
      setName(""); setImage(""); setPct("");
      onChange();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function removeGift(ruleId) { await del(`/api/admin/rules/${ruleId}`); onChange(); }
  async function setPercent(ruleId, val) {
    await patch(`/api/admin/rules/${ruleId}`, { weight: Number(val) || 0 });
    onChange();
  }
  async function setPhoto(prizeId, prizeName) {
    const cur = (prizes.find((p) => p.id === prizeId) || {}).image_url || "";
    const url = window.prompt(`Photo link for "${prizeName}" (paste an image URL, or blank to remove):`, cur);
    if (url === null) return;
    await patch(`/api/admin/prizes/${prizeId}`, { image_url: url.trim() || null });
    onChange();
  }
  async function removeCategory() {
    if (!window.confirm(`Remove the category "${slab.name}"?`)) return;
    await patch(`/api/admin/slabs/${slab.id}`, { is_active: false });
    onChange();
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>{slab.name}
          <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}> &nbsp;(total {total}%)</span>
        </h3>
        <button className="btn btn-ghost sm" onClick={removeCategory}>Remove category</button>
      </div>

      <table className="table" style={{ marginTop: 10 }}>
        <thead><tr><th>Gift</th><th>Percentage</th><th></th></tr></thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td>{r.prize_name}</td>
              <td>
                <span className="row" style={{ gap: 8 }}>
                  <input className="input sm" type="number" defaultValue={r.weight}
                         onBlur={(e) => { const v = e.target.value; if (v !== "" && String(r.weight) !== v) setPercent(r.id, v); }} />
                  <span className="muted">%</span>
                </span>
              </td>
              <td style={{ textAlign: "right" }}>
                <button className="btn btn-ghost sm" onClick={() => setPhoto(r.prize_id, r.prize_name)}>Photo</button>
                <button className="btn btn-ghost sm" onClick={() => removeGift(r.id)}>Remove</button>
              </td>
            </tr>
          ))}
          {!rules.length && <tr><td colSpan="3" className="muted">No gifts yet — add one below.</td></tr>}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" placeholder="Gift name (e.g. Ear Buds)" value={name}
               onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Photo link (optional)" value={image}
               onChange={(e) => setImage(e.target.value)} />
        <input className="input sm" type="number" placeholder="%" value={pct}
               onChange={(e) => setPct(e.target.value)} />
        <button className="btn btn-gold" onClick={addGift} disabled={busy || !name.trim() || pct === ""}>Add gift</button>
      </div>
      {msg && <p className="adm-err">{msg}</p>}
    </div>
  );
}
