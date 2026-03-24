/**
 * setup.js — Create a new trackable QR code
 * Registers the QR code with your live server over HTTP.
 *
 * Usage:
 *   node setup.js
 *
 * Or pass args directly:
 *   node setup.js "My Campaign" "https://example.com" "https://your-railway-url.up.railway.app"
 */
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const readline = require("readline");
const crypto = require("crypto");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

async function main() {
  console.log("\n🔲 QR Tracker — Create New Code\n");

  let name = process.argv[2];
  let destination = process.argv[3];
  let serverBase = process.argv[4];

  if (!name) name = await ask("QR Code name (e.g. 'Summer Campaign'): ");
  if (!destination) destination = await ask("Destination URL (e.g. https://yourwebsite.com): ");
  if (!serverBase) serverBase = await ask("Your server base URL (e.g. https://your-railway-url.up.railway.app): ");
  rl.close();

  name = name.trim();
  destination = destination.trim();
  serverBase = serverBase.trim().replace(/\/$/, "");

  if (!destination.startsWith("http")) {
    console.error("❌ Destination must start with http:// or https://");
    process.exit(1);
  }

  const id = crypto.randomBytes(5).toString("hex");

  // Register with the live server via HTTP
  console.log(`\nRegistering with server at ${serverBase}...`);
  try {
    const response = await fetch(`${serverBase}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name, destination }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ Server error: ${response.status} — ${text}`);
      process.exit(1);
    }

    const result = await response.json();
    console.log(`✅ Registered on server: ${result.message}`);
  } catch (err) {
    console.error(`❌ Could not reach server: ${err.message}`);
    console.error(`   Make sure your server is running at ${serverBase}`);
    process.exit(1);
  }

  // Generate QR code image
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
