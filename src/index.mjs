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
