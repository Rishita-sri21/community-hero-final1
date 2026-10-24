import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  event: { type: String, required: true },
  message: String,
  success: Boolean,
  userEmail: String,
  ipAddress: String,
});

// Old entries expire after 90 days so the collection can't grow without bound (the index also serves newest-first sorting)
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model("AuditLog", auditLogSchema);
