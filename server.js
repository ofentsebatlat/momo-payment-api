const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const express = require("express");

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5173;

const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, "data");
const MESSAGES_FILE = path.join(DATA_DIR, "messages.json");

app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "Untitled-1.html"));
});

app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

function isEmail(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length < 5 || v.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function clampString(value, maxLen) {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  return v.length > maxLen ? v.slice(0, maxLen) : v;
}

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(MESSAGES_FILE);
  } catch {
    await fs.writeFile(MESSAGES_FILE, JSON.stringify([], null, 2), "utf8");
  }
}

app.post("/api/contact", async (req, res) => {
  const name = clampString(req.body?.name, 80);
  const email = clampString(req.body?.email, 320);
  const message = clampString(req.body?.message, 2000);

  if (!name) return res.status(400).json({ ok: false, error: "Name is required." });
  if (!isEmail(email)) return res.status(400).json({ ok: false, error: "A valid email is required." });
  if (!message) return res.status(400).json({ ok: false, error: "Message is required." });

  await ensureDataFile();

  let existing = [];
  try {
    const raw = await fs.readFile(MESSAGES_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) existing = parsed;
  } catch {
    existing = [];
  }

  const entry = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    name,
    email,
    message
  };

  existing.unshift(entry);
  await fs.writeFile(MESSAGES_FILE, JSON.stringify(existing, null, 2), "utf8");

  res.json({ ok: true });
});

app.get("/api/messages", async (req, res) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token || req.get("x-admin-token") !== token) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  await ensureDataFile();
  const raw = await fs.readFile(MESSAGES_FILE, "utf8");
  const parsed = JSON.parse(raw);
  res.json({ ok: true, messages: Array.isArray(parsed) ? parsed : [] });
});

app.listen(PORT, () => {
  console.log(`Portfolio running at http://localhost:${PORT}`);
  console.log(`Contact endpoint: POST http://localhost:${PORT}/api/contact`);
});

