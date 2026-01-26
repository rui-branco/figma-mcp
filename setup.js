#!/usr/bin/env node

const readline = require("readline");
const fs = require("fs");
const path = require("path");

const configDir = path.join(process.env.HOME, ".config/figma-mcp");
const configPath = path.join(configDir, "config.json");

// Check for command line argument
let args = process.argv.slice(2);
// Skip "setup" arg if called via index.js
if (args[0] === "setup") args = args.slice(1);

if (args.length >= 1) {
  // Non-interactive mode: node setup.js <token>
  const [token] = args;

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify({ token }, null, 2));
  console.log(`Config saved to ${configPath}`);
  process.exit(0);
}

// Interactive mode
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function setup() {
  console.log("\n=== Figma MCP Setup ===\n");
  console.log("To get your Figma personal access token:");
  console.log("1. Go to https://www.figma.com/settings");
  console.log("2. Scroll to 'Personal access tokens'");
  console.log("3. Click 'Generate new token'");
  console.log("4. Copy the token\n");

  const token = await ask("Figma personal access token: ");

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify({ token }, null, 2));
  console.log(`\nConfig saved to ${configPath}`);

  console.log("\n=== Setup Complete ===");
  console.log("\nIf you haven't already, add to Claude Code with:\n");
  console.log("  claude mcp add --transport stdio figma -- npx -y @rui.branco/figma-mcp");
  console.log("\nThen restart Claude Code and run /mcp to verify.");

  rl.close();
}

setup().catch((e) => {
  console.error("Setup failed:", e.message);
  rl.close();
  process.exit(1);
});
