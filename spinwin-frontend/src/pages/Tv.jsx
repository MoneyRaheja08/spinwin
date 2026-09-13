import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import confetti from "canvas-confetti";
import { makeSocket } from "../socket";
import { branding } from "../branding";
import * as sound from "../sound";
import Wheel, { targetRotation } from "../components/Wheel";

const TV_CODE = new URLSearchParams(location.search).get("tv") || "TV-001";

export default function Tv() {
  const [phase, setPhase] = useState("idle"); // idle | ready | spinning | result
  const [wheel, setWheel] = useState([]);
  const [masked, setMasked] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [duration, setDuration] = useState(6);
  const [result, setResult] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [muted, setMuted] = useState(true);
  const socketRef = useRef(null);
  const rotRef = useRef(0);

  const playUrl = `${location.origin}/play?tv=${encodeURIComponent(TV_CODE)}`;

  useEffect(() => {
    const s = makeSocket();
    socketRef.current = s;

    s.on("connect", () => s.emit("tv_join", { tv_code: TV_CODE }));

    s.on("SESSION_ATTACHED", (d) => {
      setWheel(d.wheel || []);
      setMasked(d.masked_mobile || null);
      setResult(null);
      setRotation(0); rotRef.current = 0;
      setSpinning(false);
      setPhase("ready");
      s.emit("tv_watch", { session_id: d.session_id });
    });

    s.on("SPIN_STARTED", (d) => {
      const w = d.wheel && d.wheel.length ? d.wheel : wheel;
      setWheel(w);
      setDuration(d.duration || 6);
      setPhase("spinning");
      runCountdown();
      // spin from current rotation to the target, adding full turns
      const base = rotRef.current - (rotRef.current % 360);
      const target = base + targetRotation(d.winning_index, w.length, 6);
      requestAnimationFrame(() => {
        setSpinning(true);
        setRotation(target);
        rotRef.current = target;
      });
    });

    s.on("PRIZE_WON", (d) => {
      setResult(d.result);
      setPhase("result");
      fireConfetti();
      sound.win();
    });

    s.on("SPIN_ERROR", (d) => {
      setPhase("ready");
      alert(d.error);
    });

    return () => s.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runCountdown() {
    let n = 3;
    setCountdown(n);
    sound.countdownBeep();
    const t = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(t); setCountdown(null); }
      else { setCountdown(n); sound.countdownBeep(); }
    }, 700);
  }

  function fireConfetti() {
    const end = Date.now() + 2500;
    (function frame() {
      confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0 }, colors: branding.wheelColors });
      confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1 }, colors: branding.wheelColors });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }

  function toggleMute() {
    sound.unlock();
    const next = !muted;
    setMuted(next);
    sound.setMuted(next);
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
          {muted ? "\uD83D\uDD07" : "\uD83D\uDD0A"}
        </button>
      </header>

      <main className="tv-stage">
        <section className="tv-wheel">
          <Wheel segments={wheel.length ? wheel : PLACEHOLDER} rotation={rotation}
                 duration={duration} spinning={spinning} />
          {countdown !== null && <div className="countdown">{countdown}</div>}
        </section>

        <aside className="tv-panel">
          {phase === "idle" && (
            <div className="panel-card">
              <p className="panel-kicker">Just bought a phone?</p>
              <h2 className="panel-h">Scan to play</h2>
              <div className="qr-box">
                <QRCodeSVG value={playUrl} size={220} bgColor="#ffffff" fgColor="#120a2e" includeMargin />
              </div>
              <p className="panel-sub">Point your camera at the code</p>
            </div>
          )}

          {phase === "ready" && (
            <div className="panel-card">
              <p className="panel-kicker">{branding.companyName}</p>
              <h2 className="panel-h">Customer ready</h2>
              {masked && <p className="masked">{masked}</p>}
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
              <p className="panel-kicker">Congratulations!</p>
              <h2 className="win-prize">{result.prize_name}</h2>
              {result.prize_value > 0 && (
                <p className="win-value">{branding.currency}{result.prize_value.toLocaleString("en-IN")}</p>
              )}
              <p className="panel-sub">Collect your prize at the counter</p>
            </div>
          )}
        </aside>
      </main>

      <footer className="tv-foot">{branding.tagline}</footer>
    </div>
  );
}

const PLACEHOLDER = [
  { name: "\u20B9100" }, { name: "\u20B9500" }, { name: "Earphones" },
  { name: "Smartwatch" }, { name: "Cover" }, { name: "\u20B92000" },
];
