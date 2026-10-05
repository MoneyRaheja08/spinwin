import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { getCategories, registerPublic, kioskSpin } from "../api";
import { branding } from "../branding";
import * as sound from "../sound";
import Wheel, { spinPlan } from "../components/Wheel";

const TV_CODE = new URLSearchParams(location.search).get("tv") || "TV-001";
const PHASE = 4;
const SPIN_SECONDS = PHASE * 2;
const EASE_IN = "cubic-bezier(0.45, 0, 0.9, 0.6)";
const EASE_OUT = "cubic-bezier(0.1, 0.7, 0.2, 1)";
const PLACEHOLDER = [
  { name: "₹100" }, { name: "₹500" }, { name: "Earphones" },
  { name: "Smartwatch" }, { name: "Cover" }, { name: "₹2000" },
];

function displayWheel(list) {
  const base = list && list.length ? list : PLACEHOLDER;
  if (base.length >= 3) return base;
  const times = Math.ceil(6 / base.length);
  const out = [];
  for (let i = 0; i < times; i++) out.push(...base);
  return out;
}

export default function Kiosk() {
  const [phase, setPhase] = useState("enter"); // enter|category|registering|ready|spinning|result|error
  const [bill, setBill] = useState("");
  const [cats, setCats] = useState([]);
  const [wheel, setWheel] = useState([]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [easing, setEasing] = useState(EASE_OUT);
  const [result, setResult] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [msg, setMsg] = useState("");
  const sessionRef = useRef(null);
  const rotRef = useRef(0);

  useEffect(() => { getCategories(TV_CODE).then(setCats).catch(() => {}); }, []);

  function reset() {
    sessionRef.current = null;
    setPhase("enter"); setBill(""); setWheel([]); setResult(null);
    setRotation(0); rotRef.current = 0; setSpinning(false); setMsg("");
  }

  function key(d) {
    sound.unlock();
    if (phase !== "enter") return;
    if (d === "del") setBill((b) => b.slice(0, -1));
    else if (d === "clr") setBill("");
    else setBill((b) => (b + d).slice(0, 20));
  }

  function toCategory() {
    if (!bill.trim()) return;
    sound.unlock(); setMsg(""); setPhase("category");
  }

  async function pickCategory(catId) {
    sound.unlock();
    setPhase("registering"); setMsg("");
    try {
      const r = await registerPublic(TV_CODE, "Guest", bill.trim(), catId);
      sessionRef.current = r.session_id;
      setWheel(r.display_wheel && r.display_wheel.length ? r.display_wheel
               : (r.wheel && r.wheel.length ? r.wheel : PLACEHOLDER));
      setPhase("ready");
    } catch (err) {
      setMsg(err.message); setPhase("error");
    }
  }

  async function spin() {
    if (!sessionRef.current) return;
    sound.unlock();
    setPhase("spinning");
    try {
      const res = await kioskSpin(sessionRef.current);
      const w = displayWheel(wheel);
      let idx = w.findIndex((x) => x.prize_id === res.prize_id);
      if (idx < 0) idx = 0;
      runCountdown();
      const { p1, p2 } = spinPlan(idx, w.length, rotRef.current);
      setEasing(EASE_IN);
      requestAnimationFrame(() => { setSpinning(true); setRotation(p1); rotRef.current = p1; });
      setTimeout(() => { setEasing(EASE_OUT); setRotation(p2); rotRef.current = p2; }, PHASE * 1000);
      setTimeout(() => { setResult(res); setPhase("result"); fire(); sound.win(); }, SPIN_SECONDS * 1000);
    } catch (err) {
      setMsg(err.message); setPhase("error");
    }
  }

  function runCountdown() {
    let n = 3; setCountdown(n); sound.countdownBeep();
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(t); setCountdown(null); }
      else { setCountdown(n); sound.countdownBeep(); }
    }, 700);
  }
  function fire() {
    const end = Date.now() + 2500;
    (function f() {
      confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0 }, colors: branding.wheelColors });
      confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1 }, colors: branding.wheelColors });
      if (Date.now() < end) requestAnimationFrame(f);
    })();
  }

  return (
    <div className="tv">
      <header className="tv-top">
        <div className="brand">
          {branding.logoUrl
            ? <img src={branding.logoUrl} alt={branding.companyName} className="logo-img" />
            : <span className="logo-mark">{branding.companyName}</span>}
        </div>
        <h1 className="tv-title">{branding.gameTitle}</h1>
        <span style={{ width: "6vh" }} />
      </header>

      <main className="tv-stage">
        <section className="tv-wheel">
          <Wheel segments={displayWheel(wheel)} rotation={rotation}
                 duration={PHASE} spinning={spinning} easing={easing} />
          {countdown !== null && <div className="countdown">{countdown}</div>}
        </section>

        <aside className="tv-panel">
          {phase === "enter" && (
            <div className="panel-card">
              <h2 className="panel-h">Enter bill number</h2>
              <div className="kiosk-display">{bill || "—"}</div>
              <div className="kiosk-pad">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clr", "0", "del"].map((k) => (
                  <button key={k} className={`pad-key ${k === "clr" || k === "del" ? "pad-fn" : ""}`} onClick={() => key(k)}>
                    {k === "del" ? "⌫" : k === "clr" ? "C" : k}
                  </button>
                ))}
              </div>
              <button className="kiosk-cta" onClick={toCategory} disabled={!bill}>Continue</button>
            </div>
          )}

          {(phase === "category" || phase === "registering") && (
            <div className="panel-card">
              <h2 className="panel-h">Choose category</h2>
              <div className="tv-cats">
                {cats.map((c) => (
                  <button key={c.id} className="tv-cat-btn" onClick={() => pickCategory(c.id)}>{c.name}</button>
                ))}
                {!cats.length && <p className="panel-sub">No categories set up yet.</p>}
              </div>
            </div>
          )}

          {phase === "ready" && (
            <div className="panel-card">
              <h2 className="panel-h">Ready!</h2>
              <p className="panel-kicker">You have 1 spin</p>
              <button className="kiosk-cta big" onClick={spin}>SPIN</button>
            </div>
          )}

          {phase === "spinning" && (
            <div className="panel-card"><h2 className="panel-h">Spinning…</h2><p className="panel-sub">Good luck!</p></div>
          )}

          {phase === "result" && result && (
            <div className="panel-card win">
              <p className="panel-kicker">Congratulations!</p>
              {result.prize_image && (
                <img className="win-img" src={result.prize_image} alt={result.prize_name} />
              )}
              <h2 className="win-prize">{result.prize_name}</h2>
              <button className="kiosk-cta" onClick={reset}>Next customer</button>
            </div>
          )}

          {phase === "error" && (
            <div className="panel-card">
              <h2 className="panel-h">Sorry</h2>
              <p className="panel-sub">{msg}</p>
              <button className="kiosk-cta" onClick={reset}>Try again</button>
            </div>
          )}
        </aside>
      </main>

      <footer className="tv-foot">{branding.tagline}</footer>
    </div>
  );
}
