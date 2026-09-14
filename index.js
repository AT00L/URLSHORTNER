import "dotenv/config";

import fs from "fs";
import path from "path";
import express from "express";
import { connectToMongoDB } from "./config/db.js";
import { User } from "./models/user.js";
import { Url } from "./models/url.js";
import jwt from "jsonwebtoken"
import cookieParser from "cookie-parser";
import { authorize, homePageCheck } from "./middleware.js";
import shortid from "shortid";

const app = express();
const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI;
const jwtPrivatekey = process.env.JWT_PRIVATE_KEY
app.use(cookieParser());

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPage(res, page, status, { error = null, message = null, user = null } = {}) {
  const html = fs
    .readFileSync(path.join(import.meta.dirname, "public", page), "utf8")
    .replace("<!--ERROR-->", error ? `<p>${escapeHtml(error)}</p>` : "")
    .replace("<!--MESSAGE-->", message ? `<p>${escapeHtml(message)}</p>` : "")
    .replace("<!--WELCOME-->", user ? `<p>Welcome, ${escapeHtml(user.name)}</p>` : "");

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
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  }).redirect("/shorten");
});

app.get("/shorten", authorize, (req, res) => {
  renderPage(res, "shorten.html", 200, { user: req.user });
});

app.post("/shorten", authorize, async (req, res) => {
  const { url } = req.body || {};

  if (!url) {
    return renderPage(res, "shorten.html", 400, {
      error: "URL is required",
      user: req.user,
    });
  }

  const shortId = shortid.generate();
  await Url.create({ shortId, url, createdBy: req.user._id });

  renderPage(res, "shorten.html", 200, {
    message: `Short URL: ${req.protocol}://${req.get("host")}/${shortId}`,
    user: req.user,
  });
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
