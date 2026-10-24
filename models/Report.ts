import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    reporter: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      name: String,
      avatar: String,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: String,
    urgency: { type: String, enum: ["High", "Medium", "Low"], default: "Medium" },
    district: String,
    locationDetails: String,
    // GeoJSON point: coordinates are [longitude, latitude], in that order
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
    },
    icon: String,
    // A URL: either an external image or /api/images/<id> for an uploaded photo
    image: String,
    upvotes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    upvotedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    verifiedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    status: { type: String, enum: ["open", "resolved"], default: "open" },
    resolution: {
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: Date,
      image: String,
      details: String,
    },
  },
  { timestamps: true }
);

// Lets /api/reports sort reports by distance from the user's neighborhood
reportSchema.index({ location: "2dsphere" });
reportSchema.index({ "reporter.id": 1, createdAt: -1 });

export type ReportDoc = mongoose.InferSchemaType<typeof reportSchema> & { _id: mongoose.Types.ObjectId; createdAt: Date };

export default mongoose.model("Report", reportSchema);
