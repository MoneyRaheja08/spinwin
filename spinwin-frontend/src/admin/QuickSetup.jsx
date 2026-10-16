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

  async function toggleStock(prizeId, makeActive) {
    try { await patch(`/api/admin/prizes/${prizeId}`, { is_active: makeActive }); reload(); }
    catch (e) { setMsg(e.message); }
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="adm-err">{error}</p>;

  const invByPrize = {};
  data.inventory.forEach((i) => { if (invByPrize[i.prize_id] === undefined) invByPrize[i.prize_id] = i; });
  const categories = data.slabs.filter((s) => s.is_active !== false).sort((a, b) => a.priority - b.priority);

  // gifts that are used in at least one category (the winnable ones)
  const usedIds = new Set();
  Object.values(data.rules).forEach((rs) => rs.forEach((r) => usedIds.add(r.prize_id)));
  const stockGifts = data.prizes
    .filter((p) => usedIds.has(p.id))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return (
    <div>
      <h1 className="page-h">Categories &amp; gifts</h1>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Out of stock</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Turn a gift <b>off</b> when it runs out — it stops being won and leaves the wheel in every
          category. Turn it back <b>on</b> when restocked; its percentages are kept.
        </p>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          {stockGifts.map((p) => (
            <button key={p.id} className="btn sm"
                    style={p.is_active
                      ? { background: "rgba(47,191,113,0.18)", color: "#8ff0b5", border: "1px solid #2fbf71" }
                      : { background: "rgba(229,57,53,0.18)", color: "#ff9b98", border: "1px solid #e53935" }}
                    onClick={() => toggleStock(p.id, !p.is_active)}
                    title={p.is_active ? "In stock — tap to mark OUT" : "Out of stock — tap to restore"}>
              {p.is_active ? `✓ ${p.name} — in stock` : `✕ ${p.name} — OUT (tap to restore)`}
            </button>
          ))}
          {!stockGifts.length && <span className="muted">Add gifts to a category first.</span>}
        </div>
        {msg && <p className="adm-err">{msg}</p>}
      </div>

      <div className="card">
        <p className="muted" style={{ lineHeight: 1.6 }}>
          Add a category (Mobile, LED, Laptop…). Under each, add gifts with the
          <b> percentage</b> chance of winning them (should add up to 100).
          <b> Per day</b> optionally limits how many of a gift can be given each day —
          once it hits that number it stops for the day and resets at midnight. Blank = no limit.
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
  const [perDay, setPerDay] = useState("");
  const [dailyTotal, setDailyTotal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const total = rules.reduce((s, r) => s + Number(r.weight), 0);

  // Turn the percentages into per-day counts out of `dailyTotal`.
  // The cheapest gift is left uncapped so there's always something to give
  // once the day's quotas are used up.
  async function applyDailyCounts() {
    const N = Number(dailyTotal);
    if (!N || N <= 0 || !rules.length) return;
    setBusy(true); setMsg("");
    try {
      const sum = rules.reduce((s, r) => s + Number(r.weight), 0) || 1;
      let cheapestId = rules[0].id, cheapestVal = Infinity;
      rules.forEach((r) => {
        const p = prizes.find((x) => x.id === r.prize_id);
        const v = p ? Number(p.value) : 0;
        if (v < cheapestVal) { cheapestVal = v; cheapestId = r.id; }
      });
      for (const r of rules) {
        const cap = r.id === cheapestId
          ? null
          : Math.max(0, Math.round((Number(r.weight) / sum) * N));
        await patch(`/api/admin/rules/${r.id}`, { daily_limit: cap });
      }
      setDailyTotal("");
      setMsg("Daily counts set from the percentages.");
      onChange();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

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
      await post("/api/admin/rules", {
        slab_id: slab.id, prize_id: prize.id, weight: Number(pct),
        daily_limit: perDay === "" ? null : Number(perDay),
      });
      setName(""); setImage(""); setPct(""); setPerDay("");
      onChange();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function removeGift(ruleId) { await del(`/api/admin/rules/${ruleId}`); onChange(); }
  async function setPercent(ruleId, val) {
    await patch(`/api/admin/rules/${ruleId}`, { weight: Number(val) || 0 });
    onChange();
  }
  async function setDaily(ruleId, val) {
    await patch(`/api/admin/rules/${ruleId}`, { daily_limit: val === "" ? null : Number(val) });
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

      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <span className="muted">Gifts per day for this category:</span>
        <input className="input sm" type="number" placeholder="e.g. 100" value={dailyTotal}
               onChange={(e) => setDailyTotal(e.target.value)} />
        <button className="btn btn-ghost sm" onClick={applyDailyCounts}
                disabled={busy || dailyTotal === ""}>Set daily counts from %</button>
      </div>

      <table className="table" style={{ marginTop: 10 }}>
        <thead><tr><th>Gift</th><th>Percentage</th><th>Per day</th><th></th></tr></thead>
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
              <td>
                <input className="input sm" type="number" placeholder="∞" defaultValue={r.daily_limit ?? ""}
                       onBlur={(e) => { const v = e.target.value; if (String(r.daily_limit ?? "") !== v) setDaily(r.id, v); }} />
              </td>
              <td style={{ textAlign: "right" }}>
                <button className="btn btn-ghost sm" onClick={() => setPhoto(r.prize_id, r.prize_name)}>Photo</button>
                <button className="btn btn-ghost sm" onClick={() => removeGift(r.id)}>Remove</button>
              </td>
            </tr>
          ))}
          {!rules.length && <tr><td colSpan="4" className="muted">No gifts yet — add one below.</td></tr>}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" placeholder="Gift name (e.g. Ear Buds)" value={name}
               onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Photo link (optional)" value={image}
               onChange={(e) => setImage(e.target.value)} />
        <input className="input sm" type="number" placeholder="%" value={pct}
               onChange={(e) => setPct(e.target.value)} />
        <input className="input sm" type="number" placeholder="Per day (blank = ∞)" value={perDay}
               onChange={(e) => setPerDay(e.target.value)} />
        <button className="btn btn-gold" onClick={addGift} disabled={busy || !name.trim() || pct === ""}>Add gift</button>
      </div>
      {msg && <p className={msg.startsWith("Daily") ? "adm-ok" : "adm-err"}>{msg}</p>}
    </div>
  );
}
