import "dotenv/config";
import http from "http";
import app from "./server";
import { connectDB } from "./config/dbCon";

const PORT = process.env.PORT || 7070;

const server = http.createServer(app);

const start = async () => {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
  });
};

start();
