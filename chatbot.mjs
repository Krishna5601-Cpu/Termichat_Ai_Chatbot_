import OpenAI from "openai";
import dotenv from "dotenv";
import * as readline from "readline";

dotenv.config();

// Initialize Sharanga client
const client = new OpenAI({
  apiKey: process.env.SHARANGA_API_KEY,
  baseURL: "https://sharanga.cloud/api/public/v1",
});

// Conversation memory
const messages = [
  {
    role: "system",
    content:
      "You are Sharanga, a friendly, concise, and helpful AI assistant. Answer clearly and use markdown when useful.",
  },
];

// Streaming chat call
async function chat(userInput) {
  messages.push({ role: "user", content: userInput });

  const stream = await client.chat.completions.create({
    model: "sharanga",
    messages,
    stream: true,
  });

  let fullReply = "";
  process.stdout.write("🤖 ");
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? "";
    process.stdout.write(token);
    fullReply += token;
  }
  console.log("\n");

  messages.push({ role: "assistant", content: fullReply });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "🧑 ",
});

console.log("╔══════════════════════════════════════╗");
console.log("║   Sharanga AI Chatbot — Ready! 🚀    ║");
console.log("║   Type 'exit' or 'quit' to leave     ║");
console.log("║   Type 'clear' to reset memory       ║");
console.log("╚══════════════════════════════════════╝\n");

rl.prompt();

rl.on("line", async (line) => {
  const input = line.trim();

  if (!input) return rl.prompt();

  if (["exit", "quit"].includes(input.toLowerCase())) {
    console.log("👋 Goodbye!");
    process.exit(0);
  }

  if (input.toLowerCase() === "clear") {
    messages.splice(1); // keep system prompt
    console.log("🧹 Memory cleared.\n");
    return rl.prompt();
  }

  try {
    await chat(input);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }

  rl.prompt();
});
