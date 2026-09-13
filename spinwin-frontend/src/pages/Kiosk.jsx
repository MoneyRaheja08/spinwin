import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { makeSocket } from "../socket";
import { checkEligibility, createSession } from "../api";
import { branding } from "../branding";
import * as sound from "../sound";
import Wheel, { targetRotation } from "../components/Wheel";

const TV_CODE = new URLSearchParams(location.search).get("tv") || "TV-001";
const PLACEHOLDER = [
  { name: "\u20B9100" }, { name: "\u20B9500" }, { name: "Earphones" },
  { name: "Smartwatch" }, { name: "Cover" }, { name: "\u20B92000" },
];

export default function Kiosk() {
  const [phase, setPhase] = useState("enter"); // enter|checking|ready|spinning|result|error
  const [bill, setBill] = useState("");
  const [wheel, setWheel] = useState([]);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [duration, setDuration] = useState(6);
  const [result, setResult] = useState(null);
  const [customerName, setCustomerName] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [msg, setMsg] = useState("");
  const sockRef = useRef(null);
  const rotRef = useRef(0);

  useEffect(() => () => sockRef.current && sockRef.current.close(), []);

  function reset() {
    if (sockRef.current) { sockRef.current.close(); sockRef.current = null; }
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
      setWheel(e.wheel && e.wheel.length ? e.wheel : PLACEHOLDER);
      setCustomerName(e.customer_name || null);
      const s = await createSession(e.bill_id, TV_CODE);
      const sock = makeSocket();
      sockRef.current = sock;
      sock.on("connect", () => sock.emit("customer_join", { pairing_code: s.pairing_code }, () => {}));
      sock.on("SPIN_STARTED", (d) => {
        const w = d.wheel && d.wheel.length ? d.wheel : wheel;
        setWheel(w); setDuration(d.duration || 6);
        runCountdown();
        const base = rotRef.current - (rotRef.current % 360);
        const target = base + targetRotation(d.winning_index, w.length, 6);
        requestAnimationFrame(() => { setSpinning(true); setRotation(target); rotRef.current = target; });
      });
      sock.on("PRIZE_WON", (d) => { setResult(d.result); setPhase("result"); fire(); sound.win(); });
      sock.on("SPIN_ERROR", (d) => { setMsg(d.error); setPhase("error"); });
      setPhase("ready");
    } catch (err) {
      setMsg(err.message); setPhase("error");
    }
  }

  function spin() {
    sound.unlock();
    setPhase("spinning");
    sockRef.current.emit("SPIN_REQUESTED", {});
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
          <Wheel segments={wheel.length ? wheel : PLACEHOLDER} rotation={rotation}
                 duration={duration} spinning={spinning} />
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
                {phase === "checking" ? "Checking\u2026" : "Check & play"}
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
            <div className="panel-card"><h2 className="panel-h">Spinning\u2026</h2><p className="panel-sub">Good luck!</p></div>
          )}

          {phase === "result" && result && (
            <div className="panel-card win">
              <p className="panel-kicker">Congratulations{customerName ? ", " + customerName : ""}!</p>
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
