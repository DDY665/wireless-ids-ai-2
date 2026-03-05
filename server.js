import dotenv from "dotenv";
dotenv.config();


import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import aiRoute from "./routes/ai.js";

import { connectDB } from "./config/db.js";
import alertsRoute from "./routes/alerts.js";
import { startKismetListener } from "./services/kismetListener.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

connectDB();

app.use(cors());
app.use(express.json());

app.use("/alerts", alertsRoute);
app.use("/ai", aiRoute);

startKismetListener(io);

server.listen(5000, () => {
  console.log("Server running on port 5000");
});