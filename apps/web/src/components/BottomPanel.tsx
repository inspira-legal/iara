import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import {
  Play,
  Square,
  Circle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  FileEdit,
  Download,
  Zap,
  Hammer,
  Search,
  FlaskConical,
  Workflow,
  AlertCircle,
} from "lucide-react";
import type { EssencialKey, ResolvedServiceDef, ScriptStatus } from "@iara/contracts";
import { isScriptActive, isScriptUnhealthy } from "~/lib/script-status";
import { statusTextColor, statusBgTint } from "~/lib/status-colors";
import { StatusButton } from "~/components/ui/StatusButton";
import { useScriptsStore, useIsDiscovering, useDiscoveryError } from "~/stores/scripts";
import { useWorkspace } from "~/lib/workspace";
import { transport } from "~/lib/ws-transport";

/** Essencial key order — codegen runs before dev */
const ESSENCIAL_ORDER: EssencialKey[] = ["setup", "codegen", "dev", "build", "check", "test"];

const ESSENCIAL_ICONS: Record<EssencialKey, typeof Play> = {
  setup: Download,
  codegen: Workflow,
  dev: Zap,
  build: Hammer,
  check: Search,
  test: FlaskConical,
};

export function BottomPanel({ panelRef }: { panelRef: RefObject<PanelImperativeHandle | null> }) {
  const config = useScriptsStore((s) => s.config);
  const loading = useScriptsStore((s) => s.loading);
  const activeTab = useScriptsStore((s) => s.activeTab);
  const collapsed = activeTab === null;
  const subscribePush = useScriptsStore((s) => s.subscribePush);
  const loadConfig = useScriptsStore((s) => s.loadConfig);
  const discover = useScriptsStore((s) => s.discover);
  const setActiveTab = useScriptsStore((s) => s.setActiveTab);
  const discovering = useIsDiscovering();
  const workspace = useWorkspace();
  const projectId = workspace?.split("/")[0] ?? null;

  // Subscribe to push events (global, always active)
  useEffect(() => {
    const unsub = subscribePush();
    return unsub;
  }, [subscribePush]);

  // Load config when project/workspace changes
  useEffect(() => {
    if (workspace) {
      void loadConfig(workspace);
    }
  }, [workspace, loadConfig]);

  // Collapse panel when no workspace is selected
  useEffect(() => {
    if (!workspace && !collapsed) {
      panelRef.current?.collapse();
    }
  }, [workspace, collapsed, panelRef]);

  // Reload config when scripts.yaml changes on disk
  useEffect(() => {
    const unsub = transport.subscribe("scripts:reload", ({ projectId: evtProjectId }) => {
      if (workspace && projectId && evtProjectId === projectId) {
        void loadConfig(workspace);
      }
    });
    return unsub;
  }, [projectId, workspace, loadConfig]);

  // Auto-discover when project has no scripts.yaml (once per project)
  const discoveredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      config &&
      !config.hasFile &&
      !discovering &&
      projectId &&
      discoveredForRef.current !== projectId
    ) {
      discoveredForRef.current = projectId;
      void discover(projectId);
    }
  }, [config, discovering, projectId, discover]);

  const statuses = config?.statuses ?? [];
  const runningCount = statuses.filter(isScriptActive).length;
  const hasOutputs = statuses.length > 0;

  // Fall back to scripts tab if output tab has nothing
  useEffect(() => {
    if (activeTab === "output" && !hasOutputs) {
      setActiveTab(collapsed ? null : "scripts");
    }
  }, [activeTab, hasOutputs, collapsed, setActiveTab]);

  // Auto-open output tab when any script fails
  const hasUnhealthy = statuses.some(isScriptUnhealthy);
  useEffect(() => {
    if (hasUnhealthy) {
      setActiveTab("output");
      if (collapsed) {
        panelRef.current?.expand();
      }
    }
  }, [hasUnhealthy, setActiveTab, collapsed, panelRef]);

  const toggleCollapse = () => {
    if (!workspace) return;
    if (collapsed) {
      setActiveTab("scripts");
      panelRef.current?.expand();
    } else {
      setActiveTab(null);
      panelRef.current?.collapse();
    }
  };

  const handleTabClick = (tab: "scripts" | "output") => {
    if (!workspace) return;
    if (activeTab === tab) {
      setActiveTab(null);
      panelRef.current?.collapse();
      return;
    }
    setActiveTab(tab);
    if (collapsed) {
      panelRef.current?.expand();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar — always visible (panel collapses to 32px) */}
      <div className="flex h-9 shrink-0 items-center bg-zinc-900 px-2">
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
          className="mr-1 rounded p-1 text-zinc-500 hover:text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        >
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        <div className="flex items-center gap-1">
          <TabButton
            label="Scripts"
            active={activeTab === "scripts"}
            onClick={() => handleTabClick("scripts")}
            badge={runningCount || undefined}
          />
          {hasOutputs && (
            <TabButton
              label="Output"
              active={activeTab === "output"}
              onClick={() => handleTabClick("output")}
            />
          )}
          {(loading || discovering) && (
            <Loader2 size={10} className="ml-1 animate-spin text-zinc-500" />
          )}
        </div>
      </div>

      {/* Panel content */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-950">
        {activeTab === "scripts" && <ScriptsTab />}
        {activeTab === "output" && <OutputTab />}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
        active
          ? "bg-zinc-800 text-zinc-200"
          : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-400"
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span
          className={`rounded-full px-1.5 text-xs ${statusBgTint.success} ${statusTextColor.success}`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Scripts Tab
// ---------------------------------------------------------------------------

function ScriptsTab() {
  const config = useScriptsStore((s) => s.config);
  const discover = useScriptsStore((s) => s.discover);
  const discovering = useIsDiscovering();
  const discoveryError = useDiscoveryError();
  const workspace = useWorkspace();
  const projectId = workspace?.split("/")[0] ?? null;
  if (!projectId) {
    return <div className="p-4 text-sm text-zinc-600">Select a workspace to manage scripts</div>;
  }

  if (discovering) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-zinc-500">
        <Loader2 size={14} className="animate-spin" />
        Discovering scripts...
      </div>
    );
  }

  if (discoveryError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8">
        <div className="flex items-center gap-2">
          <AlertCircle size={14} className="shrink-0 text-red-400" />
          <div className="text-sm text-red-300">Failed to discover scripts</div>
        </div>
        <div className="text-xs text-red-400/70">{discoveryError}</div>
        <button
          type="button"
          onClick={() => void discover(projectId)}
          className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-500"
        >
          <Sparkles size={14} />
          Rediscover
        </button>
      </div>
    );
  }

  if (!config || config.services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8">
        <div className="text-sm text-zinc-600">No services defined</div>
        <button
          type="button"
          onClick={() => void discover(projectId)}
          className="flex items-center gap-2 rounded-md bg-zinc-800/50 px-4 py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <Sparkles size={14} />
          Discover Scripts
        </button>
      </div>
    );
  }

  return (
    <div className="p-3">
      <CommandBar />
      <div className="mt-3 grid gap-2">
        {config.services.map((svc) => (
          <ServiceCard key={svc.name} service={svc} statuses={config.statuses} />
        ))}
      </div>
    </div>
  );
}

