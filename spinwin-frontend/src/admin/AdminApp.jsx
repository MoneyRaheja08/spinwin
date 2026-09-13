import { useState } from "react";
import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import { isAuthed, logout, role } from "./api";
import { branding } from "../branding";
import Login from "./Login";
import Dashboard from "./Dashboard";
import QuickSetup from "./QuickSetup";
import Prizes from "./Prizes";
import Slabs from "./Slabs";
import Inventory from "./Inventory";
import History from "./History";
import Devices from "./Devices";
import Settings from "./Settings";
import "./admin.css";

const NAV = [
  ["", "Dashboard"],
  ["setup", "Gifts by price"],
  ["prizes", "Prizes"],
  ["slabs", "Slabs & weights"],
  ["inventory", "Inventory"],
  ["history", "History"],
  ["devices", "TV devices"],
  ["settings", "Settings"],
];

export default function AdminApp() {
  const [authed, setAuthed] = useState(isAuthed());
  const nav = useNavigate();

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  function signOut() { logout(); setAuthed(false); nav("/admin"); }

  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-logo">{branding.companyName}</div>
        <nav className="adm-nav">
          {NAV.map(([to, label]) => (
            <NavLink key={to} end={to === ""} to={`/admin/${to}`}
                     className={({ isActive }) => (isActive ? "active" : "")}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="adm-side-foot">
          <span className="muted">{role()}</span>
          <button className="btn btn-ghost sm" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="adm-main">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="setup" element={<QuickSetup />} />
          <Route path="prizes" element={<Prizes />} />
          <Route path="slabs" element={<Slabs />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="history" element={<History />} />
          <Route path="devices" element={<Devices />} />
          <Route path="settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
