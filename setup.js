/**
 * setup.js — Create a new trackable QR code
 *
 * Usage:
 *   node setup.js
 *
 * Or pass args directly:
 *   node setup.js "My Campaign" "https://example.com" "http://yourserver.com"
 */
const initSqlJs = require("sql.js");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const readline = require("readline");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "scans.db");

async function main() {
  const SQL = await initSqlJs();
  let db;
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

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((res) => rl.question(q, res));

  console.log("\n🔲 QR Tracker — Create New Code\n");

  let name = process.argv[2];
  let destination = process.argv[3];
  let serverBase = process.argv[4];

  if (!name) name = await ask("QR Code name (e.g. 'Summer Campaign'): ");
  if (!destination) destination = await ask("Destination URL (e.g. https://yourwebsite.com): ");
  if (!serverBase) serverBase = await ask("Your server base URL (e.g. http://localhost:3000): ");
  rl.close();

  name = name.trim();
  destination = destination.trim();
  serverBase = serverBase.trim().replace(/\/$/, "");

  if (!destination.startsWith("http")) {
    console.error("❌ Destination must start with http:// or https://");
    process.exit(1);
  }

  const id = crypto.randomBytes(5).toString("hex");
  db.run("INSERT INTO qr_codes (id, name, destination, created_at) VALUES (?, ?, ?, ?)",
    [id, name, destination, new Date().toISOString()]);
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

  const trackingUrl = `${serverBase}/track/${id}`;
  const outputDir = path.join(__dirname, "qrcodes");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const safeName = name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const outputPath = path.join(outputDir, `${safeName}_${id}.png`);

  await QRCode.toFile(outputPath, trackingUrl, {
    width: 400, margin: 2,
    color: { dark: "#0e0e0e", light: "#FFFFFF" },
  });

  console.log(`
✅ QR Code created!

  Name:         ${name}
  ID:           ${id}
  Destination:  ${destination}
  Tracking URL: ${trackingUrl}
  QR Image:     ${outputPath}

📊 Dashboard: ${serverBase}/dashboard
`);
}

main().catch((err) => { console.error("Error:", err.message); process.exit(1); });
