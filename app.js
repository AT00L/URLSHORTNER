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
import { sendOtpEmail } from "./config/mailer.js";
import {
  generateOtp,
  hashOtp,
  otpExpiry,
  otpMatches,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MINUTES,
} from "./utils/otp.js";

const app = express();
// EB nginx and Cloudflare terminate TLS upstream; without this req.protocol is always "http"
app.set("trust proxy", true);
const jwtPrivatekey = process.env.JWT_PRIVATE_KEY
const APP_NAME = "URLShorty";

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

function renderBanner(user) {
  const brand = `<a class="brand" href="/">URL<span>Shorty</span></a>`;

  if (!user) {
    return `<header class="banner">${brand}</header>`;
  }

  const initial = escapeHtml((user.name || user.email || "?").trim().charAt(0).toUpperCase());

  return `<header class="banner">
      ${brand}
      <details class="avatar-menu" id="avatarMenu">
        <summary class="avatar" title="${escapeHtml(user.name || "")}" aria-label="Account menu">${initial}</summary>
        <div class="menu">
          <div class="menu-head">
            <strong>${escapeHtml(user.name || "")}</strong>
            <span>${escapeHtml(user.email || "")}</span>
          </div>
          <form action="/logout" method="POST">
            <button class="menu-item" type="submit">Log out</button>
          </form>
        </div>
      </details>
    </header>
    <script>
      // close the menu when clicking anywhere else, or on Escape
      document.addEventListener("click", (e) => {
        const menu = document.getElementById("avatarMenu");
        if (menu && menu.open && !menu.contains(e.target)) menu.open = false;
      });
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        const menu = document.getElementById("avatarMenu");
        if (menu) menu.open = false;
      });
    </script>`;
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

const APP_URL = "https://url.atulcode.com";
const GITHUB_URL = "https://github.com/AT00L/URLSHORTNER";

// Per-page title and description. Pages behind the login, or that only exist
// mid-signup, are marked noindex — thin or duplicate pages hurt the pages that
// should rank.
const SEO = {
  "login.html": {
    path: "/login",
    title: `Login — ${APP_NAME}`,
    description: `Sign in to ${APP_NAME} to shorten links, track click counts and download QR codes for every short URL you create.`,
    index: true,
  },
  "signup.html": {
    path: "/signup",
    title: `Create a free account — ${APP_NAME}`,
    description: `Create a free ${APP_NAME} account. Shorten long URLs, follow how often each link is clicked and generate a QR code in seconds.`,
    index: true,
  },
  "verify.html": { title: `Confirm your email — ${APP_NAME}`, index: false },
  "set-password.html": { title: `Choose a password — ${APP_NAME}`, index: false },
  "shorten.html": { title: `Your links — ${APP_NAME}`, index: false },
  "qr.html": { title: `QR code — ${APP_NAME}`, index: false },
  "notfound.html": { title: `Link not found — ${APP_NAME}`, index: false },
};

const DEFAULT_DESCRIPTION = `${APP_NAME} is a free URL shortener with click tracking and QR codes. Turn long links into short, shareable ones and see how often they are opened.`;

// CSS and icon never change, so they are read once per container
let cachedAssets = null;
function assets() {
  if (!cachedAssets) {
    const dir = path.join(import.meta.dirname, "views");
    cachedAssets = {
      css: fs.readFileSync(path.join(dir, "style.css"), "utf8"),
      icon: fs.readFileSync(path.join(dir, "favicon.svg")).toString("base64"),
    };
  }
  return cachedAssets;
}

function headTags(page) {
  const { css, icon } = assets();
  const seo = SEO[page] || {};
  const title = seo.title || APP_NAME;
  const description = seo.description || DEFAULT_DESCRIPTION;
  const canonical = APP_URL && seo.path ? `${APP_URL}${seo.path}` : null;

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta name="robots" content="${seo.index ? "index, follow" : "noindex, nofollow"}" />`,
    `<meta name="theme-color" content="#2f6fed" />`,
    canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}" />` : "",
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(APP_NAME)}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}" />` : "",
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `<link rel="icon" href="data:image/svg+xml;base64,${icon}" />`,
  ].filter(Boolean);

  if (seo.index) {
    tags.push(
      `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: APP_NAME,
        description: DEFAULT_DESCRIPTION,
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Any",
        url: APP_URL || undefined,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      })}</script>`
    );
  }

  tags.push(`<style>\n${css}</style>`);
  return tags.join("\n    ");
}

