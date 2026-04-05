import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const electronBin = resolve(root, "apps/desktop/node_modules/.bin/electron");
const mainJs = resolve(root, "apps/desktop/dist-electron/main.js");

console.log("\nLaunching Electron smoke test...");

const child = spawn(electronBin, [mainJs], {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: "",
    ELECTRON_ENABLE_LOGGING: "1",
  },
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

const timeout = setTimeout(() => {
  child.kill();
}, 8_000);

child.on("exit", () => {
  clearTimeout(timeout);

  const fatalPatterns = [
    "Cannot find module",
    "MODULE_NOT_FOUND",
    "Refused to execute",
    "Uncaught Error",
    "Uncaught TypeError",
    "Uncaught ReferenceError",
  ];
  const failures = fatalPatterns.filter((p) => output.includes(p));

  if (failures.length > 0) {
    console.error("\nDesktop smoke test failed:");
    for (const f of failures) console.error(` - ${f}`);
    console.error("\nFull output:\n" + output);
    process.exit(1);
  }

  console.log("Desktop smoke test passed.");
  process.exit(0);
});
