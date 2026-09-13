import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Tv from "./pages/Tv";
import Kiosk from "./pages/Kiosk";
import Play from "./pages/Play";
import Staff from "./pages/Staff";
import AdminApp from "./admin/AdminApp";
import "./styles.css";

function Home() {
  return (
    <div className="home">
      <h1>Spin &amp; Win</h1>
      <p>Dev launcher</p>
      <div className="home-links">
        <Link to="/kiosk?tv=TV-001">Kiosk (spin at TV)</Link>
        <Link to="/tv?tv=TV-001">TV (phone-controlled)</Link>
        <Link to="/staff">Staff</Link>
        <Link to="/admin">Admin</Link>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/kiosk" element={<Kiosk />} />
        <Route path="/tv" element={<Tv />} />
        <Route path="/play" element={<Play />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="/admin/*" element={<AdminApp />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
