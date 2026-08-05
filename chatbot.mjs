import OpenAI from "openai";
import dotenv from "dotenv";
import * as readline from "readline";

dotenv.config();

// Initialize Sharanga client
const client = new OpenAI({
  apiKey: process.env.SHARANGA_API_KEY,
  baseURL: "https://sharanga.cloud/api/public/v1",
});