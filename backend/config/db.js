import dns from "node:dns";
import mongoose from "mongoose";

// Atlas "mongodb+srv://" addresses need a DNS SRV lookup. Some networks
// (routers, office/ISP DNS) refuse those for Node, giving
// "querySrv ECONNREFUSED" even though the internet works fine.
// So we ask public DNS servers instead. Override with DNS_SERVERS in .env
// (comma-separated), or set DNS_SERVERS=system to use the computer's own DNS.
const useReliableDns = () => {
  const setting = (process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1").trim();
  if (setting.toLowerCase() === "system") return;
  dns.setServers(setting.split(",").map((s) => s.trim()).filter(Boolean));
};

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined in .env");
  }

  if (uri.startsWith("mongodb+srv://")) useReliableDns();

  const conn = await mongoose.connect(uri);
  console.log(`MongoDB connected: ${conn.connection.host}`);
};

export default connectDB;
