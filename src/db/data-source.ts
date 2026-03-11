import { DataSource } from "typeorm";
import dotenv from "dotenv";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "velo",
  synchronize: true,
  logging: process.env.NODE_ENV === "development",
  entities: [__dirname + "/../models/**/*.{ts,js}"],
  migrations: [__dirname + "/../migrations/**/*.{ts,js}"],
  subscribers: [__dirname + "/subscribers/**/*.{ts,js}"],
});
