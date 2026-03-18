import { execSync } from "node:child_process";

const port = Number(process.env.PORT ?? 5173);

process.env.PORT = String(port);
process.env.ELECTRON_RENDERER_PORT = String(port);

execSync(
  "turbo run dev --filter=@iara/desktop --filter=@iara/web --filter=@iara/server --parallel",
  {
    stdio: "inherit",
    env: process.env,
  },
);