/** Get the aggregate state of a category across all services */
function getCategoryState(
  category: EssencialKey,
  statuses: ScriptStatus[],
  services: ResolvedServiceDef[],
): "idle" | "starting" | "running" | "partial" | "success" | "failed" {
  const matching = statuses.filter((s) => s.script === category);
  if (matching.length === 0) return "idle";
  if (matching.some((s) => s.health === "starting")) return "starting";

  const activeCount = matching.filter(
    (s) => s.health === "healthy" || s.health === "running",
  ).length;

  if (activeCount > 0) {
    // How many services have this script defined?
    const totalWithScript = services.filter((svc) => svc.essencial[category]).length;
    return activeCount >= totalWithScript ? "running" : "partial";
  }

  if (matching.some((s) => s.health === "failed" || s.health === "unhealthy")) return "failed";
  if (matching.some((s) => s.health === "success")) return "success";
  return "idle";
}

/** Toolbar with all essencial commands + edit + rediscover */
function CommandBar() {
  const config = useScriptsStore((s) => s.config);
  const runAll = useScriptsStore((s) => s.runAll);
  const stopAll = useScriptsStore((s) => s.stopAll);
  const discover = useScriptsStore((s) => s.discover);
  const discovering = useIsDiscovering();
  const workspace = useWorkspace();
  const statuses = config?.statuses ?? [];

  const openScriptsFile = () => {
    if (config?.filePath) {
      void transport.request("files.open", { filePath: config.filePath });
    }
  };

  return (
    <div className="flex items-center gap-1">
      {ESSENCIAL_ORDER.map((key) => (
        <CategoryButton
          key={key}
          category={key}
          state={getCategoryState(key, statuses, config?.services ?? [])}
          onRun={() => workspace && void runAll(workspace, key)}
          onStop={() => workspace && void stopAll(workspace)}
        />
      ))}

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            const projectId = workspace?.split("/")[0];
            if (projectId) void discover(projectId);
          }}
          disabled={discovering}
          aria-label="Rediscover scripts"
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-400 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        >
          {discovering ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        </button>
        <button
          type="button"
          onClick={openScriptsFile}
          aria-label="Edit scripts.yaml"
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-400 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        >
          <FileEdit size={12} />
        </button>
      </div>
    </div>
  );
}

