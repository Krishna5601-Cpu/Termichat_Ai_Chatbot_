import fs from "fs";
import path from "path";
import crypto from "crypto";

// Storage directories
const DATA_DIR = path.resolve("data");
const CONV_DIR = path.join(DATA_DIR, "conversations");
const NOTES_DIR = path.join(DATA_DIR, "notes");

for (const dir of [DATA_DIR, CONV_DIR, NOTES_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

// Conversation Session
export class Session {
  constructor(id) {
    this.id = id ?? crypto.randomUUID().slice(0, 8);
    this.messages = [];
    this.createdAt = new Date().toISOString();
    this.title = "Untitled";
  }

  setSystem(prompt) {
    // Replace or insert system message at index 0
    if (this.messages[0]?.role === "system") {
      this.messages[0].content = prompt;
    } else {
      this.messages.unshift({ role: "system", content: prompt });
    }
  }

  add(message) {
    this.messages.push(message);

    // Auto-title from first user message
    if (message.role === "user" && this.title === "Untitled") {
      this.title = message.content.slice(0, 50);
    }
  }

  getHistory() {
    return [...this.messages];
  }

  clear(preserveSystem = true) {
    if (preserveSystem && this.messages[0]?.role === "system") {
      this.messages = [this.messages[0]];
    } else {
      this.messages = [];
    }
  }

  save() {
    const filepath = path.join(CONV_DIR, `${this.id}.json`);
    const data = {
      id: this.id,
      title: this.title,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      messages: this.messages,
    };
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    return filepath;
  }

  static load(id) {
    const filepath = path.join(CONV_DIR, `${id}.json`);
    if (!fs.existsSync(filepath)) return null;

    const data = JSON.parse(fs.readFileSync(filepath, "utf-8"));
    const session = new Session(data.id);
    session.messages = data.messages;
    session.createdAt = data.createdAt;
    session.title = data.title;
    return session;
  }

  static listAll() {
    const files = fs.readdirSync(CONV_DIR).filter((f) => f.endsWith(".json"));

    return files
      .map((file) => {
        const data = JSON.parse(
          fs.readFileSync(path.join(CONV_DIR, file), "utf-8"),
        );
        return {
          id: data.id,
          title: data.title,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          messageCount: data.messages.filter((m) => m.role !== "system").length,
        };
      })
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
}

// Notes Storage (used by tools)
export const notes = {
  save(name, content) {
    const filepath = path.join(NOTES_DIR, `${name}.md`);
    fs.writeFileSync(filepath, content);
    return filepath;
  },

  read(name) {
    const filepath = path.join(NOTES_DIR, `${name}.md`);
    if (!fs.existsSync(filepath)) return null;
    return fs.readFileSync(filepath, "utf-8");
  },

  list() {
    return fs
      .readdirSync(NOTES_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(".md", ""));
  },

  delete(name) {
    const filepath = path.join(NOTES_DIR, `${name}.md`);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return true;
    }
    return false;
  },
};
