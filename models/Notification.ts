import mongoose from 'mongoose';

// Tells a reporter when a neighbor upvotes, verifies or fixes their report
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['upvote', 'verify', 'resolved'], required: true },
    report: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'Report' },
      title: String,
    },
    actor: { name: String, avatar: String },
    read: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ user: 1, createdAt: -1 });
// Old notifications expire after 60 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

export default mongoose.model('Notification', notificationSchema);
