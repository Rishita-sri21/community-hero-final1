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
    status: { type: String, enum: ["open", "resolved", "duplicate"], default: "open" },
    // Set when this report was closed as a duplicate of another (services/duplicates.ts)
    duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: "Report" },
    // The best match found when the report was posted, if it looked like a duplicate
    possibleDuplicate: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: "Report" },
      title: String,
      score: Number,
    },
    resolution: {
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      at: Date,
      image: String,
      details: String,
      // How the fix photo was checked, and by which background job (makes a retried job safe to repeat)
      confidenceScore: Number,
      checkedBy: { type: String, enum: ["gemini", "simulated"] },
      jobId: { type: mongoose.Schema.Types.ObjectId, ref: "Job" },
    },
    // Category and urgency suggested by a background triage job (services/jobHandlers.ts).
    // Only the fields listed in autoFields, the ones the reporter left to the AI, are applied.
    triage: {
      status: { type: String, enum: ["pending", "done", "failed"] },
      category: String,
      urgency: String,
      reason: String,
      source: { type: String, enum: ["gemini", "keywords"] },
      autoFields: [String],
      at: Date,
    },
  },
  { timestamps: true }
);

// Lets /api/reports sort reports by distance from the user's neighborhood
// status is part of the geo index, so the "open reports near here" queries can skip resolved
// reports from the index alone instead of fetching each document to check it (measured in
// load/README.md: about a third fewer documents read and ~30% faster)
reportSchema.index({ location: "2dsphere", status: 1 });
reportSchema.index({ "reporter.id": 1, createdAt: -1 });

export type ReportDoc = mongoose.InferSchemaType<typeof reportSchema> & { _id: mongoose.Types.ObjectId; createdAt: Date };

export default mongoose.model("Report", reportSchema);
