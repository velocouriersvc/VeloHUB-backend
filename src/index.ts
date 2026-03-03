import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import { AppDataSource } from "./db/data-source";

import orderRoutes from "./routes/orderRoutes";
import profileRoutes from "./routes/profileRoutes";
import authRoutes from "./routes/authRoutes";
import devRoutes from "./routes/devRoutes";
import rideRoutes from "./routes/rideRoutes";
import driverRoutes from "./routes/driverRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import walletRoutes from "./routes/walletRoutes";
import locationRoutes from "./routes/locationRoutes";
import ratingRoutes from "./routes/ratingRoutes";
import placesRoutes from "./routes/placesRoutes";
import notificationRoutes from "./routes/notificationRoutes";

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
app.use("/api/v1/rides", rideRoutes);
app.use("/api/v1/driver", driverRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/locations", locationRoutes);
app.use("/api/v1/ratings", ratingRoutes);
app.use("/api/v1/places", placesRoutes);
app.use("/api/v1/notifications", notificationRoutes);
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

      // Auto-start ngrok tunnel in development
      if (process.env.NODE_ENV !== "production") {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const ngrok = require("@ngrok/ngrok");
          const listener = await ngrok.forward({
            addr: Number(PORT),
            authtoken: process.env.NGROK_AUTH_TOKEN,
          });
          process.env.NGROK_URL = listener.url();
          console.log(`🌐 ngrok tunnel active: ${process.env.NGROK_URL}`);
        } catch (err) {
          console.error("Failed to start ngrok tunnel:", err);
        }
      }
    });
  })
  .catch((error: Error) => {
    console.error("Error during Data Source initialization:", error);
  });
