// Dependency-free demo app used as DemoForge's end-to-end test fixture.
const http = require("node:http");

const css = `
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b1020;color:#e6e9f5}
nav{display:flex;gap:20px;align-items:center;padding:18px 24px;border-bottom:1px solid #1e2640}
nav b{font-size:20px;margin-right:auto;background:linear-gradient(90deg,#a78bfa,#22d3ee);-webkit-background-clip:text;color:transparent}
nav a{color:#9aa3c7;text-decoration:none}main{max-width:960px;margin:0 auto;padding:40px 24px}
h1{font-size:44px;line-height:1.1;margin:0 0 16px}p.lead{color:#9aa3c7;font-size:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:28px}
.card{background:#121a33;border:1px solid #1e2640;border-radius:16px;padding:20px}
.pill{display:inline-block;padding:4px 10px;border-radius:999px;background:#1f2a4d;color:#a5b4fc;font-size:12px}
.btn{display:inline-block;margin-top:20px;padding:12px 20px;border-radius:12px;background:#7c3aed;color:#fff;text-decoration:none}
.bar{height:10px;border-radius:6px;background:#1e2640;overflow:hidden}.bar i{display:block;height:100%;background:linear-gradient(90deg,#7c3aed,#22d3ee)}
.big{font-size:64px;font-variant-numeric:tabular-nums;font-weight:700;letter-spacing:2px}`;

const layout = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Launchpad</title><style>${css}</style></head>
<body><nav><b>Launchpad</b><a href="/">Home</a><a href="/board">Mission board</a><a href="/countdown">Countdown</a></nav><main>${body}</main></body></html>`;

const tasks = [
  ["Design the landing page", "Maya", 100], ["Wire up the API", "Leo", 70], ["Record the demo", "Ana", 35],
  ["Write the pitch", "Sam", 55], ["Deploy to prod", "Leo", 10], ["Polish onboarding", "Maya", 80],
];

const pages = {
  "/": layout("Home", `<span class="pill">Built for 48-hour sprints</span><h1>Ship your hackathon project, not your stress.</h1>
    <p class="lead">Plan the work, watch the clock, and keep the whole team in sync, all in one tab.</p><a class="btn" href="/board">Open the mission board →</a>
    <div class="grid"><div class="card"><h3>Mission board</h3><p>Split the idea into bite-sized tasks.</p></div>
    <div class="card"><h3>Live countdown</h3><p>Always know how long until submission.</p></div>
    <div class="card"><h3>Team pulse</h3><p>See who's on what at a glance.</p></div></div>`),
  "/board": layout("Mission board", `<h1>Mission board</h1><p class="lead">6 tasks · 58% complete</p><div class="grid">${tasks
    .map(([t, who, pct]) => `<div class="card"><span class="pill">${who}</span><h3>${t}</h3><div class="bar"><i style="width:${pct}%"></i></div></div>`)
    .join("")}</div>`),
  "/countdown": layout("Countdown", `<h1>Submission countdown</h1><p class="lead">Devpost closes Sunday 12:00</p>
    <div class="card" style="text-align:center;margin-top:28px"><div class="big">17:42:09</div><p>hours · minutes · seconds</p></div>
    <div class="grid"><div class="card"><h3>Next milestone</h3><p>Feature freeze in 6h</p></div><div class="card"><h3>Team pulse</h3><p>4 builders online</p></div></div>`),
};

const port = Number(process.env.PORT) || 3000;
http
  .createServer((req, res) => {
    const page = pages[new URL(req.url, "http://x").pathname.replace(/\/$/, "") || "/"];
    res.writeHead(page ? 200 : 404, { "Content-Type": "text/html" }).end(page ?? layout("Not found", "<h1>404</h1>"));
  })
  .listen(port, "127.0.0.1", () => console.log(`Launchpad ready on http://localhost:${port}`));
