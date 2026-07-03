import mongoose from "mongoose";


const userSchema = new mongoose.Schema(
  {
    name: String,
    email: {
      type: String,
      unique: true,
      required: true,
    },
    password: {
      type: String,
      required: true,
    },
    avatar: String,
    role: {
      type: String,
      default: "Volunteer",
    },
    points: {
      type: Number,
      default: 0,
    },
    district: String,
    joinedSquads: [String],
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);