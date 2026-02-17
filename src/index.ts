import express, { Request, Response } from "express";
import cors from "cors";
import { AppDataSource } from "./db/data-source";

import orderRoutes from "./routes/orderRoutes";
import profileRoutes from "./routes/profileRoutes";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/orders", orderRoutes);
app.use("/api/profiles", profileRoutes);

// Health check route
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Velo Backend API is running!" });
});

// Initialize database connection
AppDataSource.initialize()
  .then(() => {
    console.log("Data Source has been initialized!");

    // Start server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Error during Data Source initialization:", error);
  });
