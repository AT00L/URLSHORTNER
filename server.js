import "dotenv/config";

import app from "./app.js";
import { connectToMongoDB } from "./config/db.js";

const PORT = process.env.PORT || 8000;

connectToMongoDB(process.env.MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server started at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
