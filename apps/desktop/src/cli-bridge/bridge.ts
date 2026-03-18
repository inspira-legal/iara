import * as net from "node:net";

interface BridgeMessage {
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

interface BridgeResponse {
  id: string;
  result?: unknown;
  error?: string;
}

function sendMessage(socketPath: string, msg: BridgeMessage): Promise<BridgeResponse> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath, () => {
      client.write(JSON.stringify(msg) + "\n");
    });

    let buffer = "";
    client.on("data", (data) => {
      buffer += data.toString();
      if (buffer.includes("\n")) {
        client.destroy();
        try {
          resolve(JSON.parse(buffer.trim()) as BridgeResponse);
        } catch {
          reject(new Error(`Invalid response: ${buffer}`));
        }
      }
    });

    client.on("error", (err) => {
      reject(new Error(`Socket connection failed: ${err.message}`));
    });

    setTimeout(() => {
      client.destroy();
      reject(new Error("Socket timeout"));
    }, 5000);
  });
}

async function main(): Promise<void> {
  const socketPath = process.env.IARA_DESKTOP_SOCKET;
  if (!socketPath) {
    console.error("IARA_DESKTOP_SOCKET not set");
    process.exit(1);
  }

  const [method, ...rest] = process.argv.slice(2);
  if (!method) {
    console.error("Usage: iara-bridge <method> [params...]");
    process.exit(1);
  }

  // Parse params: "key=value" pairs or single positional arg as "message"
  const params: Record<string, unknown> = {};
  for (const arg of rest) {
    const eqIdx = arg.indexOf("=");
    if (eqIdx > 0) {
      params[arg.slice(0, eqIdx)] = arg.slice(eqIdx + 1);
    } else {
      params.message = arg;
    }
  }

  try {
    const response = await sendMessage(socketPath, {
      id: crypto.randomUUID(),
      method,
      params,
    });

    if (response.error) {
      console.error(response.error);
      process.exit(1);
    }

    if (response.result !== undefined) {
      console.log(
        typeof response.result === "string"
          ? response.result
          : JSON.stringify(response.result, null, 2),
      );
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

void main();
