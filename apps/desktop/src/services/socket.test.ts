import * as net from "node:net";
import * as path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SocketServer } from "./socket.js";

describe("socket server", () => {
  let tmpDir: string;
  let server: SocketServer;

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(tmpdir(), "iara-socket-test-"));
  });

  afterEach(async () => {
    await server?.stop();
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function createClient(socketPath: string): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const client = net.createConnection(socketPath, () => resolve(client));
      client.on("error", reject);
    });
  }

  // eslint-disable-next-line unicorn/consistent-function-scoping -- test helper needs access to test scope
  function sendAndReceive(
    client: net.Socket,
    msg: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      let buffer = "";
      const onData = (data: Buffer) => {
        buffer += data.toString();
        if (buffer.includes("\n")) {
          client.removeListener("data", onData);
          resolve(JSON.parse(buffer.trim()) as Record<string, unknown>);
        }
      };
      client.on("data", onData);
      client.write(JSON.stringify(msg) + "\n");
    });
  }

  it("handles requests and returns responses", async () => {
    const socketPath = path.join(tmpDir, "test.sock");
    server = new SocketServer(socketPath);
    server.on("notify", (params) => ({ received: params }));
    await server.start();

    const client = await createClient(socketPath);
    const response = await sendAndReceive(client, {
      id: "1",
      method: "notify",
      params: { message: "hello" },
    });

    expect(response.id).toBe("1");
    expect(response.result).toEqual({ received: { message: "hello" } });
    client.destroy();
  });

  it("returns error for unknown methods", async () => {
    const socketPath = path.join(tmpDir, "test2.sock");
    server = new SocketServer(socketPath);
    await server.start();

    const client = await createClient(socketPath);
    const response = await sendAndReceive(client, {
      id: "2",
      method: "nonexistent",
    });

    expect(response.id).toBe("2");
    expect(response.error).toContain("Unknown method");
    client.destroy();
  });
});
