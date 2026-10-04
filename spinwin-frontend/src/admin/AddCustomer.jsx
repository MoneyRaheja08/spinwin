import { useState } from "react";
import { post } from "./api";
import { branding } from "../branding";

export default function AddCustomer() {
  const [f, setF] = useState({ customer_name: "", bill_number: "", price: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!f.customer_name.trim() || !f.bill_number.trim() || f.price === "") return;
    setBusy(true); setMsg("");
    try {
      const r = await post("/api/staff/bills", {
        customer_name: f.customer_name.trim(),
        bill_number: f.bill_number.trim(),
        price: Number(f.price),
      });
      setMsg(`✓ ${r.customer_name} added with bill ${r.bill_number}. They can now spin at the TV.`);
      setF({ customer_name: "", bill_number: "", price: "" });
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <h1 className="page-h">Add customer</h1>
      <div className="card" style={{ maxWidth: 520 }}>
        <p className="muted" style={{ marginTop: 0 }}>
          Enter the customer's details. The price decides which gifts they can win.
        </p>
        <div className="field" style={{ marginBottom: 14 }}>
          <span>Customer name</span>
          <input className="input" value={f.customer_name}
                 onChange={(e) => setF({ ...f, customer_name: e.target.value })} autoFocus />
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <span>Bill number</span>
          <input className="input" value={f.bill_number}
                 onChange={(e) => setF({ ...f, bill_number: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <span>Price of product ({branding.currency})</span>
          <input className="input" type="number" value={f.price}
                 onChange={(e) => setF({ ...f, price: e.target.value })}
                 onKeyDown={(e) => e.key === "Enter" && create()} />
        </div>
        {msg && <p className={msg.startsWith("✓") ? "adm-ok" : "adm-err"}>{msg}</p>}
        <button className="btn btn-gold" onClick={create}
                disabled={busy || !f.customer_name.trim() || !f.bill_number.trim() || f.price === ""}>
          {busy ? "Adding…" : "Add customer"}
        </button>
      </div>
    </div>
  );
}
