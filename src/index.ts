import express, { Request, Response } from "express";
import cors from "cors";
import { AppDataSource } from "./db/data-source";

import orderRoutes from "./routes/orderRoutes";
import profileRoutes from "./routes/profileRoutes";
import authRoutes from "./routes/authRoutes";
import devRoutes from "./routes/devRoutes";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/dev", devRoutes);
app.use("/api/orders", orderRoutes);

// Health check route
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Velo Backend API is running!" });
});

// Initialize database connection
AppDataSource.initialize()
  .then(() => {
    console.log("Data Source has been initialized!");

    // Start server
    app.listen(PORT, async () => {
      console.log(`Server is running on port ${PORT}`);

      // Auto-start ngrok tunnel
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ngrokLib = require("@ngrok/ngrok");
        const listener = await ngrokLib.forward({
          addr: Number(PORT),
          authtoken: process.env.NGROK_AUTH_TOKEN,
        });
        console.log(`🌐 ngrok tunnel active: ${listener.url()}`);
      } catch (err) {
        console.error("Failed to start ngrok tunnel:", err);
      }
    });
  })
  .catch((error: Error) => {
    console.error("Error during Data Source initialization:", error);
  });
