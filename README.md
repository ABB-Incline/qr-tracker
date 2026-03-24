# QR Tracker

A self-hosted QR code scan tracker. Every scan is logged with a timestamp, and you get a live dashboard to monitor activity.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start the server

```bash
npm start
```

The server runs at **http://localhost:3000** by default.  
Change the port via the `PORT` environment variable:
```bash
PORT=8080 npm start
```

---

## Creating a QR Code

Run the setup script:

```bash
node setup.js
```

You'll be prompted for:
- **Name** — a label for this QR code (e.g. "Business Card", "Flyer Campaign")
- **Destination URL** — where to redirect scanners (e.g. `https://yourwebsite.com`)
- **Server base URL** — your server's public address (e.g. `http://localhost:3000` or `https://myserver.com`)

A `.png` QR image is saved to the `qrcodes/` folder. Print or use it anywhere.

You can also pass arguments directly:
```bash
node setup.js "My Campaign" "https://example.com" "http://localhost:3000"
```

---

## Dashboard

Visit **http://localhost:3000/dashboard** to see:
- All QR codes
- Total scan count per code
- Last scanned timestamp
- Tracking URLs

---

## How It Works

```
[Phone scans QR] → [GET /track/:id] → [Log scan to DB] → [Redirect to destination]
```

1. The QR code encodes your tracking URL (`/track/:id`)
2. When scanned, the server logs the timestamp to `scans.db`
3. The user is instantly redirected to the destination URL
4. The dashboard shows all scan activity

---

## Files

| File | Purpose |
|------|---------|
| `server.js` | Express server (tracking + dashboard) |
| `setup.js` | Create new trackable QR codes |
| `scans.db` | SQLite database (auto-created) |
| `qrcodes/` | Generated QR code images |

---

## Deploying to a Real Server

To make QR codes work outside your local machine, deploy to any VPS or cloud provider:

- **Railway** — `railway up`
- **Render** — connect your GitHub repo, set start command to `node server.js`
- **DigitalOcean / any VPS** — clone repo, `npm install`, run with `pm2 start server.js`

Then use your public domain as the server base URL when running `node setup.js`.
