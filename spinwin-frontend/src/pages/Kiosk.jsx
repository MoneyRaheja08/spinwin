import { useRef, useState } from "react";
import confetti from "canvas-confetti";
import { checkEligibility, createSession, kioskSpin } from "../api";
import { branding } from "../branding";
import * as sound from "../sound";
import Wheel, { spinPlan } from "../components/Wheel";

const TV_CODE = new URLSearchParams(location.search).get("tv") || "TV-001";
const PHASE = 4;                  // seconds per phase
const SPIN_SECONDS = PHASE * 2;   // 4s clockwise + 4s anticlockwise
const EASE_IN = "cubic-bezier(0.45, 0, 0.9, 0.6)";   // accelerate
const EASE_OUT = "cubic-bezier(0.1, 0.7, 0.2, 1)";    // decelerate to stop
const PLACEHOLDER = [
  { name: "\u20B9100" }, { name: "\u20B9500" }, { name: "Earphones" },
  { name: "Smartwatch" }, { name: "Cover" }, { name: "\u20B92000" },
];

// A 1- or 2-gift range would draw as an ugly single blob, so repeat the
// gifts into ~6 colourful segments. Landing on any copy is still correct.
function displayWheel(list) {
  const base = list && list.length ? list : PLACEHOLDER;
  if (base.length >= 3) return base;
  const times = Math.ceil(6 / base.length);
  const out = [];
  for (let i = 0; i < times; i++) out.push(...base);
  return out;
}

export default function Kiosk() {
  const [phase, setPhase] = useState("enter"); // enter|checking|ready|spinning|result|error
  const [bill, setBill] = useState("");
  const [wheel, setWheel] = useState([]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [easing, setEasing] = useState(EASE_OUT);
  const [result, setResult] = useState(null);
  const [customerName, setCustomerName] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [msg, setMsg] = useState("");
  const sessionRef = useRef(null);
  const rotRef = useRef(0);

  function reset() {
    sessionRef.current = null;
    setPhase("enter"); setBill(""); setWheel([]); setResult(null); setCustomerName(null);
    setRotation(0); rotRef.current = 0; setSpinning(false); setMsg("");
  }

  function key(d) {
    sound.unlock();
    if (phase !== "enter") return;
    if (d === "del") setBill((b) => b.slice(0, -1));
    else if (d === "clr") setBill("");
    else setBill((b) => (b + d).slice(0, 20));
  }

  async function check() {
    if (!bill.trim()) return;
    sound.unlock();
    setPhase("checking"); setMsg("");
    try {
      const e = await checkEligibility(TV_CODE, bill.trim());
      if (!e.eligible) {
        setMsg(e.spin_status === "PLAYED" ? "This bill has already been used to spin." : "This bill isn't eligible to spin.");
        setPhase("error");
        return;
      }
      setWheel((e.display_wheel && e.display_wheel.length ? e.display_wheel
               : (e.wheel && e.wheel.length ? e.wheel : PLACEHOLDER)));
      setCustomerName(e.customer_name || null);
      const s = await createSession(e.bill_id, TV_CODE);
      sessionRef.current = s.session_id;
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
      const res = await kioskSpin(sessionRef.current);   // server decides the prize
      const w = displayWheel(wheel);
      let idx = w.findIndex((x) => x.prize_id === res.prize_id);
      if (idx < 0) idx = 0;
      runCountdown();
      const { p1, p2 } = spinPlan(idx, w.length, rotRef.current);
      // phase 1: clockwise
      setEasing(EASE_IN);
      requestAnimationFrame(() => { setSpinning(true); setRotation(p1); rotRef.current = p1; });
      // phase 2: anticlockwise, lands on the winner
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

      {customerName && <div className="tv-greeting">Namaste, {customerName}! 🙏</div>}

      <main className="tv-stage">
        <section className="tv-wheel">
          <Wheel segments={displayWheel(wheel)} rotation={rotation}
                 duration={PHASE} spinning={spinning} easing={easing} />
          {countdown !== null && <div className="countdown">{countdown}</div>}
        </section>

        <aside className="tv-panel">
          {(phase === "enter" || phase === "checking") && (
            <div className="panel-card">
              <h2 className="panel-h">Enter bill number</h2>
              <div className="kiosk-display">{bill || "\u2014"}</div>
              <div className="kiosk-pad">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clr", "0", "del"].map((k) => (
                  <button key={k} className={`pad-key ${k === "clr" || k === "del" ? "pad-fn" : ""}`} onClick={() => key(k)}>
                    {k === "del" ? "\u232B" : k === "clr" ? "C" : k}
                  </button>
                ))}
              </div>
              <button className="kiosk-cta" onClick={check} disabled={phase === "checking" || !bill}>
                {phase === "checking" ? "Checking…" : "Check & play"}
              </button>
            </div>
          )}

          {phase === "ready" && (
            <div className="panel-card">
              <h2 className="panel-h">Namaste{customerName ? ", " + customerName : ""}!</h2>
              <p className="panel-kicker">You have 1 spin</p>
              <button className="kiosk-cta big" onClick={spin}>SPIN</button>
            </div>
          )}

          {phase === "spinning" && (
            <div className="panel-card"><h2 className="panel-h">Spinning…</h2><p className="panel-sub">Good luck!</p></div>
          )}

          {phase === "result" && result && (
            <div className="panel-card win">
              <p className="panel-kicker">Congratulations{customerName ? ", " + customerName : ""}!</p>
              {result.prize_image && (
                <img className="win-img" src={result.prize_image} alt={result.prize_name} />
              )}
              <h2 className="win-prize">{result.prize_name}</h2>
              {result.prize_value > 0 && (
                <p className="win-value">{branding.currency}{result.prize_value.toLocaleString("en-IN")}</p>
              )}
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
