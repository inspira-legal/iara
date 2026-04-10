import type { WsPushEvents } from "@iara/contracts";

export type PushFn = <E extends keyof WsPushEvents>(event: E, params: WsPushEvents[E]) => void;

export type PushPatchFn = (patch: WsPushEvents["state:patch"]) => void;
