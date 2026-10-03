import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    // Not set until the email is verified and the user chooses one, so the
    // account only counts as complete when isVerified and password are both set.
    password: {
      type: String,
    },
    role: {
      type: String,
      enum: ["NORMAL", "ADMIN"],
      default: "NORMAL",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    // the code itself is never stored, only its hash
    otpHash: String,
    otpExpiresAt: Date,
    otpAttempts: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
