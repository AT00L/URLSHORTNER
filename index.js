import "dotenv/config";

import fs from "fs";
import path from "path";
import express from "express";
import { connectToMongoDB } from "./config/db.js";
import jwt from "jsonwebtoken"

const app = express();
const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPage(res, page, status, { error = null, message = null } = {}) {
  const html = fs
    .readFileSync(path.join(import.meta.dirname, "public", page), "utf8")
    .replace("<!--ERROR-->", error ? `<p>${escapeHtml(error)}</p>` : "")
    .replace("<!--MESSAGE-->", message ? `<p>${escapeHtml(message)}</p>` : "");

  res.status(status).send(html);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.redirect("/signup");
});

app.get("/signup", (req, res) => {
  renderPage(res, "signup.html", 200);
});

app.post("/signup", (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return renderPage(res, "signup.html", 400, {
      error: "Name, email and password are required",
    });
  }

  renderPage(res, "signup.html", 200, {
    message: `Account created for ${email}. You can now log in.`,
  });
});

app.get("/login", (req, res) => {
  renderPage(res, "login.html", 200);
});

app.post("/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return renderPage(res, "login.html", 400, {
      error: "Email and password are required",
    });
  }

  res.redirect("/shorten");
});

app.get("/shorten", (req, res) => {
  renderPage(res, "shorten.html", 200);
});

app.post("/shorten", (req, res) => {
  const { url } = req.body || {};

  if (!url) {
    return renderPage(res, "shorten.html", 400, { error: "URL is required" });
  }

  renderPage(res, "shorten.html", 200, { message: `URL received: ${url}` });
});

connectToMongoDB(MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server started at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