function renderFooter() {
  return `<footer class="site-footer">
      <h2>About ${escapeHtml(APP_NAME)}</h2>
      <p>
        ${escapeHtml(APP_NAME)} is a free link shortener. Paste a long URL and get a short,
        shareable one back — then watch how many times it is opened, and hand it
        out as a QR code when a link is awkward to type.
      </p>
      <ul>
        <li>Shorten any long URL into a compact link you can share anywhere</li>
        <li>Track a click count for every link you create</li>
        <li>Download a QR code as PNG or SVG for posters, slides and packaging</li>
        <li>Keep every link in one private dashboard, and delete any of them</li>
      </ul>
      <p class="legal">
        <span>© ${new Date().getFullYear()} ${escapeHtml(APP_NAME)}</span>
        <span><a href="${GITHUB_URL}" target="_blank" rel="noopener">Source on GitHub</a></span>
      </p>
    </footer>`;
}

export function renderPage(
  res,
  page,
  status,
  { error = null, message = null, user = null, urls = null, origin = "", qr = null, sentTo = null } = {}
) {
  const html = fs
    .readFileSync(path.join(import.meta.dirname, "views", page), "utf8")
    .replace("<!--STYLES-->", headTags(page))
    .replace("<!--BANNER-->", renderBanner(user))
    .replace("<!--FOOTER-->", renderFooter())
    .replace("<!--ERROR-->", error ? `<p class="alert error">${escapeHtml(error)}</p>` : "")
    .replace("<!--MESSAGE-->", message ? `<p class="alert ok">${escapeHtml(message)}</p>` : "")
    .replace("<!--QR-->", qr || "")
    .replace(
      "<!--SENTTO-->",
      sentTo
        ? `We sent a code to <strong>${escapeHtml(sentTo)}</strong>. It expires in ${OTP_TTL_MINUTES} minutes.`
        : ""
    )
    .replace("<!--STATS-->", renderStats(urls))
    .replace("<!--URLS-->", renderUrlTable(urls, origin));

  res.status(status).send(html);
}


const PENDING_COOKIE = "pending";
const PENDING_TTL_SECONDS = OTP_TTL_MINUTES * 60;

function startPending(res, user, stage) {
  const token = jwt.sign({ _id: user._id, stage }, jwtPrivatekey, {
    expiresIn: PENDING_TTL_SECONDS,
  });

  res.cookie(PENDING_COOKIE, token, {
    ...COOKIE_OPTIONS,
    maxAge: PENDING_TTL_SECONDS * 1000,
  });
}

function readPending(req) {
  const raw = req.cookies?.[PENDING_COOKIE];
  if (!raw) return null;

  try {
    return jwt.verify(raw, jwtPrivatekey);
  } catch {
    return null;
  }
}

function issueSession(res, user) {
  const token = jwt.sign(
    { _id: user._id, name: user.name, email: user.email, role: user.role },
    jwtPrivatekey,
    { expiresIn: "30d" }
  );

  res
    .clearCookie(PENDING_COOKIE, COOKIE_OPTIONS)
    .cookie("token", token, {
      ...COOKIE_OPTIONS,
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
}

// Stores a fresh code on the user and emails it. Throws if the mail fails.
async function issueOtp(user) {
  const code = generateOtp();

  user.otpHash = hashOtp(code);
  user.otpExpiresAt = otpExpiry();
  user.otpAttempts = 0;
  await user.save();

  await sendOtpEmail({ to: user.email, name: user.name, code });
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
  const { name, email } = req.body || {};

  if (!name || !email) {
    return renderPage(res, "signup.html", 400, {
      error: "Name and email are required",
    });
  }

  const existing = await User.findOne({ email });

  // A finished account (verified + password set) is never overwritten.
  if (existing && existing.isVerified && existing.password) {
    return renderPage(res, "signup.html", 400, {
      error: "An account with this email already exists. Try logging in.",
    });
  }

  let user;

  try {
    if (existing) {
      // Half-finished signup — start it over with the new details.
      existing.name = name;
      existing.password = undefined;
      existing.isVerified = false;
      user = existing;
      await user.save();
    } else {
      user = await User.create({ name, email });
    }
  } catch (err) {
    return renderPage(res, "signup.html", 400, { error: err.message });
  }

  try {
    await issueOtp(user);
  } catch (err) {
    // Nothing usable exists yet, so don't leave the record behind.
    await User.deleteOne({ _id: user._id });
    console.error("Signup email failed, account removed:", err.message);

    return renderPage(res, "signup.html", 502, {
      error: `We could not send a code to ${email}. Please check the address and try again.`,
    });
  }

  startPending(res, user, "otp");
  res.redirect(303, "/verify");
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

  const user = await User.findOne({ email });

  // An unverified or half-finished signup is not an account yet.
  if (!user || !user.isVerified || !user.password) {
    return renderPage(res, "login.html", 400, {
      error: "No account exists for this email.",
    });
  }

  if (user.password !== password) {
    return renderPage(res, "login.html", 400, {
      error: "Invalid Credentials",
    });
  }

  issueSession(res, user);
  res.redirect(303, "/shorten");
});

app.get("/verify", async (req, res) => {
  const pending = readPending(req);
  if (!pending || pending.stage !== "otp") return res.redirect(303, "/signup");

  const user = await User.findById(pending._id).lean();
  if (!user) return res.redirect(303, "/signup");

  const { error, resent } = req.query;

  renderPage(res, "verify.html", 200, {
    sentTo: user.email,
    error: error || null,
    message: resent ? "A new code is on its way." : null,
  });
});

app.post("/verify", async (req, res) => {
  const pending = readPending(req);
  if (!pending || pending.stage !== "otp") return res.redirect(303, "/signup");

  const user = await User.findById(pending._id);
  if (!user) return res.redirect(303, "/signup");

  const { code } = req.body || {};

  if (!code) {
    return renderPage(res, "verify.html", 400, {
      sentTo: user.email,
      error: "Enter the 6-digit code.",
    });
  }

  if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    return renderPage(res, "verify.html", 400, {
      sentTo: user.email,
      error: "That code has expired. Send a new one.",
    });
  }

  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return renderPage(res, "verify.html", 429, {
      sentTo: user.email,
      error: "Too many incorrect attempts. Send a new code.",
    });
  }

  if (!otpMatches(code, user.otpHash)) {
    user.otpAttempts += 1;
    await user.save();

    const left = OTP_MAX_ATTEMPTS - user.otpAttempts;

    return renderPage(res, "verify.html", 400, {
      sentTo: user.email,
      error: `That code is not correct. ${left} attempt${left === 1 ? "" : "s"} left.`,
    });
  }

  user.isVerified = true;
  user.otpHash = undefined;
  user.otpExpiresAt = undefined;
  user.otpAttempts = 0;
  await user.save();

  // Email proven — now let them choose a password.
  startPending(res, user, "password");
  res.redirect(303, "/set-password");
});

