import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.SHARANGA_API_KEY) {
  console.error("  Missing SHARANGA_API_KEY in .env ;)");
  console.error("   Copy .env.example to .env and add your key.");
  process.exit(1);
}

export const client = new OpenAI({
  apiKey: process.env.SHARANGA_API_KEY,
  baseURL: "https://sharanga.cloud/api/public/v1",
});

export const MODEL = "sharanga";
