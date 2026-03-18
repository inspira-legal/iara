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

  // Dialogs
  PICK_FOLDER: "desktop:pick-folder",
} as const;
