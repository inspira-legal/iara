export const Channels = {
  // App
  GET_APP_INFO: "desktop:get-app-info",

  // Projects
  LIST_PROJECTS: "desktop:list-projects",
  GET_PROJECT: "desktop:get-project",
  CREATE_PROJECT: "desktop:create-project",
  DELETE_PROJECT: "desktop:delete-project",

  // Tasks
  LIST_TASKS: "desktop:list-tasks",
  GET_TASK: "desktop:get-task",
  CREATE_TASK: "desktop:create-task",
  COMPLETE_TASK: "desktop:complete-task",
  DELETE_TASK: "desktop:delete-task",

  // Git
  GET_GIT_STATUS: "desktop:get-git-status",

  // Launcher
  LAUNCH_CLAUDE: "desktop:launch-claude",

  // Sessions
  LIST_SESSIONS: "desktop:list-sessions",

  // Prompts
  READ_PROMPT: "desktop:read-prompt",
  WRITE_PROMPT: "desktop:write-prompt",

  // Dev Servers
  DEV_START: "desktop:dev-start",
  DEV_STOP: "desktop:dev-stop",
  DEV_STATUS: "desktop:dev-status",
  DEV_LOGS: "desktop:dev-logs",
  DEV_DISCOVER: "desktop:dev-discover",

  // Browser Panel
  BROWSER_NAVIGATE: "desktop:browser-navigate",
  BROWSER_SHOW: "desktop:browser-show",
  BROWSER_HIDE: "desktop:browser-hide",
  BROWSER_TOGGLE: "desktop:browser-toggle",
  BROWSER_SCREENSHOT: "desktop:browser-screenshot",
  BROWSER_GET_TREE: "desktop:browser-get-tree",
  BROWSER_CLICK: "desktop:browser-click",
  BROWSER_FILL: "desktop:browser-fill",

  // Dialogs
  PICK_FOLDER: "desktop:pick-folder",
} as const;
