import mongoose from "mongoose";

// Serverless containers are reused between invocations, so the connection is
// cached on globalThis and shared instead of reopened on every request.
const cache = (globalThis.__mongoose ??= { promise: null });

export async function connectToMongoDB(url) {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(url)
      .then((m) => {
        console.log("MongoDB connected");
        return m;
      })
      .catch((err) => {
        // let the next invocation retry instead of caching the failure
        cache.promise = null;
        throw err;
      });
  }

  return cache.promise;
}
