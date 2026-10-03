import "dotenv/config";

import fs from "fs";
import path from "path";
import express from "express";
import { User } from "./models/user.js";
import { Url } from "./models/url.js";
import jwt from "jsonwebtoken"
import cookieParser from "cookie-parser";
import { authorize, homePageCheck } from "./middlewares/auth.js";
import shortid from "shortid";
import mongoose from "mongoose";
import QRCode from "qrcode";

const app = express();
// EB nginx and Cloudflare terminate TLS upstream; without this req.protocol is always "http"
app.set("trust proxy", true);
const jwtPrivatekey = process.env.JWT_PRIVATE_KEY

// Vercel serves over HTTPS and sets NODE_ENV=production for us
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
};

app.use(cookieParser());

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderUrlTable(urls, origin) {
  if (!urls || urls.length === 0) {
    return `<p class="empty">No links yet — shorten your first URL above.</p>`;
  }

  const rows = urls
    .map((u) => {
      const short = `${origin}/${u.shortId}`;
      const created = new Date(u.createdAt).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      return `        <tr>
          <td>
            <a href="${escapeHtml(short)}" target="_blank" rel="noopener">${escapeHtml(short)}</a>
            <button type="button" class="link-btn" data-copy="${escapeHtml(short)}">Copy</button>
            <a class="link-btn" href="/urls/${u._id}/qr">QR</a>
          </td>
          <td class="orig" title="${escapeHtml(u.url)}">${escapeHtml(u.url)}</td>
          <td class="num">${u.clicked}</td>
          <td class="muted">${escapeHtml(created)}</td>
          <td class="actions">
            <form method="POST" action="/urls/${u._id}/delete"
                  onsubmit="return confirm('Delete this short link? Anyone using it will get a 404.')">
              <button class="danger" type="submit">Delete</button>
            </form>
          </td>
        </tr>`;
    })
    .join("\n");

  return `<div class="table-wrap">
      <table>
        <tr>
          <th>Short URL</th>
          <th>Destination</th>
          <th>Clicks</th>
          <th>Created</th>
          <th></th>
        </tr>
${rows}
      </table>
    </div>`;
}

function renderStats(urls) {
  if (!urls || urls.length === 0) return "";

  const clicks = urls.reduce((sum, u) => sum + (u.clicked || 0), 0);
  const linkWord = urls.length === 1 ? "link" : "links";
  const clickWord = clicks === 1 ? "click" : "clicks";

  return `<p class="stats">${urls.length} ${linkWord} · ${clicks} ${clickWord} total</p>`;
}

// read once per container rather than on every request
let cachedCss = null;
function styleTag() {
  cachedCss ??= fs.readFileSync(
    path.join(import.meta.dirname, "views", "style.css"),
    "utf8"
  );
  return `<style>\n${cachedCss}</style>`;
}

export function renderPage(
  res,
  page,
  status,
  { error = null, message = null, user = null, urls = null, origin = "", qr = null } = {}
) {
  const html = fs
    .readFileSync(path.join(import.meta.dirname, "views", page), "utf8")
    .replace("<!--STYLES-->", styleTag())
    .replace("<!--ERROR-->", error ? `<p class="alert error">${escapeHtml(error)}</p>` : "")
    .replace("<!--MESSAGE-->", message ? `<p class="alert ok">${escapeHtml(message)}</p>` : "")
    .replace(
      "<!--WELCOME-->",
      user
        ? `<span class="welcome">Signed in as <strong>${escapeHtml(user.name)}</strong></span>`
        : "<span></span>"
    )
    .replace("<!--QR-->", qr || "")
    .replace("<!--STATS-->", renderStats(urls))
    .replace("<!--URLS-->", renderUrlTable(urls, origin));

  res.status(status).send(html);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  req.token = req.cookies.token || ""
  next()
})

app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/signup", (req, res) => {
  renderPage(res, "signup.html", 200);
});

