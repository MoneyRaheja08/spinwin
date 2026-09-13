import { useEffect, useState } from "react";
import { isAuthed, role, get, post, logout } from "../admin/api";
import { checkEligibility, createSession } from "../api";
import Login from "../admin/Login";
import { branding } from "../branding";
import "../admin/admin.css";

export default function Staff() {
  const [authed, setAuthed] = useState(isAuthed());
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  return <Console onSignOut={() => { logout(); setAuthed(false); }} />;
}

function RegisterBill() {
  const [f, setF] = useState({ customer_name: "", bill_number: "", model: "", price: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!f.customer_name || !f.bill_number || !f.price) return;
    setBusy(true); setMsg("");
    try {
      const r = await post("/api/staff/bills", {
        customer_name: f.customer_name.trim(),
        bill_number: f.bill_number.trim(),
        model: f.model.trim(),
        price: Number(f.price),
      });
      setMsg(`\u2713 Bill ${r.bill_number} created for ${r.customer_name}. They can now spin at the TV.`);
      setF({ customer_name: "", bill_number: "", model: "", price: "" });
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <h3>Register a bill</h3>
      <div className="form-grid">
        <label className="field"><span>Customer name</span>
          <input className="input" value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} /></label>
        <label className="field"><span>Bill number</span>
          <input className="input" value={f.bill_number} onChange={(e) => setF({ ...f, bill_number: e.target.value })} /></label>
        <label className="field"><span>Mobile model</span>
          <input className="input" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} /></label>
        <label className="field"><span>Price</span>
          <input className="input" type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
      </div>
      {msg && <p className={msg.startsWith("\u2713") ? "adm-ok" : "adm-err"}>{msg}</p>}
      <button className="btn btn-gold" onClick={create}
              disabled={busy || !f.customer_name || !f.bill_number || !f.price}>
        {busy ? "Saving\u2026" : "Create bill"}
      </button>
    </div>
  );
}

function Console({ onSignOut }) {
  const [tvs, setTvs] = useState([]);
  const [tv, setTv] = useState("");
  const [bill, setBill] = useState("");
  const [info, setInfo] = useState(null);
  const [session, setSession] = useState(null);
  const [prizes, setPrizes] = useState([]);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const isAdmin = role() === "SUPER_ADMIN" || role() === "STORE_ADMIN";

  useEffect(() => {
    get("/api/my/tv-devices").then((t) => { setTvs(t); if (t[0]) setTv(t[0].code); })
      .catch((e) => setMsg(e.message));
    if (isAdmin) get("/api/admin/prizes").then(setPrizes).catch(() => {});
    // eslint-disable-next-line
  }, []);

  const resetFlow = () => { setInfo(null); setSession(null); setResult(null); setMsg(""); };

  async function search() {
    resetFlow();
    if (!bill.trim() || !tv) return;
    setBusy(true);
    try { setInfo(await checkEligibility(tv, bill.trim())); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function start() {
    setBusy(true); setMsg("");
    try { setSession(await createSession(info.bill_id, tv)); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }
  async function force(prizeId) {
    if (!session || !prizeId) return;
    try { await post(`/api/sessions/${session.session_id}/force`, { prize_id: prizeId }); setMsg("Winner set for this spin."); }
    catch (e) { setMsg(e.message); }
  }
  async function spin() {
    setBusy(true); setMsg("");
    try { setResult(await post(`/api/sessions/${session.session_id}/spin`, {})); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="adm">
      <div className="adm-main" style={{ gridColumn: "1 / -1" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h1 className="page-h">Staff console</h1>
          <button className="btn btn-ghost sm" onClick={onSignOut}>Sign out</button>
        </div>

        <RegisterBill />

        <div className="card">
          <div className="form-grid">
            <label className="field"><span>TV / counter</span>
              <select className="input" value={tv} onChange={(e) => { setTv(e.target.value); resetFlow(); }}>
                {tvs.map((t) => <option key={t.id} value={t.code}>{t.code}{t.name ? ` \u2014 ${t.name}` : ""}</option>)}
                {!tvs.length && <option value="">No TVs for your store</option>}
              </select></label>
            <label className="field"><span>Bill number</span>
              <input className="input" value={bill} onChange={(e) => setBill(e.target.value)}
                     onKeyDown={(e) => e.key === "Enter" && search()} /></label>
            <div className="field"><span>&nbsp;</span>
              <button className="btn btn-gold" onClick={search} disabled={busy || !tv}>Search bill</button></div>
          </div>
          {msg && <p className={msg.includes("set") ? "adm-ok" : "adm-err"}>{msg}</p>}
        </div>

        {info && (
          <div className="card">
            {!info.eligible ? (
              <p className="adm-err">
                {info.spin_status === "PLAYED"
                  ? "This bill has already been used to spin."
                  : "This bill isn't eligible to spin."}
              </p>
            ) : (
              <>
                <h3>Eligible \u2014 1 spin</h3>
                <table className="table"><tbody>
                  <tr><td>Product</td><td>{info.item?.model || "\u2014"}</td></tr>
                  <tr><td>Price</td><td>{info.item ? branding.currency + info.item.price : "\u2014"}</td></tr>
                  <tr><td>Prize slab</td><td>{info.slab?.name || "\u2014"}</td></tr>
                </tbody></table>

                {!session ? (
                  <button className="btn btn-gold" onClick={start} disabled={busy}>Start on {tv}</button>
                ) : result ? (
                  <div className="card" style={{ marginTop: 14 }}>
                    <p className="muted">Prize won</p>
                    <h2 style={{ color: "var(--gold)", fontFamily: "var(--display)", margin: "4px 0" }}>{result.prize_name}</h2>
                    {result.prize_value > 0 && <p>{branding.currency}{result.prize_value}</p>}
                    {result.is_forced && <p className="muted">(controlled winner)</p>}
                    <button className="btn btn-ghost" onClick={() => { setBill(""); resetFlow(); }}>Next customer</button>
                  </div>
                ) : (
                  <div>
                    <p className="adm-ok">Sent to {tv} \u2014 the wheel is ready on screen.</p>
                    {isAdmin && (
                      <div className="row" style={{ margin: "10px 0" }}>
                        <select className="input" defaultValue="" onChange={(e) => e.target.value && force(e.target.value)}>
                          <option value="">Set winner (admin only)\u2026</option>
                          {prizes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                    )}
                    <button className="btn btn-gold" onClick={spin} disabled={busy}>SPIN</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
