import { useState } from "react";
import { get, post, del, useAsync } from "./api";

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

const rupee = (n) => "\u20B9" + Number(n).toLocaleString("en-IN");

export default function QuickSetup() {
  const { data, loading, error, reload } = useAsync(loadAll);
  const [range, setRange] = useState({ from: "", to: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function addRange() {
    if (range.from === "") return;
    setBusy(true); setMsg("");
    try {
      const from = Number(range.from);
      const to = range.to === "" ? null : Number(range.to);
      const name = `${rupee(from)} \u2013 ${to ? rupee(to) : "above"}`;
      await post("/api/admin/slabs", { name, min_price: from, max_price: to, priority: from });
      setRange({ from: "", to: "" });
      reload();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  if (loading) return <p className="muted">Loading\u2026</p>;
  if (error) return <p className="adm-err">{error}</p>;

  const invByPrize = {};
  data.inventory.forEach((i) => { if (invByPrize[i.prize_id] === undefined) invByPrize[i.prize_id] = i; });
  const ranges = [...data.slabs].sort((a, b) => a.min_price - b.min_price);

  return (
    <div>
      <h1 className="page-h">Gifts by price</h1>

      <div className="card">
        <p className="muted">
          Choose which gifts appear for each phone price range. <b>Put one gift in a range and it always wins.</b>{" "}
          Add two or more and set each one's <b>Chance</b> to run a lucky draw.
        </p>
        <div className="row">
          <input className="input sm" type="number" placeholder="From \u20B9" value={range.from}
                 onChange={(e) => setRange({ ...range, from: e.target.value })} />
          <span className="muted">to</span>
          <input className="input sm" type="number" placeholder="To \u20B9 (blank = & above)" value={range.to}
                 onChange={(e) => setRange({ ...range, to: e.target.value })} />
          <button className="btn btn-gold" onClick={addRange} disabled={busy || range.from === ""}>Add price range</button>
        </div>
        {msg && <p className="adm-err">{msg}</p>}
      </div>

      {ranges.map((s) => (
        <RangeCard key={s.id} slab={s} rules={data.rules[s.id] || []}
                   prizes={data.prizes} inv={invByPrize} onChange={reload} />
      ))}
      {!ranges.length && <p className="muted">No price ranges yet — add one above.</p>}
    </div>
  );
}

function RangeCard({ slab, rules, prizes, inv, onChange }) {
  const [g, setG] = useState({ name: "", stock: "", chance: "1" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function addGift() {
    if (!g.name.trim()) return;
    setBusy(true); setMsg("");
    try {
      let prize = prizes.find((p) => p.name.trim().toLowerCase() === g.name.trim().toLowerCase());
      if (!prize) prize = await post("/api/admin/prizes", { name: g.name.trim(), value: 0, is_active: true });

      if (rules.some((r) => r.prize_id === prize.id)) {
        setMsg("That gift is already in this range."); setBusy(false); return;
      }
      const existingInv = inv[prize.id];
      const stockVal = g.stock === "" ? 100000 : Number(g.stock);
      if (!existingInv) await post("/api/admin/inventory", { prize_id: prize.id, quantity_initial: stockVal });
      else if (g.stock) await post(`/api/admin/inventory/${existingInv.id}/restock`, { quantity: Number(g.stock) });

      await post("/api/admin/rules", { slab_id: slab.id, prize_id: prize.id, weight: Number(g.chance) || 1 });
      setG({ name: "", stock: "", chance: "1" });
      onChange();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function removeGift(ruleId) { await del(`/api/admin/rules/${ruleId}`); onChange(); }

  return (
    <div className="card">
      <h3>{slab.name}</h3>
      <table className="table">
        <thead><tr><th>Gift</th><th>Chance</th><th>Stock</th><th></th></tr></thead>
        <tbody>
          {rules.map((r) => {
            const stock = inv[r.prize_id];
            const rem = stock ? stock.quantity_remaining : null;
            return (
              <tr key={r.id}>
                <td>{r.prize_name}</td>
                <td><b>{r.percentage}%</b></td>
                <td>{rem === null ? "\u2014" : rem > 99999 ? "\u221E" : rem}</td>
                <td><button className="btn btn-ghost sm" onClick={() => removeGift(r.id)}>Remove</button></td>
              </tr>
            );
          })}
          {!rules.length && <tr><td colSpan="4" className="muted">No gifts yet — add one below.</td></tr>}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" placeholder="Gift name (e.g. Free Watch)" value={g.name}
               onChange={(e) => setG({ ...g, name: e.target.value })} />
        <input className="input sm" type="number" placeholder="Stock (blank = lots)" value={g.stock}
               onChange={(e) => setG({ ...g, stock: e.target.value })} />
        <input className="input sm" type="number" placeholder="Chance" value={g.chance}
               onChange={(e) => setG({ ...g, chance: e.target.value })} />
        <button className="btn btn-gold" onClick={addGift} disabled={busy || !g.name.trim()}>Add gift</button>
      </div>
      {msg && <p className="adm-err">{msg}</p>}
      <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
        Tip: “Chance” is relative — two gifts at 1 &amp; 1 = 50/50; at 3 &amp; 1 = 75/25. One gift alone = always wins.
      </p>
    </div>
  );
}
