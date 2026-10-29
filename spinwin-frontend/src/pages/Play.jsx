import { useEffect, useRef, useState } from "react";
import { registerPublic, kioskSpin, getCategories } from "../api";
import { branding } from "../branding";
import * as sound from "../sound";

const TV_CODE = new URLSearchParams(location.search).get("tv");
const IDLE_MS = 3 * 60 * 1000; // return to start if ready-but-not-spun for 3 min

// Instagram follow step. Every TV shows it; DH and ML use their own handle,
// all other TVs use the default. Add/override a TV code here anytime.
const IG_DEFAULT = "https://www.instagram.com/ashokaenterpriseschd";
const IG_BY_TV = {
  DH: "https://www.instagram.com/ashokaenterprisesdh",
  ML: "https://www.instagram.com/ashokaenterprisesdh",
};
const CODE = (TV_CODE || "").toUpperCase();
const IG_URL = TV_CODE ? (IG_BY_TV[CODE] || IG_DEFAULT) : null;
const IG_HANDLE = IG_URL ? "@" + IG_URL.split("/").filter(Boolean).pop() : "";
const FIRST_STEP = TV_CODE ? "instagram" : "notv";

export default function Play() {
  const [step, setStep] = useState(FIRST_STEP); // notv|instagram|enter|category|registering|ready|spinning|result|error
  const [f, setF] = useState({ name: "", bill: "" });
  const [cats, setCats] = useState([]);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState(null);
  const sessionRef = useRef(null);

  useEffect(() => {
    if (!TV_CODE) return;
    getCategories(TV_CODE).then(setCats).catch(() => {});
  }, []);

  function openInstagram() {
    sound.unlock();
    window.open(IG_URL, "_blank", "noopener");
  }

  // If the customer gets to "ready" but never taps SPIN, the big TV screen
  // returns to its QR after 3 min — so reset the phone the same way, ready for
  // the next person. Also covers the "category" screen left untouched.
  useEffect(() => {
    if (step !== "ready" && step !== "category") return;
    const t = setTimeout(() => {
      sessionRef.current = null;
      setF({ name: "", bill: "" });
      setResult(null);
      setMsg("");
      setStep(FIRST_STEP);
    }, IDLE_MS);
    return () => clearTimeout(t);
  }, [step]);

  function toCategory() {
    if (!f.name.trim() || !f.bill.trim()) return;
    sound.unlock();
    setMsg("");
    setStep("category");
  }

  async function pickCategory(catId) {
    sound.unlock();
    setStep("registering"); setMsg("");
    try {
      const r = await registerPublic(TV_CODE, f.name.trim(), f.bill.trim(), catId);
      sessionRef.current = r.session_id;
      setStep("ready");
    } catch (e) { setMsg(e.message); setStep("error"); }
  }

  async function onSpin() {
    sound.unlock();
    setStep("spinning");
    try {
      const res = await kioskSpin(sessionRef.current);
      setTimeout(() => { setResult(res); setStep("result"); sound.win(); }, 8500);
    } catch (e) { setMsg(e.message); setStep("error"); }
  }

  function reset() {
    sessionRef.current = null;
    setF({ name: "", bill: "" });
    setResult(null); setMsg("");
    setStep(FIRST_STEP);
  }

  return (
    <div className="play">
      <div className="play-brand">{branding.companyName}</div>

      {step === "notv" && (
        <div className="play-card">
          <h1 className="play-h">Scan the TV code</h1>
          <p className="play-sub">Open your camera and scan the QR on the screen to start.</p>
        </div>
      )}

      {step === "instagram" && (
        <div className="play-card">
          <p className="play-kicker">{branding.companyName}</p>
          <h1 className="play-h">Follow us to play 🎁</h1>
          <p className="play-sub">Follow <b>{IG_HANDLE}</b> on Instagram, then come back and spin to win.</p>
          <button className="play-btn" onClick={openInstagram}>📸 Follow on Instagram</button>
          <button className="play-btn big" style={{ marginTop: 14 }}
                  onClick={() => { setMsg(""); setStep("enter"); }}>
            Continue to play
          </button>
          <p className="play-sub" style={{ marginBottom: 0 }}>Already following? Just tap Continue.</p>
        </div>
      )}

      {step === "enter" && (
        <div className="play-card">
          <h1 className="play-h">{branding.gameTitle}</h1>
          <p className="play-sub">Enter your details to play</p>
          <input className="play-input" placeholder="Your name"
                 value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className="play-input" placeholder="Bill number"
                 value={f.bill} onChange={(e) => setF({ ...f, bill: e.target.value })} />
          <button className="play-btn" onClick={toCategory}
                  disabled={!f.name.trim() || !f.bill.trim()}>Continue</button>
        </div>
      )}

      {step === "category" && (
        <div className="play-card">
          <p className="play-kicker">Hi {f.name.trim()}</p>
          <h1 className="play-h">Choose your category</h1>
          <div className="cat-grid">
            {cats.map((c) => (
              <button key={c.id} className="cat-btn" onClick={() => pickCategory(c.id)}>{c.name}</button>
            ))}
            {!cats.length && <p className="play-sub">No categories set up yet.</p>}
          </div>
        </div>
      )}

      {step === "registering" && (
        <div className="play-card"><h1 className="play-h">Please wait…</h1></div>
      )}

      {step === "ready" && (
        <div className="play-card">
          <p className="play-kicker">You're in, {f.name.trim()}!</p>
          <h1 className="play-h">Ready to spin</h1>
          <p className="play-sub">Look up at the big screen and tap below.</p>
          <button className="play-btn big" onClick={onSpin}>SPIN NOW</button>
        </div>
      )}

      {step === "spinning" && (
        <div className="play-card">
          <h1 className="play-h">Spinning…</h1>
          <p className="play-sub">Watch the big screen!</p>
        </div>
      )}

      {step === "result" && result && (
        <div className="play-card win">
          <p className="play-kicker">You won</p>
          {result.prize_image && (
            <img className="win-img" src={result.prize_image} alt={result.prize_name} />
          )}
          <h1 className="play-prize">{result.prize_name}</h1>
          <p className="play-sub">Show this at the counter to collect.</p>
          <button className="play-btn" onClick={reset}>Done</button>
        </div>
      )}

      {step === "error" && (
        <div className="play-card">
          <h1 className="play-h">Sorry</h1>
          <p className="play-sub">{msg}</p>
          <button className="play-btn" onClick={reset}>Try again</button>
        </div>
      )}
    </div>
  );
}
