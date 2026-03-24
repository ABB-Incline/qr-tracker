const express = require("express");
const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "scans.db");

let db;

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS qr_codes (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      destination TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT, qr_id TEXT NOT NULL,
      scanned_at TEXT NOT NULL, FOREIGN KEY (qr_id) REFERENCES qr_codes(id)
    );
  `);
  saveDb();
}

function saveDb() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDb();
}

// ─── TRACK ───────────────────────────────────────────────────────────────────
app.get("/track/:id", (req, res) => {
  const { id } = req.params;
  const rows = query("SELECT * FROM qr_codes WHERE id = ?", [id]);
  if (rows.length === 0) return res.status(404).send("QR code not found.");
  run("INSERT INTO scans (qr_id, scanned_at) VALUES (?, ?)", [id, new Date().toISOString()]);
  res.redirect(rows[0].destination);
});

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
app.get("/dashboard", (req, res) => {
  const codes = query(`
    SELECT q.id, q.name, q.destination, q.created_at,
           COUNT(s.id) AS scan_count, MAX(s.scanned_at) AS last_scanned
    FROM qr_codes q LEFT JOIN scans s ON s.qr_id = q.id
    GROUP BY q.id ORDER BY q.created_at DESC
  `);
  const totalScans = codes.reduce((a, c) => a + (c.scan_count || 0), 0);
  const rows = codes.map(c => {
    const lastScanned = c.last_scanned ? new Date(c.last_scanned).toLocaleString() : "Never";
    const trackUrl = `http://localhost:${PORT}/track/${c.id}`;
    return `<tr>
      <td>${c.name}</td>
      <td><a href="${c.destination}" target="_blank">${c.destination}</a></td>
      <td class="count">${c.scan_count || 0}</td>
      <td>${lastScanned}</td>
      <td>${new Date(c.created_at).toLocaleDateString()}</td>
      <td><code>${trackUrl}</code></td>
    </tr>`;
  }).join("");

  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>QR Tracker Dashboard</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@300;400;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#0e0e0e;--surface:#181818;--border:#2a2a2a;--accent:#c8f135;--text:#e8e8e8;--muted:#666;--mono:'IBM Plex Mono',monospace;--sans:'IBM Plex Sans',sans-serif}
  body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh;padding:48px 32px}
  nav{display:flex;gap:24px;margin-bottom:48px;border-bottom:1px solid var(--border);padding-bottom:20px}
  nav a{font-family:var(--mono);font-size:13px;color:var(--muted);text-decoration:none;padding-bottom:20px;margin-bottom:-21px;border-bottom:2px solid transparent}
  nav a.active{color:var(--accent);border-bottom-color:var(--accent)}
  nav a:hover{color:var(--text)}
  h1{font-family:var(--mono);font-size:28px;font-weight:600;color:var(--accent);margin-bottom:32px}
  .stats{display:flex;gap:24px;margin-bottom:40px}
  .stat-card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px 28px;min-width:160px}
  .stat-card .label{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-family:var(--mono);margin-bottom:8px}
  .stat-card .value{font-family:var(--mono);font-size:32px;font-weight:600;color:var(--accent)}
  table{width:100%;border-collapse:collapse;font-size:14px}
  thead th{text-align:left;font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);padding:12px 16px;border-bottom:1px solid var(--border)}
  tbody tr{border-bottom:1px solid var(--border);transition:background 0.15s}
  tbody tr:hover{background:var(--surface)}
  tbody td{padding:16px;vertical-align:middle}
  tbody td a{color:var(--text);text-decoration:none;opacity:0.6;font-size:13px}
  tbody td a:hover{opacity:1;text-decoration:underline}
  .count{font-family:var(--mono);font-size:20px;font-weight:600;color:var(--accent)}
  code{font-family:var(--mono);font-size:12px;background:#111;border:1px solid var(--border);border-radius:4px;padding:3px 7px;color:var(--muted)}
  .empty{text-align:center;padding:80px 0;color:var(--muted);font-family:var(--mono);font-size:14px}
  .empty strong{display:block;font-size:18px;margin-bottom:12px;color:var(--text)}
</style></head><body>
  <h1>⬛ QR Tracker</h1>
  <nav>
    <a href="/dashboard" class="active">Dashboard</a>
    <a href="/reports">Reports</a>
  </nav>
  <div class="stats">
    <div class="stat-card"><div class="label">Total QR Codes</div><div class="value">${codes.length}</div></div>
    <div class="stat-card"><div class="label">Total Scans</div><div class="value">${totalScans}</div></div>
  </div>
  ${codes.length === 0
    ? `<div class="empty"><strong>No QR codes yet</strong>Run <code>node setup.js</code> to create your first one.</div>`
    : `<table>
        <thead><tr><th>Name</th><th>Destination</th><th>Scans</th><th>Last Scanned</th><th>Created</th><th>Tracking URL</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`}
</body></html>`);
});

// ─── REPORTS ─────────────────────────────────────────────────────────────────
app.get("/reports", (req, res) => {
  // Get all QR codes for the breakdown selector
  const codes = query("SELECT id, name FROM qr_codes ORDER BY created_at DESC");
  const codesJson = JSON.stringify(codes);
  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>QR Tracker — Reports</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@300;400;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#0e0e0e;--surface:#181818;--border:#2a2a2a;--accent:#c8f135;--text:#e8e8e8;--muted:#666;--mono:'IBM Plex Mono',monospace;--sans:'IBM Plex Sans',sans-serif}
  body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh;padding:48px 32px}
  nav{display:flex;gap:24px;margin-bottom:48px;border-bottom:1px solid var(--border);padding-bottom:20px}
  nav a{font-family:var(--mono);font-size:13px;color:var(--muted);text-decoration:none;padding-bottom:20px;margin-bottom:-21px;border-bottom:2px solid transparent}
  nav a.active{color:var(--accent);border-bottom-color:var(--accent)}
  nav a:hover{color:var(--text)}
  h1{font-family:var(--mono);font-size:28px;font-weight:600;color:var(--accent);margin-bottom:32px}
  h2{font-family:var(--mono);font-size:15px;font-weight:600;color:var(--text);margin-bottom:16px;letter-spacing:0.5px}
  .controls{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:36px;padding:20px;background:var(--surface);border:1px solid var(--border);border-radius:10px}
  .controls label{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-right:6px}
  .controls select,.controls input{background:#111;border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:13px;padding:7px 12px;border-radius:6px;outline:none}
  .controls select:focus,.controls input:focus{border-color:var(--accent)}
  .btn{background:var(--accent);color:#0e0e0e;font-family:var(--mono);font-size:12px;font-weight:600;padding:8px 18px;border:none;border-radius:6px;cursor:pointer;text-transform:uppercase;letter-spacing:1px}
  .btn:hover{opacity:0.85}
  .btn.secondary{background:transparent;color:var(--accent);border:1px solid var(--accent)}
  .btn.secondary:hover{background:var(--accent);color:#0e0e0e}
  .seg{display:flex;gap:0;border:1px solid var(--border);border-radius:6px;overflow:hidden}
  .seg button{background:transparent;color:var(--muted);font-family:var(--mono);font-size:12px;padding:7px 14px;border:none;cursor:pointer;border-right:1px solid var(--border)}
  .seg button:last-child{border-right:none}
  .seg button.active{background:var(--accent);color:#0e0e0e;font-weight:600}
  .seg button:hover:not(.active){color:var(--text);background:#222}
  .grid{display:grid;grid-template-columns:1fr;gap:32px;margin-bottom:40px}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:28px}
  .chart-wrap{position:relative;height:280px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  thead th{text-align:left;font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);padding:12px 16px;border-bottom:1px solid var(--border)}
  tbody tr{border-bottom:1px solid var(--border);transition:background 0.15s}
  tbody tr:hover{background:#1f1f1f}
  tbody td{padding:14px 16px;vertical-align:middle;font-size:13px}
  .pill{display:inline-block;background:#1a2600;color:var(--accent);font-family:var(--mono);font-size:12px;padding:3px 10px;border-radius:99px;border:1px solid #2e4400}
  .empty-state{text-align:center;padding:60px 0;color:var(--muted);font-family:var(--mono);font-size:13px}
  .divider{height:1px;background:var(--border);margin:40px 0}
  #summary-stats{display:flex;gap:20px;margin-bottom:32px;flex-wrap:wrap}
  .mini-stat{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:16px 22px;flex:1;min-width:120px}
  .mini-stat .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-family:var(--mono);margin-bottom:6px}
  .mini-stat .val{font-family:var(--mono);font-size:24px;font-weight:600;color:var(--accent)}
</style></head><body>
<h1>⬛ QR Tracker</h1>
<nav>
  <a href="/dashboard">Dashboard</a>
  <a href="/reports" class="active">Reports</a>
</nav>

<div class="controls">
  <div>
    <label>Preset</label>
    <select id="preset">
      <option value="7">Last 7 days</option>
      <option value="30" selected>Last 30 days</option>
      <option value="90">Last 90 days</option>
      <option value="custom">Custom range</option>
    </select>
  </div>
  <div id="custom-range" style="display:none;gap:8px;align-items:center;display:none">
    <label>From</label><input type="date" id="from-date">
    <label>To</label><input type="date" id="to-date">
  </div>
  <div>
    <label>Group by</label>
    <div class="seg">
      <button onclick="setGrouping('day')" class="active" id="btn-day">Day</button>
      <button onclick="setGrouping('week')" id="btn-week">Week</button>
      <button onclick="setGrouping('month')" id="btn-month">Month</button>
    </div>
  </div>
  <button class="btn" onclick="loadReports()">Apply</button>
  <button class="btn secondary" onclick="exportCsv()">⬇ Export CSV</button>
</div>

<div id="summary-stats">
  <div class="mini-stat"><div class="lbl">Total Scans</div><div class="val" id="stat-total">—</div></div>
  <div class="mini-stat"><div class="lbl">Avg / Day</div><div class="val" id="stat-avg">—</div></div>
  <div class="mini-stat"><div class="lbl">Peak Day</div><div class="val" id="stat-peak">—</div></div>
  <div class="mini-stat"><div class="lbl">Active Codes</div><div class="val" id="stat-codes">—</div></div>
</div>

<div class="grid">
  <div class="card">
    <h2>Scans Over Time</h2>
    <div class="chart-wrap"><canvas id="timeChart"></canvas></div>
  </div>
</div>

<div class="card">
  <h2>Per-Code Breakdown</h2>
  <div id="breakdown-table"><div class="empty-state">Loading...</div></div>
</div>

<script>
const ALL_CODES = ${codesJson};
let grouping = 'day';
let timeChart = null;

function setGrouping(g) {
  grouping = g;
  ['day','week','month'].forEach(x => {
    document.getElementById('btn-'+x).classList.toggle('active', x === g);
  });
}

document.getElementById('preset').addEventListener('change', function() {
  const cr = document.getElementById('custom-range');
  cr.style.display = this.value === 'custom' ? 'flex' : 'none';
});

function getDateRange() {
  const preset = document.getElementById('preset').value;
  const to = new Date(); to.setHours(23,59,59,999);
  let from = new Date();
  if (preset === 'custom') {
    const f = document.getElementById('from-date').value;
    const t = document.getElementById('to-date').value;
    return { from: f ? new Date(f).toISOString() : null, to: t ? new Date(t+'T23:59:59').toISOString() : null };
  }
  from.setDate(from.getDate() - parseInt(preset));
  from.setHours(0,0,0,0);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function loadReports() {
  const { from, to } = getDateRange();
  const params = new URLSearchParams({ from, to, grouping });
  const res = await fetch('/api/reports?' + params);
  const data = await res.json();
  renderSummary(data);
  renderTimeChart(data.timeSeries);
  renderBreakdown(data.breakdown);
}

function renderSummary(data) {
  const total = data.timeSeries.reduce((a,r) => a + r.count, 0);
  const days = data.timeSeries.length || 1;
  const peak = data.timeSeries.reduce((a,r) => r.count > a ? r.count : a, 0);
  const activeCodes = data.breakdown.filter(r => r.total > 0).length;
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-avg').textContent = (total / days).toFixed(1);
  document.getElementById('stat-peak').textContent = peak;
  document.getElementById('stat-codes').textContent = activeCodes;
}

function renderTimeChart(series) {
  const labels = series.map(r => r.period);
  const counts = series.map(r => r.count);
  if (timeChart) timeChart.destroy();
  const ctx = document.getElementById('timeChart').getContext('2d');
  timeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Scans',
        data: counts,
        backgroundColor: 'rgba(200,241,53,0.25)',
        borderColor: '#c8f135',
        borderWidth: 2,
        borderRadius: 4,
        hoverBackgroundColor: 'rgba(200,241,53,0.45)',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#1e1e1e' }, ticks: { color: '#666', font: { family: 'IBM Plex Mono', size: 11 } } },
        y: { grid: { color: '#1e1e1e' }, ticks: { color: '#666', font: { family: 'IBM Plex Mono', size: 11 }, stepSize: 1 }, beginAtZero: true }
      }
    }
  });
}

function renderBreakdown(breakdown) {
  const el = document.getElementById('breakdown-table');
  if (!breakdown.length) {
    el.innerHTML = '<div class="empty-state">No scans in this period.</div>'; return;
  }
  const rows = breakdown.map(r => \`
    <tr>
      <td><strong>\${r.name}</strong></td>
      <td><span class="pill">\${r.total}</span></td>
      <td style="color:var(--muted)">\${r.last_scanned ? new Date(r.last_scanned).toLocaleString() : 'Never'}</td>
      <td style="color:var(--muted);font-size:12px">\${r.trend.map(t => \`<span title="\${t.period}">\${t.count > 0 ? '▮' : '▯'}</span>\`).join(' ')}</td>
    </tr>\`).join('');
  el.innerHTML = \`<table>
    <thead><tr><th>QR Code</th><th>Scans in Period</th><th>Last Scanned</th><th>Trend</th></tr></thead>
    <tbody>\${rows}</tbody>
  </table>\`;
}

async function exportCsv() {
  const { from, to } = getDateRange();
  const params = new URLSearchParams({ from, to });
  window.location = '/api/export?' + params;
}

// Init
loadReports();
</script>
</body></html>`);
});

