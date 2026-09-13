import { useEffect, useRef, useState } from "react";
import { makeSocket } from "../socket";
import { checkEligibility, createSession } from "../api";
import { branding } from "../branding";
import * as sound from "../sound";

const TV_CODE = new URLSearchParams(location.search).get("tv");

export default function Play() {
  const [step, setStep] = useState(TV_CODE ? "enter" : "notv"); // notv|enter|checking|ready|spinning|result|error
  const [bill, setBill] = useState("");
  const [msg, setMsg] = useState("");
  const [result, setResult] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => () => socketRef.current && socketRef.current.close(), []);

  async function onCheck() {
    if (!bill.trim()) return;
    sound.unlock();
    setStep("checking"); setMsg("");
    try {
      const elig = await checkEligibility(TV_CODE, bill.trim());
      if (!elig.eligible) {
        setMsg(elig.spin_status === "PLAYED" ? "This bill has already been used to spin." : "This bill isn't eligible.");
        setStep("error");
        return;
      }
      const session = await createSession(elig.bill_id, TV_CODE);
      const s = makeSocket();
      socketRef.current = s;
      s.on("connect", () => s.emit("customer_join", { pairing_code: session.pairing_code }, (ack) => {
        if (ack && ack.ok) setStep("ready");
        else { setMsg((ack && ack.error) || "Couldn't connect."); setStep("error"); }
      }));
      s.on("PRIZE_WON", (d) => { setResult(d.result); setStep("result"); sound.win(); });
      s.on("SPIN_ERROR", (d) => { setMsg(d.error); setStep("error"); });
    } catch (e) {
      setMsg(e.message || "Something went wrong.");
      setStep("error");
    }
  }

  function onSpin() {
    sound.unlock();
    setStep("spinning");
    socketRef.current.emit("SPIN_REQUESTED", {});
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
          <p className="play-sub">Enter your bill number to play</p>
          <input
            className="play-input" inputMode="numeric" placeholder="Bill number"
            value={bill} onChange={(e) => setBill(e.target.value)}
          />
          <button className="play-btn" onClick={onCheck}>Check my spin</button>
        </div>
      )}

      {step === "checking" && (
        <div className="play-card"><h1 className="play-h">Checking…</h1></div>
      )}

      {step === "ready" && (
        <div className="play-card">
          <p className="play-kicker">You're in</p>
          <h1 className="play-h">1 spin ready</h1>
          <p className="play-sub">Watch the big screen and tap below.</p>
          <button className="play-btn big" onClick={onSpin}>SPIN NOW</button>
        </div>
      )}

      {step === "spinning" && (
        <div className="play-card">
          <h1 className="play-h">Spinning…</h1>
          <p className="play-sub">Look up at the screen!</p>
        </div>
      )}

      {step === "result" && result && (
        <div className="play-card win">
          <p className="play-kicker">You won</p>
          <h1 className="play-prize">{result.prize_name}</h1>
          {result.prize_value > 0 && (
            <p className="play-value">{branding.currency}{result.prize_value.toLocaleString("en-IN")}</p>
          )}
          <p className="play-sub">Show this at the counter to collect.</p>
        </div>
      )}

      {step === "error" && (
        <div className="play-card">
          <h1 className="play-h">Hmm</h1>
          <p className="play-sub">{msg}</p>
          <button className="play-btn" onClick={() => { setStep(TV_CODE ? "enter" : "notv"); setBill(""); }}>Try again</button>
        </div>
      )}
    </div>
  );
}
