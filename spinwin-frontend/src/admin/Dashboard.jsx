import { get, useAsync } from "./api";
import { Bars, Line, StackBars } from "./Charts";
import { branding } from "../branding";

const money = (n) => branding.currency + (n || 0).toLocaleString("en-IN");

export default function Dashboard() {
  const { data, loading, error } = useAsync(() => get("/api/analytics/dashboard"));

  if (loading) return <p className="muted">Loading dashboard\u2026</p>;
  if (error) return <p className="adm-err">{error}</p>;

  const k = data.kpis;
  const kpis = [
    ["Total spins", k.total_spins],
    ["Prize value given", money(k.total_prize_value)],
    ["Prizes remaining", k.prizes_remaining],
    ["Spins today", k.spins_today],
    ["Spins this month", k.spins_this_month],
    ["Most won", k.most_won_prize || "\u2014"],
    ["Highest prize", money(k.highest_value_given)],
    ["Sales \u2192 spins", `${k.conversion_pct}%`],
  ];

  return (
    <div>
      <h1 className="page-h">Dashboard</h1>
      <div className="kpi-grid">
        {kpis.map(([label, val]) => (
          <div className="kpi" key={label}>
            <div className="kpi-num">{val}</div>
            <div className="kpi-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="chart-grid">
        <div className="card">
          <h3>Spins by day (30d)</h3>
          <Line data={(data.spins_by_day || []).map((d) => ({ label: d.date, value: d.count }))} />
        </div>
        <div className="card">
          <h3>Prize distribution</h3>
          <Bars data={(data.prize_distribution || []).map((d) => ({ label: d.prize, value: d.count }))} />
        </div>
        <div className="card">
          <h3>Spins by price slab</h3>
          <Bars data={(data.spins_by_slab || []).map((d) => ({ label: d.slab, value: d.count }))}
                color={branding.wheelColors[4]} />
        </div>
        <div className="card">
          <h3>Inventory (remaining vs total)</h3>
          <StackBars data={(data.inventory_levels || []).map((d) => ({
            label: d.prize, remaining: d.remaining, initial: d.initial }))} />
        </div>
      </div>
    </div>
  );
}