function CategoryButton({
  category,
  state,
  onRun,
  onStop,
}: {
  category: EssencialKey;
  state: "idle" | "starting" | "running" | "partial" | "success" | "failed";
  onRun: () => void;
  onStop: () => void;
}) {
  const Icon = ESSENCIAL_ICONS[category];
  const label = category.charAt(0).toUpperCase() + category.slice(1);
  const isActive = state === "starting" || state === "running";

  const titleMap: Record<typeof state, string> = {
    starting: `Stop ${label}`,
    running: `Stop ${label}`,
    partial: `${label} All (some running)`,
    failed: `${label} All (retry)`,
    success: `${label} All`,
    idle: `${label} All`,
  };

  return (
    <StatusButton state={state} onClick={isActive ? onStop : onRun} title={titleMap[state]}>
      {state === "starting" ? (
        <Loader2 size={10} className="animate-spin" />
      ) : state === "running" ? (
        <Square size={8} />
      ) : (
        <Icon size={12} />
      )}
      {state === "starting"
        ? `Starting ${category}`
        : state === "running"
          ? `Stop ${category}`
          : category}
    </StatusButton>
  );
}

function ServiceCard({
  service,
  statuses,
}: {
  service: ResolvedServiceDef;
  statuses: ScriptStatus[];
}) {
  const [showOthers, setShowOthers] = useState(false);
  const runScript = useScriptsStore((s) => s.runScript);
  const stopScript = useScriptsStore((s) => s.stopScript);
  const workspace = useWorkspace();

  const serviceStatuses = statuses.filter((s) => s.service === service.name);
  const worstHealth = getWorstHealth(serviceStatuses);

  const essencialKeys = ESSENCIAL_ORDER.filter((k) => service.essencial[k]);
  const advancedKeys = Object.keys(service.advanced);

  return (
    <div className="rounded-lg bg-zinc-900/80 px-3 py-2">
      {/* Service header */}
      <div className="mb-1.5 flex items-center gap-2">
        <HealthDot health={worstHealth} />
        <span className="text-xs font-medium text-zinc-300">{service.name}</span>
        {service.resolvedPort > 0 && (
          <code className="text-[11px] text-zinc-600/60">:{service.resolvedPort}</code>
        )}
        {service.isRepo && (
          <span className="rounded bg-zinc-800 px-1 text-xs text-zinc-600">repo</span>
        )}
      </div>

      {/* Essencial scripts */}
      <div className="flex flex-wrap gap-1">
        {essencialKeys.map((key) => {
          const Icon = ESSENCIAL_ICONS[key];
          return (
            <ScriptButton
              key={key}
              service={service.name}
              script={key}
              icon={Icon}
              status={serviceStatuses.find((s) => s.script === key)}
              onRun={() => workspace && void runScript(workspace, service.name, key)}
              onStop={(scriptId) => void stopScript(scriptId)}
            />
          );
        })}
      </div>

      {/* Others (collapsible) */}
      {advancedKeys.length > 0 && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setShowOthers(!showOthers)}
            className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400"
          >
            <ChevronRight
              size={10}
              className={`transition-transform duration-150 ${showOthers ? "rotate-90" : ""}`}
            />
            others ({advancedKeys.length})
          </button>
          {showOthers && (
            <div className="mt-1 flex flex-wrap gap-1 pl-3">
              {advancedKeys.map((key) => (
                <ScriptButton
                  key={key}
                  service={service.name}
                  script={key}
                  status={serviceStatuses.find((s) => s.script === key)}
                  variant="advanced"
                  onRun={() => workspace && void runScript(workspace, service.name, key)}
                  onStop={(scriptId) => void stopScript(scriptId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScriptButton({
  service: _service,
  script,
  icon: Icon,
  status,
  variant = "essencial",
  onRun,
  onStop,
}: {
  service: string;
  script: string;
  icon?: typeof Play;
  status: ScriptStatus | undefined;
  variant?: "essencial" | "advanced";
  onRun: () => void;
  onStop: (scriptId: string) => void;
}) {
  const isStarting = status?.health === "starting";
  const isRunning = status && isScriptActive(status);
  const ButtonIcon = Icon ?? Play;

  const handleStop = () => {
    if (status?.scriptId) onStop(status.scriptId);
  };

  const state = isStarting ? "starting" : isRunning ? "running" : getHealthState(status);

  return (
    <StatusButton
      state={state}
      size="sm"
      onClick={isStarting || isRunning ? handleStop : onRun}
      title={isStarting || isRunning ? `Stop ${script}` : `Run ${script}`}
      className={!isStarting && !isRunning && variant === "advanced" ? "text-zinc-600" : undefined}
    >
      {isStarting ? (
        <Loader2 size={8} className="animate-spin" />
      ) : isRunning ? (
        <Square size={8} />
      ) : (
        <ButtonIcon size={8} />
      )}
      {isStarting ? `Starting ${script}` : isRunning ? `Stop ${script}` : script}
    </StatusButton>
  );
}

function getHealthState(status: ScriptStatus | undefined): "idle" | "success" | "failed" {
  if (!status) return "idle";
  if (status.health === "healthy") return "success";
  if (isScriptUnhealthy(status)) return "failed";
  return "idle";
}

function HealthDot({ health }: { health: string | null }) {
  let color = "text-zinc-700";
  if (health === "healthy") {
    color = statusTextColor.success;
  } else if (health === "starting" || health === "running") {
    color = statusTextColor.warning;
  } else if (health === "failed" || health === "unhealthy") {
    color = statusTextColor.error;
  }

  return (
    <Circle
      size={8}
      className={`fill-current ${color} ${health === "starting" ? "animate-pulse" : ""}`}
    />
  );
}

function getWorstHealth(statuses: ScriptStatus[]): string | null {
  if (statuses.length === 0) return null;
  if (statuses.some(isScriptUnhealthy)) return "unhealthy";
  if (statuses.some((s) => s.health === "starting")) return "starting";
  if (statuses.some((s) => s.health === "healthy" || s.health === "running")) return "healthy";
  return null;
}

// ---------------------------------------------------------------------------
// Output Tab
// ---------------------------------------------------------------------------

function OutputTab() {
  const nextLineIdRef = useRef(0);
  const config = useScriptsStore((s) => s.config);
  const logs = useScriptsStore((s) => s.logs);
  const selectedLog = useScriptsStore((s) => s.selectedLog);
  const selectLog = useScriptsStore((s) => s.selectLog);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Group by script name
  const groups = useMemo(() => {
    const statuses = config?.statuses ?? [];
    const groupMap = new Map<string, ScriptStatus[]>();
    for (const s of statuses) {
      const list = groupMap.get(s.script) ?? [];
      list.push(s);
      groupMap.set(s.script, list);
    }
    return [...groupMap.entries()].map(([label, scripts]) => ({ label, scripts }));
  }, [config?.statuses]);

  // Auto-select first script if none selected
  useEffect(() => {
    const statuses = config?.statuses ?? [];
    if (!selectedLog && statuses.length > 0) {
      const first = statuses[0]!;
      selectLog(first.service, first.script);
    }
  }, [config?.statuses, selectedLog, selectLog]);

  // Current log lines — find the status id to look up logs
  const selectedStatus = useMemo(
    () =>
      selectedLog
        ? (config?.statuses ?? []).find(
            (s) => s.service === selectedLog.service && s.script === selectedLog.script,
          )
        : null,
    [config?.statuses, selectedLog],
  );
  const keyedLinesRef = useRef<{ id: number; text: string }[]>([]);
  const currentLines = useMemo(() => {
    const raw = selectedStatus ? (logs.get(selectedStatus.scriptId) ?? []) : [];
    const prev = keyedLinesRef.current;
    // Reuse existing keyed entries, append new ones with fresh IDs
    const result: { id: number; text: string }[] = raw.map((text, idx) => {
      const existing = prev[idx];
      return existing && existing.text === text ? existing : { id: nextLineIdRef.current++, text };
    });
    keyedLinesRef.current = result;
    return result;
  }, [selectedStatus, logs]);

  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll only when user is already at the bottom
  useEffect(() => {
    const container = logContainerRef.current;
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
    if (isAtBottom) {
      logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [currentLines]);

  if ((config?.statuses ?? []).length === 0 && !selectedLog) {
    return <div className="p-4 text-sm text-zinc-600">No scripts have been run</div>;
  }

  return (
    <div className="flex h-full">
      {/* Script selector grouped by script name */}
      <div className="flex w-44 shrink-0 flex-col overflow-y-auto border-r border-zinc-800 py-1">
        {groups.map((group) => (
          <OutputGroup
            key={group.label}
            group={group}
            selectedLog={selectedLog}
            onSelect={(s) => selectLog(s.service, s.script)}
          />
        ))}
      </div>

      {/* Log output */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs text-zinc-400"
      >
        {currentLines.map(({ id, text }) => (
          <div
            key={id}
            className={`whitespace-pre-wrap leading-5 ${
              text.startsWith("> ") ? "text-zinc-300 font-semibold" : ""
            } ${text.startsWith("[iara]") ? "text-blue-400/70 italic" : ""}`}
          >
            {text}
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}

function OutputScriptEntry({
  status,
  selected,
  onSelect,
}: {
  status: ScriptStatus;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full px-3 py-1 text-left text-xs ${
        selected
          ? "bg-zinc-800 text-zinc-200"
          : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-400"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <Circle
          size={6}
          className={`shrink-0 fill-current ${
            isScriptActive(status)
              ? statusTextColor.success
              : isScriptUnhealthy(status)
                ? statusTextColor.error
                : "text-zinc-600"
          }`}
        />
        <span className="truncate">{status.service}</span>
      </span>
    </button>
  );
}

function OutputGroup({
  group,
  selectedLog,
  onSelect,
}: {
  group: { label: string; scripts: ScriptStatus[] };
  selectedLog: { service: string; script: string } | null;
  onSelect: (s: { service: string; script: string }) => void;
}) {
  const hasActiveOrFailed = group.scripts.some((s) => isScriptActive(s) || isScriptUnhealthy(s));
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-1 px-2 pt-2 pb-0.5 text-xs font-medium text-zinc-600 uppercase tracking-wider hover:text-zinc-400"
      >
        <ChevronRight
          size={10}
          className={`shrink-0 transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`}
        />
        {group.label}
        {hasActiveOrFailed && (
          <Circle
            size={5}
            className={`shrink-0 fill-current ${
              group.scripts.some(isScriptUnhealthy)
                ? statusTextColor.error
                : statusTextColor.success
            }`}
          />
        )}
      </button>
      {!collapsed &&
        group.scripts.map((s) => (
          <OutputScriptEntry
            key={`${s.service}:${s.script}`}
            status={s}
            selected={selectedLog?.service === s.service && selectedLog?.script === s.script}
            onSelect={() => onSelect({ service: s.service, script: s.script })}
          />
        ))}
    </div>
  );
}
