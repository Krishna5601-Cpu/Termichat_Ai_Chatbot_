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
