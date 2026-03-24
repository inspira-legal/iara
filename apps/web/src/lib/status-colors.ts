/**
 * Shared semantic status color tokens.
 *
 * Use these maps instead of hard-coding `text-green-400`, `text-red-400`, etc.
 * across components. Each map provides Tailwind classes for a specific use-case
 * (text color, border color, background tint).
 */

export type StatusVariant = "success" | "error" | "warning" | "info";

/** Text color for status indicators (icons, badges, inline text). */
export const statusTextColor: Record<StatusVariant, string> = {
  success: "text-green-400",
  error: "text-red-400",
  warning: "text-yellow-400",
  info: "text-blue-400",
} as const;

/** Border + background tint for status containers (alerts, banners). */
export const statusSurfaceStyle: Record<Exclude<StatusVariant, "success">, string> = {
  error: "border-red-700/50 bg-red-900/20",
  warning: "border-yellow-700/50 bg-yellow-900/20",
  info: "border-blue-700/50 bg-blue-900/20",
} as const;

/** Border color for status-colored outlines (buttons, cards). */
export const statusBorderColor: Record<StatusVariant | "idle", string> = {
  success: "border-green-600/30",
  error: "border-red-600/30",
  warning: "border-yellow-600/30",
  info: "border-blue-600/30",
  idle: "border-transparent",
} as const;

/** Background tint for status-colored surfaces (buttons on hover, pills). */
export const statusBgTint: Record<StatusVariant, string> = {
  success: "bg-green-900/10",
  error: "bg-red-900/10",
  warning: "bg-yellow-900/10",
  info: "bg-blue-900/10",
} as const;
