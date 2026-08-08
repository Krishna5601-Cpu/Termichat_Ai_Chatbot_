import * as readline from "readline";
import { client, MODEL } from "./client.mjs";
import { Session } from "./memory.mjs";
import { toolDefinitions, executeTool } from "./tools.mjs";
import {
  getPersonality,
  listPersonalities,
  personalities,
} from "./personalities.mjs";

// State
let session = new Session();
let currentPersonality = "sharanga";

function initSession() {
  session = new Session();
  session.setSystem(getPersonality(currentPersonality).systemPrompt);
}

initSession(); // Start fresh with default personality

// Core chat function (streaming + tool-call loop)
async function chat(userInput) {
  session.add({ role: "user", content: userInput });

  // Loop: model may call tools, then we re-call with results
  let iterations = 0;
  const MAX_TOOL_ROUNDS = 5;

  while (iterations < MAX_TOOL_ROUNDS) {
    iterations++;

    const stream = await client.chat.completions.create({
      model: MODEL,
      messages: session.getHistory(),
      tools: toolDefinitions,
      stream: true,
    });

    let content = "";
    let toolCalls = [];

    process.stdout.write("🤖 ");

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      // Accumulate text
      if (delta.content) {
        process.stdout.write(delta.content);
        content += delta.content;
      }

      // Accumulate tool calls from streamed deltas
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls[idx]) {
            toolCalls[idx] = {
              id: tc.id ?? "",
              type: "function",
              function: { name: "", arguments: "" },
            };
          }
          if (tc.id) toolCalls[idx].id = tc.id;
          if (tc.function?.name)
            toolCalls[idx].function.name += tc.function.name;
          if (tc.function?.arguments)
            toolCalls[idx].function.arguments += tc.function.arguments;
        }
      }
    }

    // Case 1: Model wants to call tools
    toolCalls = toolCalls.filter(Boolean);

    if (toolCalls.length > 0) {
      // Add assistant message with tool calls to history
      session.add({
        role: "assistant",
        content: content || null,
        tool_calls: toolCalls,
      });

      // Execute each tool call
      for (const tc of toolCalls) {
        const toolName = tc.function.name;
        const toolArgs = tc.function.arguments;

        process.stdout.write(`\n   🔧 Calling tool: ${toolName}(${toolArgs})`);

        try {
          const result = await executeTool(toolName, toolArgs);
          session.add({
            role: "tool",
            tool_call_id: tc.id,
            content: String(result),
          });
          process.stdout.write(` → ✅\n`);
        } catch (err) {
          session.add({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error: ${err.message}`,
          });
          process.stdout.write(` → ❌ ${err.message}\n`);
        }
      }

      // Loop back to let model process tool results
      continue;
    }

    // Case 2: Model gave a final text response
    session.add({ role: "assistant", content });
    console.log("\n");
    session.save(); // Persist to disk
    return;
  }

  console.log("\n⚠️  Max tool rounds reached.\n");
  session.save();
}

// REPL
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "🧑 ",
});

const HELP = `
╔══════════════════════════════════════════════════════╗
║                AVAILABLE COMMANDS                    ║
╠══════════════════════════════════════════════════════╣
║  /help            Show this help message             ║
║  /new             Start a new conversation           ║
║  /save            Save current session manually      ║
║  /sessions        List all saved sessions            ║
║  /load <id>       Load a previous session            ║
║  /clear           Clear current session memory       ║
║  /personas        List available personalities       ║
║  /persona <key>   Switch personality                 ║
║  /history         Show current message history       ║
║  /exit            Exit the chatbot                   ║
╚══════════════════════════════════════════════════════╝
`;
// Pure ANSI Color Codes
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  brightWhite: "\x1b[97m",
  gray: "\x1b[90m",
};

// Strips ANSI control characters to get true terminal display length
function visibleLength(str = "") {
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

// Truncates plain text to target length
function truncateText(str = "", maxLength = 28) {
  const text = String(str);
  if (text.length > maxLength) {
    return text.substring(0, maxLength - 3) + "...";
  }
  return text;
}

function printBanner() {
  const p = getPersonality(currentPersonality) || {
    name: "Default",
    description: "Standard Assistant",
  };

  const width = 56; // Outer box width in characters
  const contentWidth = width - 4; // Width available inside borders (excluding "║ " and " ║")

  const border = (left, mid, right) =>
    `${c.cyan}${left}${mid.repeat(width - 2)}${right}${c.reset}`;

  // Centers or aligns content and calculates exact padding using visible characters
  const formatLine = (content) => {
    const visibleLen = visibleLength(content);
    const paddingNeeded = Math.max(0, contentWidth - visibleLen);
    return `${c.cyan}║${c.reset} ${content}${" ".repeat(paddingNeeded)} ${c.cyan}║${c.reset}`;
  };

  const formatRow = (label, value, valueColor = c.brightWhite) => {
    const formattedLabel = `${c.dim}${label.padEnd(12, " ")}:${c.reset}`;
    const truncatedVal = truncateText(value, contentWidth - 14);
    const formattedValue = `${valueColor}${truncatedVal}${c.reset}`;
    return formatLine(`${formattedLabel} ${formattedValue}`);
  };

  const uptimeSec = Math.floor(process.uptime ? process.uptime() : 0);
  const uptimeStr = `${Math.floor(uptimeSec / 60)}m ${uptimeSec % 60}s`;

  // Header line assembly
  const title = `${c.bold}${c.magenta}🤖 Sharanga Chatbot v2.0${c.reset}`;
  const status = `${c.green}● ONLINE${c.reset}`;
  const headerContent = `${title} ${status}`;

  // Footer line assembly
  const footerContent = `${c.dim}Type${c.reset} ${c.yellow}/help${c.reset} ${c.dim}for commands |${c.reset} ${c.yellow}/exit${c.reset} ${c.dim}to quit${c.reset}`;

  console.log(`
${border("╔", "═", "╗")}
${formatLine(headerContent)}
${border("╠", "═", "╣")}
${formatRow("Personality", p.name, c.yellow)}
${formatRow("Description", p.description, c.gray)}
${formatRow("Session ID", session?.id || "N/A", c.cyan)}
${formatRow("Runtime", `Node ${process.version} (${uptimeStr})`, c.dim)}
${border("╠", "═", "╣")}
${formatLine(footerContent)}
${border("╚", "═", "╝")}
`);
}

function printSessions() {
  const sessions = Session.listAll();
  if (sessions.length === 0) {
    console.log("📂 No saved sessions yet.\n");
    return;
  }

  console.log("📂 Saved Sessions:\n");
  console.log(
    "  ID       │ Title                              │ Msgs │ Updated",
  );
  console.log(
    "  ─────────┼────────────────────────────────────┼──────┼───────────────────",
  );

  for (const s of sessions) {
    const date = new Date(s.updatedAt).toLocaleString();
    console.log(
      `  ${s.id.padEnd(8)} │ ${s.title.slice(0, 34).padEnd(34)} │ ${String(s.messageCount).padStart(4)} │ ${date}`,
    );
  }
  console.log();
}

function printPersonas() {
  console.log("🎭 Available Personalities:\n");
  const list = listPersonalities();
  for (const p of list) {
    const active = p.key === currentPersonality ? " ← active" : "";
    console.log(
      `   ${p.key.padEnd(12)} │ ${p.name.padEnd(14)} │ ${p.description}${active}`,
    );
  }
  console.log();
}

function printHistory() {
  const msgs = session.getHistory().filter((m) => m.role !== "system");
  if (msgs.length === 0) {
    console.log("📭 No messages in current session.\n");
    return;
  }

  console.log(`📜 Session "${session.title}" (${msgs.length} messages):\n`);
  for (const m of msgs) {
    const icon = m.role === "user" ? "🧑" : "🤖";
    const preview = m.content?.slice(0, 80) ?? `[tool call]`;
    console.log(`  ${icon} ${preview}${m.content?.length > 80 ? "..." : ""}`);
  }
  console.log();
}

// Command handler
async function handleCommand(input) {
  const [cmd, ...rest] = input.slice(1).split(" ");
  const arg = rest.join(" ").trim();

  switch (cmd.toLowerCase()) {
    case "help":
      console.log(HELP);
      break;

    case "new":
      session.save();
      initSession();
      console.log(`🆕 New session started: ${session.id}\n`);
      break;

    case "save":
      session.save();
      console.log(`💾 Session saved: ${session.id}\n`);
      break;

    case "sessions":
      printSessions();
      break;

    case "load": {
      if (!arg) {
        console.log("Usage: /load <session-id>\n");
        break;
      }
      const loaded = Session.load(arg);
      if (!loaded) {
        console.log(`❌ Session "${arg}" not found.\n`);
      } else {
        session = loaded;
        console.log(`📂 Loaded session: ${session.title} (${session.id})\n`);
      }
      break;
    }

    case "clear":
      session.clear();
      console.log("🧹 Memory cleared (system prompt kept).\n");
      break;

    case "personas":
      printPersonas();
      break;

    case "persona": {
      if (!arg) {
        console.log("Usage: /persona <key>\n");
        break;
      }
      if (!personalities[arg.toLowerCase()]) {
        console.log(`❌ Unknown personality: ${arg}`);
        printPersonas();
        break;
      }
      currentPersonality = arg.toLowerCase();
      const p = getPersonality(currentPersonality);
      session.setSystem(p.systemPrompt);
      console.log(`🎭 Switched to: ${p.name} — ${p.description}\n`);
      break;
    }

    case "history":
      printHistory();
      break;

    case "exit":
    case "quit":
      session.save();
      console.log("💾 Session saved. 👋 Goodbye!");
      process.exit(0);
      break;

    default:
      console.log(`❓ Unknown command: /${cmd}. Type /help for commands.\n`);
  }
}

// Start
printBanner();
rl.prompt();

rl.on("line", async (line) => {
  const input = line.trim();

  if (!input) return rl.prompt();

  // Commands start with /
  if (input.startsWith("/")) {
    await handleCommand(input);
    return rl.prompt();
  }

  // Regular chat
  try {
    await chat(input);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\n`);
  }

  rl.prompt();
});

rl.on("close", () => {
  session.save();
  console.log("\n💾 Session saved. 👋 Goodbye!");
  process.exit(0);
});
