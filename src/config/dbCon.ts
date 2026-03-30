import mongoose from "mongoose";
import { logger } from "../utils/logs/logger";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_MDB ||
  "mongodb://localhost:27017/elippser-booking";

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(MONGODB_URI);
    logger.info("MongoDB conectado correctamente");
  } catch (error) {
    logger.error("Error al conectar a MongoDB:", error);
    process.exit(1);
  }
};

mongoose.connection.on("disconnected", () => {
  logger.warn("MongoDB desconectado");
});

mongoose.connection.on("error", (err: Error) => {
  logger.error("Error de conexión MongoDB:", err);
});
