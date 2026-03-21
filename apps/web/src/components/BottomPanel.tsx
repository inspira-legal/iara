import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import type { EssencialKey, ResolvedServiceDef, ScriptStatus } from "@iara/contracts";
import { isScriptActive, isScriptUnhealthy } from "~/lib/script-status";
import { useScriptsStore } from "~/stores/scripts";
import { useProjectStore } from "~/stores/projects";
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

export function BottomPanel() {
  const {
    config,
    loading,
    discovering,
    activeTab,
    setActiveTab,
    collapsed,
    setCollapsed,
    panelHeight,
    setPanelHeight,
    subscribePush,
    loadConfig,
    discover,
  } = useScriptsStore();
  const { selectedProjectId } = useProjectStore();
  const workspace = useWorkspace();
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Subscribe to push events (global, always active)
  useEffect(() => {
    const unsub = subscribePush();
    return unsub;
  }, [subscribePush]);

  // Load config when project/workspace changes
  useEffect(() => {
    if (selectedProjectId) {
      void loadConfig(selectedProjectId, workspace);
    }
  }, [selectedProjectId, workspace, loadConfig]);

  // Reload config when scripts.yaml changes on disk
  useEffect(() => {
    const unsub = transport.subscribe("scripts:reload", ({ projectId }) => {
      if (selectedProjectId && projectId === selectedProjectId) {
        void loadConfig(selectedProjectId, workspace);
      }
    });
    return unsub;
  }, [selectedProjectId, workspace, loadConfig]);

  // Auto-discover when project has no scripts.yaml (once per project)
  const discoveredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      config &&
      !config.hasFile &&
      !discovering &&
      selectedProjectId &&
      discoveredForRef.current !== selectedProjectId
    ) {
      discoveredForRef.current = selectedProjectId;
      void discover(selectedProjectId);
    }
  }, [config, discovering, selectedProjectId, discover]);

  const statuses = config?.statuses ?? [];
  const runningCount = statuses.filter(isScriptActive).length;
  const hasOutputs = statuses.length > 0;

  // Fall back to scripts tab if output tab has nothing
  useEffect(() => {
    if (activeTab === "output" && !hasOutputs) {
      setActiveTab("scripts");
    }
  }, [activeTab, hasOutputs, setActiveTab]);

  // Auto-open output tab when any script fails
  const hasUnhealthy = statuses.some(isScriptUnhealthy);
  useEffect(() => {
    if (hasUnhealthy) {
      setActiveTab("output");
      setCollapsed(false);
    }
  }, [hasUnhealthy, setActiveTab, setCollapsed]);

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      startYRef.current = e.clientY;
      startHeightRef.current = panelHeight;
    },
    [panelHeight],
  );

  useEffect(() => {
    if (!isResizing) return;

    const onMouseMove = (e: MouseEvent) => {
      const delta = startYRef.current - e.clientY;
      setPanelHeight(startHeightRef.current + delta);
    };

    const onMouseUp = () => setIsResizing(false);

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing]);

  return (
    <div className="flex flex-col border-t border-zinc-800">
      {/* Resize handle */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="horizontal"
          onMouseDown={onResizeStart}
          className={`h-0.5 cursor-row-resize transition-colors hover:bg-blue-500/50 ${isResizing ? "bg-blue-500/50" : ""}`}
        />
      )}

      {/* Tab bar */}
      <div className="flex h-8 items-center justify-between bg-zinc-900 px-2">
        <div className="flex items-center gap-1">
          <TabButton
            label="Scripts"
            active={activeTab === "scripts"}
            onClick={() => {
              setActiveTab("scripts");
              if (collapsed) setCollapsed(false);
            }}
            badge={runningCount || undefined}
          />
          {hasOutputs && (
            <TabButton
              label="Output"
              active={activeTab === "output"}
              onClick={() => {
                setActiveTab("output");
                if (collapsed) setCollapsed(false);
              }}
            />
          )}
          {(loading || discovering) && (
            <Loader2 size={10} className="ml-1 animate-spin text-zinc-500" />
          )}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="rounded p-0.5 text-zinc-500 hover:text-zinc-300"
        >
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Panel content */}
      {!collapsed && (
        <div className="overflow-y-auto bg-zinc-950" style={{ height: panelHeight }}>
          {activeTab === "scripts" && <ScriptsTab />}
          {activeTab === "output" && <OutputTab />}
        </div>
      )}

      {/* Block pointer events while resizing */}
      {isResizing && <div className="fixed inset-0 z-50 cursor-row-resize" />}
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
        <span className="rounded-full bg-green-600/20 px-1.5 text-xs text-green-400">{badge}</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Scripts Tab
