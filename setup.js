/**
 * setup.js — Create a branded trackable QR code
 *
 * Usage:
 *   node setup.js
 */
const QRCode = require("qrcode");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const readline = require("readline");
const crypto = require("crypto");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

const COLOR_SCHEMES = {
  "1": { label: "Black background + Green dots", dark: "#416528", light: "#000000" },
  "2": { label: "White background + Green dots", dark: "#416528", light: "#ffffff" },
  "3": { label: "Custom hex colors",             dark: null,      light: null       },
};

async function pickColorScheme() {
  console.log("\nColor scheme:");
  Object.entries(COLOR_SCHEMES).forEach(([k, v]) => console.log(`  ${k}) ${v.label}`));
  const choice = (await ask("Choose (1/2/3): ")).trim();
  const scheme = COLOR_SCHEMES[choice] || COLOR_SCHEMES["1"];

  if (choice === "3") {
    scheme.dark  = (await ask("  Dot color hex (e.g. #39b54a): ")).trim();
    scheme.light = (await ask("  Background hex (e.g. #000000): ")).trim();
    scheme.label = "Custom";
  }
  return scheme;
}

async function pickLogo() {
  const useLogo = (await ask("\nEmbed a logo? (y/n): ")).trim().toLowerCase();
  if (useLogo !== "y") return null;

  const logoPath = (await ask("  Path to logo file (PNG recommended, e.g. C:\\logo.png): ")).trim();
  if (!fs.existsSync(logoPath)) {
    console.warn("  ⚠️  Logo file not found — skipping logo.");
    return null;
  }
  return logoPath;
}

async function buildQR(trackingUrl, scheme, logoPath, outputPath) {
  const SIZE = 400;

  if (!logoPath) {
    // Simple color QR — no compositing needed
    await QRCode.toFile(outputPath, trackingUrl, {
      width: SIZE,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: scheme.dark, light: scheme.light },
    });
    return;
  }

  // Generate QR as PNG buffer (high error correction so logo doesn't break it)
  const qrBuffer = await QRCode.toBuffer(trackingUrl, {
    width: SIZE,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: scheme.dark, light: scheme.light },
    type: "png",
  });

  // Resize logo to 22% of QR size, preserve aspect ratio
  const logoSize = Math.floor(SIZE * 0.22);
  const logoBuffer = await sharp(logoPath)
    .resize(logoSize, logoSize, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Get actual logo dimensions after resize
  const logoMeta = await sharp(logoBuffer).metadata();
  const logoW = logoMeta.width;
  const logoH = logoMeta.height;

  // Add a small padded background behind the logo for cleaner look
  const padding = 8;
  const bgColor = scheme.light === "#000000" || scheme.light === "#0e0e0e"
    ? { r: 0, g: 0, b: 0, alpha: 255 }
    : { r: 255, g: 255, b: 255, alpha: 255 };

  const logoBg = await sharp({
    create: {
      width: logoW + padding * 2,
      height: logoH + padding * 2,
      channels: 4,
      background: bgColor,
    }
  })
  .composite([{ input: logoBuffer, top: padding, left: padding }])
  .png()
  .toBuffer();

  const bgMeta = await sharp(logoBg).metadata();

  // Composite centered onto QR
  const left = Math.floor((SIZE - bgMeta.width) / 2);
  const top  = Math.floor((SIZE - bgMeta.height) / 2);

  await sharp(qrBuffer)
    .composite([{ input: logoBg, top, left }])
    .toFile(outputPath);
}

async function main() {
  console.log("\n🔲 QR Tracker — Create New Code\n");

  let name        = process.argv[2];
  let destination = process.argv[3];
  let serverBase  = process.argv[4];

  if (!name)        name        = await ask("QR Code name (e.g. 'Homepage'): ");
  if (!destination) destination = await ask("Destination URL (e.g. https://inclineexteriors.com): ");
  if (!serverBase)  serverBase  = await ask("Server base URL (e.g. https://your-railway-url.up.railway.app): ");

  const scheme   = await pickColorScheme();
  const logoPath = await pickLogo();
  rl.close();

  name        = name.trim();
  destination = destination.trim();
  serverBase  = serverBase.trim().replace(/\/$/, "");

  if (!destination.startsWith("http")) {
    console.error("❌ Destination must start with http:// or https://");
    process.exit(1);
  }

  // Register with live server
  const id = crypto.randomBytes(5).toString("hex");
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
    console.log(`✅ Registered: ${result.message}`);
  } catch (err) {
    console.error(`❌ Could not reach server: ${err.message}`);
    process.exit(1);
  }

  // Generate QR image
  const trackingUrl = `${serverBase}/track/${id}`;
  const outputDir   = path.join(__dirname, "qrcodes");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const safeName   = name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const outputPath = path.join(outputDir, `${safeName}_${id}.png`);

  console.log(`\nGenerating QR code (${scheme.label})...`);
  await buildQR(trackingUrl, scheme, logoPath, outputPath);

  console.log(`
✅ QR Code created!

  Name:         ${name}
  ID:           ${id}
  Destination:  ${destination}
  Tracking URL: ${trackingUrl}
  Colors:       ${scheme.label}
  Logo:         ${logoPath || "None"}
  QR Image:     ${outputPath}

📊 Dashboard: ${serverBase}/dashboard
`);
}

main().catch((err) => { console.error("Error:", err.message); process.exit(1); });
