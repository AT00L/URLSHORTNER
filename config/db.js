import mongoose from "mongoose";

export async function connectToMongoDB(url) {
  await mongoose.connect(url);
  console.log("MongoDB connected");
}
