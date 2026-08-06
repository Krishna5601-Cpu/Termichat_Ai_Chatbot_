import { notes } from "./memory.mjs";

//mTool implementations
// Each tool: { definition (OpenAI schema), handler }

const tools = {
  // Get current date & time
  get_time: {
    definition: {
      type: "function",
      function: {
        name: "get_time",
        description:
          "Get the current date and time. Useful when the user asks 'what time is it?' or needs scheduling help.",
        parameters: {
          type: "object",
          properties: {
            timezone: {
              type: "boolean",
              description: "Include timezone info",
            },
          },
        },
      },
    },
    handler: async ({ timezone }) => {
      const now = new Date();
      const result = timezone ? now.toISOString() : now.toLocaleString();
      return `Current date and time: ${result}`;
    },
  },

  // Safe math calculator
  calculate: {
    definition: {
      type: "function",
      function: {
        name: "calculate",
        description:
          "Evaluate a math expression. Supports +, -, *, /, %, parentheses, Math functions. Example: '2 + 3 * 4', 'Math.sqrt(144)', '(10 + 5) / 3'",
        parameters: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "The math expression to evaluate",
            },
          },
          required: ["expression"],
        },
      },
    },
    handler: async ({ expression }) => {
      // Sanitize: only allow numbers, operators, parentheses, Math.xxx
      const sanitized = expression
        .replace(/[^0-9+\-*/%().,\s]|Math\./g, (match) => {
          return match.startsWith("Math") ? match : "";
        })
        .trim();

      if (
        !sanitized ||
        /[^0-9+\-*/%().,\sMath.]/.test(sanitized.replace(/Math\.\w+/g, ""))
      ) {
        throw new Error("Invalid characters in expression");
      }

      try {
        const result = Function(`"use strict"; return (${sanitized})`)();
        return `${expression} = ${result}`;
      } catch {
        throw new Error(`Could not evaluate: ${expression}`);
      }
    },
  },

  // Save a note
  save_note: {
    definition: {
      type: "function",
      function: {
        name: "save_note",
        description:
          "Save a note to persistent storage. The note persists across chat sessions. Great for reminders, ideas, or anything the user wants to remember.",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Short name/title for the note (used as filename)",
            },
            content: {
              type: "string",
              description: "The full content of the note",
            },
          },
          required: ["name", "content"],
        },
      },
    },
    handler: async ({ name, content }) => {
      notes.save(name, content);
      return `✅ Note "${name}" saved successfully.`;
    },
  },

  // Read a note
  read_note: {
    definition: {
      type: "function",
      function: {
        name: "read_note",
        description: "Read a previously saved note by name.",
        parameters: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The name of the note to read",
            },
          },
          required: ["name"],
        },
      },
    },
    handler: async ({ name }) => {
      const content = notes.read(name);
      if (!content) throw new Error(`Note "${name}" not found.`);
      return content;
    },
  },

  // List all notes
  list_notes: {
    definition: {
      type: "function",
      function: {
        name: "list_notes",
        description: "List all saved notes by name.",
        parameters: { type: "object", properties: {} },
      },
    },
    handler: async () => {
      const list = notes.list();
      return list.length > 0
        ? `Saved notes: ${list.join(", ")}`
        : "No notes saved yet.";
    },
  },

  // Delete a note
  delete_note: {
    definition: {
      type: "function",
      function: {
        name: "delete_note",
        description: "Delete a saved note by name.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the note to delete" },
          },
          required: ["name"],
        },
      },
    },
    handler: async ({ name }) => {
      const deleted = notes.delete(name);
      return deleted
        ? `✅ Note "${name}" deleted.`
        : `Note "${name}" not found.`;
    },
  },

  // Generate randomness
  random: {
    definition: {
      type: "function",
      function: {
        name: "random",
        description:
          "Generate random values: dice roll, coin flip, or random number in a range.",
        parameters: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["dice", "coin", "number"],
              description: "Type of random generation",
            },
            min: {
              type: "number",
              description: "Min value (for 'number' type)",
            },
            max: {
              type: "number",
              description: "Max value (for 'number' type)",
            },
            sides: {
              type: "number",
              description: "Number of sides (for 'dice' type, default 6)",
            },
          },
          required: ["type"],
        },
      },
    },
    handler: async ({ type, min = 0, max = 100, sides = 6 }) => {
      switch (type) {
        case "dice":
          return `🎲 You rolled a ${Math.ceil(Math.random() * sides)} (d${sides}).`;
        case "coin":
          return Math.random() < 0.5 ? "🪙 Heads!" : "🪙 Tails!";
        case "number":
          const val = Math.floor(Math.random() * (max - min + 1)) + min;
          return `🔢 Random number (${min}-${max}): ${val}`;
        default:
          throw new Error(`Unknown random type: ${type}`);
      }
    },
  },

  // Text statistics
  text_stats: {
    definition: {
      type: "function",
      function: {
        name: "text_stats",
        description:
          "Analyze text and return statistics: word count, character count, sentence count, reading time.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "The text to analyze" },
          },
          required: ["text"],
        },
      },
    },
    handler: async ({ text }) => {
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const chars = text.length;
      const charsNoSpaces = text.replace(/\s/g, "").length;
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim()).length;
      const paragraphs = text.split(/\n\n+/).filter((s) => s.trim()).length;
      const readTime = Math.max(1, Math.ceil(words / 200));

      return JSON.stringify(
        {
          words,
          chars,
          charsNoSpaces,
          sentences,
          paragraphs,
          readingTime: `${readTime} min`,
        },
        null,
        2,
      );
    },
  },
};

// Exports
export const toolDefinitions = Object.values(tools).map((t) => t.definition);

export async function executeTool(name, args) {
  const tool = tools[name];
  if (!tool) throw new Error(`Unknown tool: ${name}`);

  const parsed = typeof args === "string" ? JSON.parse(args || "{}") : args;
  return tool.handler(parsed);
}
