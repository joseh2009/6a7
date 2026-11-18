"use strict";
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { createRooms } = require("./lib/rooms");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000 });
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"], setHeaders: res => res.setHeader("Cache-Control", "no-cache") }));
app.get("/healthz", (_req, res) => res.json({ ok: true }));
createRooms(io);
server.listen(PORT, () => console.log(`6a7 rodando em http://localhost:${PORT}`));
