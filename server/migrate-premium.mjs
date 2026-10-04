import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(await readFile(new URL("./001_premium_rooms.sql", import.meta.url), "utf8"));
  console.log("Premium-room schema applied.");
} finally {
  await pool.end();
}