// ─── API: REPORTS DATA ────────────────────────────────────────────────────────
app.get("/api/reports", (req, res) => {
  const { from, to, grouping = "day" } = req.query;
  if (!from || !to) return res.status(400).json({ error: "from and to required" });

  // Format string for SQLite strftime
  const fmtMap = { day: "%Y-%m-%d", week: "%Y-W%W", month: "%Y-%m" };
  const fmt = fmtMap[grouping] || "%Y-%m-%d";

  // Time series
  const timeSeries = query(
    `SELECT strftime(?, scanned_at) AS period, COUNT(*) AS count
     FROM scans WHERE scanned_at >= ? AND scanned_at <= ?
     GROUP BY period ORDER BY period ASC`,
    [fmt, from, to]
  );

  // Per-code breakdown
  const codes = query("SELECT id, name FROM qr_codes ORDER BY created_at DESC");
  const breakdown = codes.map(code => {
    const rows = query(
      `SELECT strftime(?, scanned_at) AS period, COUNT(*) AS count
       FROM scans WHERE qr_id = ? AND scanned_at >= ? AND scanned_at <= ?
       GROUP BY period ORDER BY period ASC`,
      [fmt, code.id, from, to]
    );
    const total = rows.reduce((a, r) => a + r.count, 0);
    const lastRow = query(
      "SELECT MAX(scanned_at) AS last_scanned FROM scans WHERE qr_id = ? AND scanned_at >= ? AND scanned_at <= ?",
      [code.id, from, to]
    );
    return {
      id: code.id,
      name: code.name,
      total,
      last_scanned: lastRow[0]?.last_scanned || null,
      trend: rows.slice(-12), // last 12 periods for sparkline
    };
  }).filter(c => c.total >= 0).sort((a, b) => b.total - a.total);

  res.json({ timeSeries, breakdown });
});

// ─── API: CSV EXPORT ──────────────────────────────────────────────────────────
app.get("/api/export", (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).send("from and to required");

  const rows = query(
    `SELECT q.name AS qr_name, q.destination, s.scanned_at
     FROM scans s JOIN qr_codes q ON q.id = s.qr_id
     WHERE s.scanned_at >= ? AND s.scanned_at <= ?
     ORDER BY s.scanned_at DESC`,
    [from, to]
  );

  const csv = [
    "QR Code Name,Destination,Scanned At",
    ...rows.map(r => `"${r.qr_name}","${r.destination}","${r.scanned_at}"`)
  ].join("\n");

  const filename = `qr-scans-${from.slice(0,10)}-to-${to.slice(0,10)}.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// ─── START ────────────────────────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n✅ QR Tracker running at http://localhost:${PORT}`);
    console.log(`📊 Dashboard:   http://localhost:${PORT}/dashboard`);
    console.log(`📈 Reports:     http://localhost:${PORT}/reports`);
    console.log(`\nTo create a new QR code, run: node setup.js\n`);
  });
});
