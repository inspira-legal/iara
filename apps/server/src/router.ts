import type {
  WsMethods,
  WsRequest,
  WsResponse,
  WsResponseError,
  WsResponseOk,
} from "@iara/contracts";

type Handler<M extends keyof WsMethods = keyof WsMethods> = (
  params: WsMethods[M]["params"],
) => Promise<WsMethods[M]["result"]>;

const handlers = new Map<string, Handler<any>>();

export function registerMethod<M extends keyof WsMethods>(method: M, handler: Handler<M>): void {
  handlers.set(method, handler as Handler<any>);
}

export async function dispatch(raw: string): Promise<string> {
  let parsed: WsRequest;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const err: WsResponseError = {
      id: "0",
      error: { code: "PARSE_ERROR", message: "Invalid JSON" },
    };
    return JSON.stringify(err);
  }

  const { id, method, params } = parsed;
  const handler = handlers.get(method);

  if (!handler) {
    const err: WsResponseError = {
      id,
      error: { code: "METHOD_NOT_FOUND", message: `Unknown method: ${method}` },
    };
    return JSON.stringify(err);
  }

  try {
    const result = await handler(params);
    const res: WsResponseOk = { id, result: result as any };
    return JSON.stringify(res);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const err: WsResponseError = {
      id,
      error: { code: "INTERNAL_ERROR", message },
    };
    return JSON.stringify(err);
  }
}
