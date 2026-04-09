import mongoose from "mongoose";
import { logger } from "../utils/logs/logger";

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_MDB ||
  "mongodb://localhost:27017/elippser-booking";

let connectPromise: Promise<void> | null = null;

export const connectDB = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1) return;

  if (!connectPromise) {
    connectPromise = (async () => {
      try {
        await mongoose.connect(MONGODB_URI);
        logger.info("MongoDB conectado correctamente");
      } catch (error) {
        connectPromise = null;
        logger.error("Error al conectar a MongoDB:", error);
        throw error;
      }
    })();
  }

  await connectPromise;
};

mongoose.connection.on("disconnected", () => {
  connectPromise = null;
  logger.warn("MongoDB desconectado");
});

mongoose.connection.on("error", (err: Error) => {
  logger.error("Error de conexión MongoDB:", err);
});
