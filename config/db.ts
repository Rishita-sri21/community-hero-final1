import mongoose from "mongoose";
import { log } from '../services/logger';

// Throws if the connection fails. The app cannot work without the users
// database, so the caller (server.ts) decides to stop the process.
const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI!);
  log.info("MongoDB Connected");
};

export default connectDB;
