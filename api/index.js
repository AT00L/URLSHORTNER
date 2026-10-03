import app from "../app.js";
import { connectToMongoDB } from "../config/db.js";

// Vercel serverless entry point. Every request waits for the cached MongoDB
// connection before Express handles it; there is no app.listen() here.
export default async function handler(req, res) {
  try {
    await connectToMongoDB(process.env.MONGODB_URI);
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    res.statusCode = 500;
    return res.end("Database connection failed");
  }

  return app(req, res);
}
