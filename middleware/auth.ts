import jwt from "jsonwebtoken";
import User from "../models/User";

export const protect =
 async (req:any,res:any,next:any)=>{

 const authHeader =
 req.headers.authorization;

 if(
   !authHeader ||
   !authHeader.startsWith("Bearer")
 ){
   return res.status(401).json({
      error:"Unauthorized"
   });
 }

 const token =
 authHeader.split(" ")[1];

 try{

   const decoded:any =
   jwt.verify(
      token,
      process.env.JWT_SECRET!
   );

   req.user =
   await User.findById(decoded.id);

   next();

 }catch{

   return res.status(401).json({
      error:"Invalid token"
   });

 }

};