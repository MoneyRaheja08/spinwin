# Spin & Win — Frontend (Phase 3: TV + Play)

React + Vite. Two screens so far: the **TV wheel** (`/tv`) and the **phone
controller** (`/play`). Admin and staff screens come next phase.

## Run

```bash
npm install
cp .env.example .env      # set VITE_API_URL / VITE_SOCKET_URL to your backend
npm run dev               # http://localhost:5173
```

On a laptop LAN, set both env values to the laptop's IP (e.g.
`http://192.168.1.50:8000`) so the TV browser and customer phones can reach it.

## The end-to-end flow

1. Open the TV: `http://<host>:5173/tv?tv=TV-001` (fullscreen the browser).
   It connects, registers as `TV-001`, and shows a **Scan to play** QR.
2. Customer scans the QR with their phone camera → opens `/play?tv=TV-001`.
3. Customer types their **bill number** → the app checks eligibility and creates
   a session. The TV flips to **Customer ready** and shows the real wheel.
4. Customer taps **SPIN NOW**. The server picks the prize, the TV counts down
   and the wheel spins to the exact winning slice, then confetti + result.
   The phone shows the same prize.

Try it with the seeded bill `INV-1002` (Vivo V30, ₹20k–30k slab).

## Branding

Everything visual reads from `src/branding.js` — company name, game title,
currency, wheel colors, and `logoUrl`. Drop your logo into `public/` (e.g.
`public/logo.png`) and set `logoUrl: "/logo.png"`. No other file needs editing.

## Sound

Browsers block autoplay, so audio unlocks on the first tap (the TV mute button,
the phone's Spin). Countdown/tick/win sounds are synthesized — no audio files.

## Deploy

`npm run build` outputs static files in `dist/` — host on Render Static, Netlify,
Vercel, or serve them from the backend. Set the two `VITE_*` env vars at build time.

## Screens

| Route            | Who        | What |
|------------------|------------|------|
| `/kiosk?tv=TV-001` | customer at TV | **Spin at the TV.** On-screen number pad + wheel + SPIN, no phone needed. |
| `/tv?tv=TV-001`  | showroom   | The wheel. Fullscreen this on the TV. |
| `/play?tv=TV-001`| customer   | Phone controller (opened by scanning the TV QR). |
| `/staff`         | staff      | Sign in, search a bill, start a game on a TV, spin, see the prize. Admins also get the controlled-winner control here. |
| `/admin`         | admin      | Dashboard, prizes, slabs & weights, inventory, history + CSV, TV devices, settings. |

`/staff` and `/admin` use the login you set with the backend `create_user` script.
