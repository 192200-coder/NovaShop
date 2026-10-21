import "./dns.js";
import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import productsRouter from "./routes/products.js";
import https from "node:https";
import fs from "node:fs";

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));

app.get("/api/lab/saludo", (req, res) => {
  res.json({ mensaje: "Hola desde NovaShop", metodo: req.method });
});

const catalogoLab = { laptop: 1500, mouse: 50 };

app.post("/api/lab/pedido", (req, res) => {
  const { producto, cantidad } = req.body;
  const precio = catalogoLab[String(producto || "").toLowerCase()];

  if (
    precio === undefined ||
    !Number.isInteger(cantidad) ||
    cantidad < 1 ||
    cantidad > 10
  ) {
    return res.status(400).json({ error: "Pedido de laboratorio no válido" });
  }

  res.json({
    producto,
    cantidad,
    precioUnitario: precio,
    total: cantidad * precio,
  });
});

app.get("/api/salud", (_req, res) =>
  res.json({
    estado: "ok",
    baseDeDatos:
      mongoose.connection.readyState === 1 ? "conectada" : "desconectada",
  }),
);
app.use("/api/productos", productsRouter);
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Error del servidor" });
});
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("Falta MONGODB_URI en backend/.env");
  process.exit(1);
}
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log("MongoDB conectado");
  const tlsOptions = {
    key: fs.readFileSync(
      new URL("../certificados/localhost-key.pem", import.meta.url),
    ),
    cert: fs.readFileSync(
      new URL("../certificados/localhost-cert.pem", import.meta.url),
    ),
  };

  https.createServer(tlsOptions, app).listen(3443, () => {
    console.log("API HTTPS en https://localhost:3443");
  });
} catch (err) {
  console.error("No fue posible conectar a MongoDB:", err.message);
  process.exit(1);
}
