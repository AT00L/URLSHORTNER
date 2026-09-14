require("dotenv").config();

const express = require("express");

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.json({ message: "URL shortner server is running" });
});

app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
