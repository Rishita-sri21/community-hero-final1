import mongoose from "mongoose";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log("MongoDB Connected");
  } catch (err: any) {
    console.log("MongoDB unavailable. Continuing without database.");
    console.log(err.message);
  }
};

export default connectDB;