app.post("/verify/resend", async (req, res) => {
  const pending = readPending(req);
  if (!pending || pending.stage !== "otp") return res.redirect(303, "/signup");

  const user = await User.findById(pending._id);
  if (!user) return res.redirect(303, "/signup");

  try {
    await issueOtp(user);
  } catch (err) {
    console.error("Resend failed:", err.message);
    return res.redirect(303, "/verify?error=We+could+not+send+a+new+code");
  }

  res.redirect(303, "/verify?resent=1");
});

app.get("/set-password", async (req, res) => {
  const pending = readPending(req);
  if (!pending || pending.stage !== "password") return res.redirect(303, "/signup");

  const user = await User.findById(pending._id).lean();
  if (!user) return res.redirect(303, "/signup");

  renderPage(res, "set-password.html", 200, {
    sentTo: `${user.email} is confirmed.`,
  });
});

app.post("/set-password", async (req, res) => {
  const pending = readPending(req);
  if (!pending || pending.stage !== "password") return res.redirect(303, "/signup");

  const user = await User.findById(pending._id);
  if (!user) return res.redirect(303, "/signup");

  const { password, confirm } = req.body || {};
  const fail = (error) =>
    renderPage(res, "set-password.html", 400, {
      error,
      sentTo: `${user.email} is confirmed.`,
    });

  if (!password || !confirm) return fail("Enter the password twice.");
  if (password.length < 8) return fail("Use at least 8 characters.");
  if (password !== confirm) return fail("Those passwords do not match.");

  user.password = password;
  await user.save();

  issueSession(res, user);
  res.redirect(303, "/shorten");
});

app.post("/logout", (req, res) => {
  res
    .clearCookie("token", COOKIE_OPTIONS)
    .clearCookie(PENDING_COOKIE, COOKIE_OPTIONS)
    .redirect(303, "/login");
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

// Registered before the /:shortId catch-all, which would otherwise match these.
app.get("/robots.txt", (req, res) => {
  const origin = APP_URL || `${req.protocol}://${req.get("host")}`;

  res.type("text/plain").send(
    [
      "User-agent: *",
      "Allow: /$",
      "Allow: /login",
      "Allow: /signup",
      "Disallow: /shorten",
      "Disallow: /urls/",
      "Disallow: /verify",
      "Disallow: /set-password",
      "",
      `Sitemap: ${origin}/sitemap.xml`,
      "",
    ].join("\n")
  );
});

app.get("/sitemap.xml", (req, res) => {
  const origin = APP_URL || `${req.protocol}://${req.get("host")}`;
  const today = new Date().toISOString().slice(0, 10);

  const urls = ["/", "/login", "/signup"]
    .map(
      (p) => `  <url>
    <loc>${origin}${p}</loc>
    <lastmod>${today}</lastmod>
  </url>`
    )
    .join("\n");

  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
  );
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
