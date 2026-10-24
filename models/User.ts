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
      min: 0,
    },
    district: String,
    joinedSquads: [String],
    // Squads that already paid out their join bonus, so leaving and re-joining earns nothing
    rewardedSquads: [String],
    // When each green action was logged, to allow each one once per day
    greenActionLog: [
      {
        _id: false,
        actionId: String,
        at: Date,
      },
    ],
    redemptions: [
      {
        _id: false,
        rewardId: String,
        code: String,
        at: Date,
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
