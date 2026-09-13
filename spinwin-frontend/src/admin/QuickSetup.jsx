import { useState } from "react";
import { get, post, patch, del, useAsync } from "./api";

const rupee = (n) => "\u20B9" + Number(n).toLocaleString("en-IN");
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
  const ranges = data.slabs.filter((s) => s.is_active !== false).sort((a, b) => a.min_price - b.min_price);

  return (
    <div>
      <h1 className="page-h">Gifts by price</h1>

      <div className="card">
        <p className="muted" style={{ lineHeight: 1.6 }}>
          Add a phone price range, then type gift names under it.<br />
          <b>One gift</b> = everyone in that range wins it. <b>Many gifts</b> = one is picked at random.<br />
          <b>Per day</b> limits how many times a gift can be given each day (blank = no limit). When it runs out for the day, it stops appearing until tomorrow.
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
  const [name, setName] = useState("");
  const [perDay, setPerDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function addGift() {
    if (!name.trim()) return;
    setBusy(true); setMsg("");
    try {
      let prize = prizes.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (!prize) prize = await post("/api/admin/prizes", { name: name.trim(), value: 0, is_active: true });
      if (rules.some((r) => r.prize_id === prize.id)) {
        setMsg("That gift is already in this range."); setBusy(false); return;
      }
      if (!inv[prize.id]) await post("/api/admin/inventory", { prize_id: prize.id, quantity_initial: UNLIMITED });
      await post("/api/admin/rules", {
        slab_id: slab.id, prize_id: prize.id, weight: 1,
        daily_limit: perDay === "" ? null : Number(perDay),
      });
      setName(""); setPerDay("");
      onChange();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function removeGift(ruleId) { await del(`/api/admin/rules/${ruleId}`); onChange(); }
  async function setDaily(ruleId, val) {
    await patch(`/api/admin/rules/${ruleId}`, { daily_limit: val === "" ? null : Number(val) });
    onChange();
  }
  async function removeRange() {
    if (!window.confirm(`Remove the range "${slab.name}"?`)) return;
    await patch(`/api/admin/slabs/${slab.id}`, { is_active: false });
    onChange();
  }

  const single = rules.length === 1;

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>{slab.name}</h3>
        <button className="btn btn-ghost sm" onClick={removeRange}>Remove range</button>
      </div>

      <table className="table" style={{ marginTop: 10 }}>
        <thead><tr><th>Gift</th><th>Chance</th><th>Per day</th><th></th></tr></thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td>{r.prize_name}</td>
              <td className="muted">{single ? "Always" : r.percentage + "%"}</td>
              <td>
                <input className="input sm" type="number" placeholder="\u221E" defaultValue={r.daily_limit ?? ""}
                       onBlur={(e) => { const v = e.target.value; if (String(r.daily_limit ?? "") !== v) setDaily(r.id, v); }} />
              </td>
              <td style={{ textAlign: "right" }}>
                <button className="btn btn-ghost sm" onClick={() => removeGift(r.id)}>Remove</button>
              </td>
            </tr>
          ))}
          {!rules.length && <tr><td colSpan="4" className="muted">No gifts yet — add one below.</td></tr>}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" placeholder="Gift name (e.g. Free Watch)" value={name}
               onChange={(e) => setName(e.target.value)}
               onKeyDown={(e) => e.key === "Enter" && addGift()} />
        <input className="input sm" type="number" placeholder="Per day (blank = \u221E)" value={perDay}
               onChange={(e) => setPerDay(e.target.value)} />
        <button className="btn btn-gold" onClick={addGift} disabled={busy || !name.trim()}>Add gift</button>
      </div>
      {msg && <p className="adm-err">{msg}</p>}
    </div>
  );
}
