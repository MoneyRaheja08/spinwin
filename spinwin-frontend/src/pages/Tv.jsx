import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { getTvState, getGifts } from "../api";
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

export default function Tv() {
  const [phase, setPhase] = useState("idle"); // idle | ready | spinning | result
  const [wheel, setWheel] = useState([]);
  const [customerName, setCustomerName] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [easing, setEasing] = useState(EASE_OUT);
  const [result, setResult] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [muted, setMuted] = useState(true);

  const rotRef = useRef(0);
  const shownSessionRef = useRef(null);   // session currently on screen
  const animatedRef = useRef(null);       // session we've already animated
  const phaseRef = useRef("idle");
  const playUrl = `${location.origin}/play?tv=${encodeURIComponent(TV_CODE)}`;

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // show the real gifts on the idle wheel (before anyone scans)
  useEffect(() => {
    getGifts(TV_CODE).then((g) => {
      if (g && g.length && phaseRef.current === "idle") setWheel(g);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const s = await getTvState(TV_CODE);
        if (!alive) return;
        handle(s);
      } catch { /* keep trying */ }
    }
    poll();
    const t = setInterval(poll, 1200);
    return () => { alive = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handle(s) {
    if (s.status === "idle") {
      if (phaseRef.current !== "idle") {
        setPhase("idle"); setCustomerName(null); setResult(null);
        setSpinning(false); setRotation(0); rotRef.current = 0;
        shownSessionRef.current = null; animatedRef.current = null;
      }
      return;
    }

    // a (new) customer connected
    if (s.status === "ready") {
      if (shownSessionRef.current !== s.session_id) {
        shownSessionRef.current = s.session_id;
        setWheel(s.display_wheel || s.wheel || []);
        setCustomerName(s.customer_name || null);
        setResult(null); setSpinning(false); setRotation(0); rotRef.current = 0;
        setPhase("ready");
      }
      return;
    }

    // spin finished on the server -> animate once
    if (s.status === "done" && s.result) {
      setCustomerName(s.customer_name || null);
      if (animatedRef.current !== s.session_id) {
        animatedRef.current = s.session_id;
        shownSessionRef.current = s.session_id;
        const full = s.display_wheel || s.wheel || wheel;
        const w = displayWheel(full);
        setWheel(full);
        setPhase("spinning");
        runCountdown();
        let idx = w.findIndex((x) => x.prize_id === s.result.prize_id);
        if (idx < 0) idx = 0;
        const { p1, p2 } = spinPlan(idx, w.length, rotRef.current);
        setEasing(EASE_IN);
        requestAnimationFrame(() => { setSpinning(true); setRotation(p1); rotRef.current = p1; });
        setTimeout(() => { setEasing(EASE_OUT); setRotation(p2); rotRef.current = p2; }, PHASE * 1000);
        setTimeout(() => {
          setResult(s.result); setPhase("result"); fire(); sound.win();
        }, SPIN_SECONDS * 1000);
      }
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
    (function frame() {
      confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0 }, colors: branding.wheelColors });
      confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1 }, colors: branding.wheelColors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }
  function toggleMute() {
    sound.unlock();
    const next = !muted; setMuted(next); sound.setMuted(next);
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
        <button className="mute-btn" onClick={toggleMute} aria-label="Sound">
          {muted ? "🔇" : "🔊"}
        </button>
      </header>

      {customerName && phase !== "idle" && (
        <div className="tv-greeting">Namaste, {customerName}! 🙏</div>
      )}

      <main className="tv-stage">
        <section className="tv-wheel">
          <Wheel segments={displayWheel(wheel)} rotation={rotation}
                 duration={PHASE} spinning={spinning} easing={easing} />
          {countdown !== null && <div className="countdown">{countdown}</div>}
        </section>

        <aside className="tv-panel">
          {phase === "idle" && (
            <div className="panel-card">
              <p className="panel-kicker">Just bought a phone?</p>
              <h2 className="panel-h">Scan to play</h2>
              <div className="qr-box">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=440x440&margin=10&data=${encodeURIComponent(playUrl)}`}
                  width="220" height="220" alt="Scan to play"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </div>
              <p className="panel-sub">Point your camera at the code</p>
            </div>
          )}

          {phase === "ready" && (
            <div className="panel-card">
              <p className="panel-kicker">{branding.companyName}</p>
              <h2 className="panel-h">{customerName ? `Get ready, ${customerName}!` : "Customer ready"}</h2>
              <p className="panel-sub">Press <b>Spin</b> on your phone</p>
            </div>
          )}

          {phase === "spinning" && (
            <div className="panel-card">
              <h2 className="panel-h">Spinning…</h2>
              <p className="panel-sub">Good luck!</p>
            </div>
          )}

          {phase === "result" && result && (
            <div className="panel-card win">
              <p className="panel-kicker">Congratulations{customerName ? ", " + customerName : ""}!</p>
              {result.prize_image && (
                <img className="win-img" src={result.prize_image} alt={result.prize_name} />
              )}
              <h2 className="win-prize">{result.prize_name}</h2>
              <p className="panel-sub">Collect your prize at the counter</p>
            </div>
          )}
        </aside>
      </main>

      <footer className="tv-foot">{branding.tagline}</footer>
    </div>
  );
}
