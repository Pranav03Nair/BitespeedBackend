import dotenv from "dotenv";
dotenv.config();

import express from "express";
const app = express();

import identifyRoutes from "./routes/identify";

const PORT = process.env.PORT || 3000;

app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.send("Server Up and Running");
});

app.use("/identify", identifyRoutes);

app.listen(PORT, () => {
  console.log(`Server listening on Port - http://localhost:${PORT}`);
});
