import { ConvexHttpClient } from "convex/browser";
import type { Id } from "../convex/_generated/dataModel";
import { factoryTools } from "./tools";

const [toolName, rawInput = "{}"] = process.argv.slice(2);
const convexUrl = process.env.CONVEX_URL;
const runId = process.env.FACTORY_RUN_ID as Id<"runs"> | undefined;

if (!convexUrl || !runId || !toolName) {
  console.error("This command is only available inside a Factory Grok Run.");
  process.exit(2);
}

const tool = factoryTools(new ConvexHttpClient(convexUrl), runId)[toolName];
if (!tool) {
  console.error(`Unknown Factory tool: ${toolName}`);
  process.exit(2);
}

try {
  const input = JSON.parse(rawInput) as Record<string, unknown>;
  console.log(await tool.execute(input));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
