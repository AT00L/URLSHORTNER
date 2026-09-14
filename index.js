require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const { connectToMongoDB } = require("./config/db");

const app = express();
const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI;

const LOGIN_PAGE = path.join(__dirname, "public", "login.html");

function renderLogin(res, status, error) {
  const html = fs
    .readFileSync(LOGIN_PAGE, "utf8")
    .replace("<!--ERROR-->", error ? `<p>${error}</p>` : "");

  res.status(status).send(html);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.redirect("/login");
});

app.get("/login", (req, res) => {
  renderLogin(res, 200, null);
});

app.post("/login", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return renderLogin(res, 400, "Email and password are required");
  }

  res.json({ message: "Login received", email });
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