// ---------------------------------------------------------------------------

function ScriptsTab() {
  const { config, discovering, discover } = useScriptsStore();
  const { selectedProjectId } = useProjectStore();
  const workspace = useWorkspace();

  if (!selectedProjectId) {
    return <div className="p-4 text-sm text-zinc-600">Select a project to manage scripts</div>;
  }

  if (discovering) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-zinc-500">
        <Loader2 size={14} className="animate-spin" />
        Discovering scripts...
      </div>
    );
  }

  if (!config || config.services.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-8">
        <div className="text-sm text-zinc-600">No services defined</div>
        <button
          type="button"
          onClick={() => void discover(selectedProjectId)}
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
  const { selectedProjectId } = useProjectStore();
  const { config, runAll, stopAll, discover, discovering } = useScriptsStore();
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
          onRun={() => selectedProjectId && void runAll(selectedProjectId, workspace, key)}
          onStop={() => void stopAll()}
        />
      ))}

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => selectedProjectId && void discover(selectedProjectId)}
          disabled={discovering}
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-400 disabled:opacity-50"
          title="Rediscover scripts"
        >
          {discovering ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        </button>
        <button
          type="button"
          onClick={openScriptsFile}
          className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-400"
          title="Edit scripts.yaml"
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

  if (state === "starting") {
    return (
      <button
        type="button"
        onClick={onStop}
        className="flex items-center gap-1.5 rounded border border-yellow-600/30 bg-yellow-900/10 px-2.5 py-1.5 text-xs text-yellow-400 transition-colors hover:bg-yellow-900/20"
        title={`Stop ${label}`}
      >
        <Loader2 size={10} className="animate-spin" />
        Starting {category}
      </button>
    );
  }

  if (state === "running") {
    return (
      <button
        type="button"
        onClick={onStop}
        className="flex items-center gap-1.5 rounded border border-green-600/30 bg-green-900/10 px-2.5 py-1.5 text-xs text-green-400 transition-colors hover:bg-red-900/10 hover:border-red-600/30 hover:text-red-400"
        title={`Stop ${label}`}
      >
        <Square size={8} />
        Stop {category}
      </button>
    );
  }

  if (state === "partial") {
    return (
      <button
        type="button"
        onClick={onRun}
        className="flex items-center gap-1.5 rounded border border-yellow-600/30 bg-yellow-900/10 px-2.5 py-1.5 text-xs text-yellow-400 transition-colors hover:bg-zinc-800 hover:text-zinc-300 hover:border-zinc-700/50"
        title={`${label} All (some running)`}
      >
        <Icon size={12} />
        {category}
      </button>
    );
  }

  if (state === "success") {
    return (
      <button
        type="button"
        onClick={onRun}
        className="flex items-center gap-1.5 rounded border border-green-600/30 px-2.5 py-1.5 text-xs text-green-400 transition-colors hover:bg-zinc-800 hover:text-zinc-300 hover:border-zinc-700/50"
        title={`${label} All`}
      >
        <Icon size={12} />
        {category}
      </button>
    );
  }

  if (state === "failed") {
    return (
      <button
        type="button"
        onClick={onRun}
        className="flex items-center gap-1.5 rounded border border-red-600/30 px-2.5 py-1.5 text-xs text-red-400 transition-colors hover:bg-zinc-800 hover:text-zinc-300 hover:border-zinc-700/50"
        title={`${label} All (retry)`}
      >
        <Icon size={12} />
        {category}
      </button>
    );
  }

  // idle
  return (
    <button
      type="button"
      onClick={onRun}
      className="flex items-center gap-1.5 rounded border border-transparent px-2.5 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
      title={`${label} All`}
    >
      <Icon size={12} />
      {category}
    </button>
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
  const { selectedProjectId } = useProjectStore();
  const { runScript, stopScript } = useScriptsStore();
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
          <code className="text-xs text-zinc-600">:{service.resolvedPort}</code>
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
              onRun={() =>
                selectedProjectId && void runScript(selectedProjectId, workspace, service.name, key)
              }
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
                  onRun={() =>
                    selectedProjectId &&
                    void runScript(selectedProjectId, workspace, service.name, key)
                  }
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
  service,
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
  const healthColor = getHealthBorderColor(status);
  const textColor = variant === "advanced" ? "text-zinc-600" : "text-zinc-400";
  const ButtonIcon = Icon ?? Play;

  const handleStop = () => {
    if (status?.scriptId) onStop(status.scriptId);
  };

  if (isStarting) {
    return (
      <button
        type="button"
        onClick={handleStop}
        className="flex items-center gap-1 rounded border border-yellow-600/30 bg-yellow-900/10 px-2 py-0.5 text-xs text-yellow-400 hover:bg-yellow-900/20"
        title={`Stop ${script}`}
      >
        <Loader2 size={8} className="animate-spin" />
        Starting {script}
      </button>
    );
  }

  if (isRunning) {
    return (
      <button
        type="button"
        onClick={handleStop}
        className="flex items-center gap-1 rounded border border-green-600/30 bg-green-900/10 px-2 py-0.5 text-xs text-green-400 hover:bg-red-900/10 hover:border-red-600/30 hover:text-red-400"
        title={`Stop ${script}`}
      >
        <Square size={8} />
        Stop {script}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onRun}
      className={`flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${healthColor} ${textColor} hover:bg-zinc-800 hover:text-zinc-300`}
      title={`Run ${script}`}
    >
      <ButtonIcon size={8} />
      {script}
    </button>
  );
}

function getHealthBorderColor(status: ScriptStatus | undefined): string {
  if (!status) return "border-zinc-700/50";
  if (status.health === "healthy") return "border-green-600/40";
  if (isScriptActive(status)) return "border-yellow-600/40";
  if (isScriptUnhealthy(status)) return "border-red-600/40";
  return "border-zinc-700/50";
}

function HealthDot({ health }: { health: string | null }) {
  let color = "text-zinc-700";
  if (health === "healthy") {
    color = "text-green-500";
  } else if (health === "starting" || health === "running") {
    color = "text-yellow-500";
  } else if (health === "failed" || health === "unhealthy") {
    color = "text-red-500";
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
  const { config, logs, selectedLog, selectLog } = useScriptsStore();
  const logsEndRef = useRef<HTMLDivElement>(null);

  const allScripts = config?.statuses ?? [];

  // Group by script name
  const groups = useMemo(() => {
    const groupMap = new Map<string, ScriptStatus[]>();
    for (const s of allScripts) {
      const list = groupMap.get(s.script) ?? [];
      list.push(s);
      groupMap.set(s.script, list);
    }
    return [...groupMap.entries()].map(([label, scripts]) => ({ label, scripts }));
  }, [allScripts]);

  // Auto-select first script if none selected
  useEffect(() => {
    if (!selectedLog && allScripts.length > 0) {
      const first = allScripts[0]!;
      selectLog(first.service, first.script);
    }
  }, [allScripts, selectedLog, selectLog]);

  // Current log lines — find the status id to look up logs
  const selectedStatus = selectedLog
    ? allScripts.find((s) => s.service === selectedLog.service && s.script === selectedLog.script)
    : null;
  const currentLines = selectedStatus ? (logs.get(selectedStatus.scriptId) ?? []) : [];

  // Auto-scroll
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentLines]);

  if (allScripts.length === 0 && !selectedLog) {
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
      <div className="flex-1 overflow-y-auto p-2 font-mono text-xs text-zinc-400">
        {currentLines.map((line, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap leading-5 ${
              line.startsWith("> ") ? "text-zinc-300 font-semibold" : ""
            } ${line.startsWith("[iara]") ? "text-blue-400/70 italic" : ""}`}
          >
            {line}
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
              ? "text-green-500"
              : isScriptUnhealthy(status)
                ? "text-red-500"
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
              group.scripts.some(isScriptUnhealthy) ? "text-red-500" : "text-green-500"
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
