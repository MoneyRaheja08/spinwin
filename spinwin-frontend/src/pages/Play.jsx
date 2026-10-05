import { useEffect, useRef, useState } from "react";
import { registerPublic, kioskSpin, getCategories } from "../api";
import { branding } from "../branding";
import * as sound from "../sound";

const TV_CODE = new URLSearchParams(location.search).get("tv");

export default function Play() {
  const [step, setStep] = useState(TV_CODE ? "enter" : "notv"); // notv|enter|category|registering|ready|spinning|result|error
  const [f, setF] = useState({ name: "", bill: "" });
  const [cats, setCats] = useState([]);
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState(null);
  const sessionRef = useRef(null);

  useEffect(() => {
    if (!TV_CODE) return;
    getCategories(TV_CODE).then(setCats).catch(() => {});
  }, []);

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
    setStep(TV_CODE ? "enter" : "notv");
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