app.post("/signup", homePageCheck, async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return renderPage(res, "signup.html", 400, {
      error: "Name, email and password are required",
    });
  }

  try {
    await User.create({ name, email, password });
  } catch (err) {
    if (err.code === 11000) {
      return renderPage(res, "signup.html", 400, {
        error: "An account with this email already exists",
      });
    }

    return renderPage(res, "signup.html", 400, {
      error: err.message,
    });
  }

  renderPage(res, "signup.html", 200, {
    message: `Account created for ${email}. You can now log in.`,
  });
});

app.get("/login", homePageCheck, (req, res) => {
  renderPage(res, "login.html", 200);
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return renderPage(res, "login.html", 400, {
      error: "Email and password are required",
    });
  }

  const user = await User.findOne({ email, password });

  if (!user) {
    return renderPage(res, "login.html", 400, {
      error: "Invalid Credentials",
    });
  }

  var token = jwt.sign(
    { _id: user._id, name: user.name, email: user.email, role: user.role },
    jwtPrivatekey,
    { expiresIn: "30d" }
  );

  res.cookie("token", token, {
    ...COOKIE_OPTIONS,
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  }).redirect("/shorten");
});

app.post("/logout", (req, res) => {
  res.clearCookie("token", COOKIE_OPTIONS).redirect(303, "/login");
});

app.get("/shorten", authorize, async (req, res) => {
  const { created, error, deleted } = req.query;
  const origin = `${req.protocol}://${req.get("host")}`;

  const urls = await Url.find({ createdBy: req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  renderPage(res, "shorten.html", 200, {
    user: req.user,
    urls,
    origin,
    error: error || null,
    message: created
      ? `Short URL: ${origin}/${created}`
      : deleted
        ? "Short link deleted."
        : null,
  });
});

app.post("/shorten", authorize, async (req, res) => {
  const { url } = req.body || {};

  if (!url) {
    return res.redirect(303, "/shorten?error=URL+is+required");
  }

  const shortId = shortid.generate();
  await Url.create({ shortId, url, createdBy: req.user._id });

  res.redirect(303, `/shorten`);
});

app.get("/urls/:id/qr", authorize, async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return renderPage(res, "qr.html", 404, { error: "That link does not exist." });
  }

  const entry = await Url.findOne({ _id: id, createdBy: req.user._id }).lean();

  if (!entry) {
    return renderPage(res, "qr.html", 404, { error: "That link does not exist." });
  }

  const short = `${req.protocol}://${req.get("host")}/${entry.shortId}`;
  const png = await QRCode.toDataURL(short, { width: 512, margin: 1 });
  const svg = await QRCode.toString(short, { type: "svg", margin: 1 });
  const svgHref = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  renderPage(res, "qr.html", 200, {
    qr: `<img src="${png}" alt="QR code for ${escapeHtml(short)}" width="512" height="512" />
        <a class="qr-target" href="${escapeHtml(short)}">${escapeHtml(short)}</a>
        <div class="qr-actions">
          <a class="btn-link" href="${png}" download="${escapeHtml(entry.shortId)}.png">Download PNG</a>
          <a class="btn-link ghost" href="${svgHref}" download="${escapeHtml(entry.shortId)}.svg">Download SVG</a>
        </div>`,
  });
});

app.post("/urls/:id/delete", authorize, async (req, res) => {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.redirect(303, "/shorten?error=That+link+does+not+exist");
  }

  // createdBy in the filter is what stops one user deleting another's link
  const result = await Url.deleteOne({ _id: id, createdBy: req.user._id });

  if (result.deletedCount === 0) {
    return res.redirect(303, "/shorten?error=That+link+does+not+exist");
  }

  res.redirect(303, "/shorten?deleted=1");
});

app.get("/:shortId", async (req, res) => {
  const entry = await Url.findOneAndUpdate(
    { shortId: req.params.shortId },
    { $inc: { clicked: 1 } },
    { returnDocument: "after" }
  );

  if (!entry) {
    return renderPage(res, "notfound.html", 404, {
      error: "This short URL does not exist.",
    });
  }

  const target = /^https?:\/\//i.test(entry.url)
    ? entry.url
    : `https://${entry.url}`;

  res.redirect(target);
});

export default app;
