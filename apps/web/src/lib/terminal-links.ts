// Character classes used across regexes:
//   SEG  = [\w.@\-+]        — single path segment (no slash)
//   PATH = [\w.@\-+/]       — path characters (segments + slash)
//   LB   = (?<![:\w/~])     — lookbehind: not inside a URL or after ~/
//   LA   = (?![/\w@\-+])    — lookahead: not followed by more path (. excluded to drop trailing period)

/** Regex for file:// URLs */
export const FILE_URL_RE = /file:\/\/[^\s"')\]>]+/g;

/** Absolute paths with file extension, optionally followed by :line:col. */
export const ABS_PATH_RE = /(?<![:\w/~.])(\/[\w.@\-+/]+\.\w+(?::\d+(?::\d+)?)?)(?![/\w@\-+])/g;

/** Absolute directory paths (no extension, at least 4 segments like /a/b/c/d). */
export const ABS_DIR_RE = /(?<![:\w/~.])(\/[\w.@\-+]+(?:\/[\w.@\-+]+){3,})/g;

/** Relative paths with explicit prefix (./, ../, ~/) and file extension. */
export const REL_PATH_RE =
  /(?<!\w)((?:\.\.\/|\.\/|~\/)[\w.@\-+/]+\.\w+(?::\d+(?::\d+)?)?)(?![/\w@\-+])/g;

/** Relative directory paths with explicit prefix (./, ../, ~/) and at least 2 segments after prefix. */
export const REL_DIR_RE = /(?<!\w)((?:\.\.\/|\.\/|~\/)[\w.@\-+]+(?:\/[\w.@\-+]+){2,})/g;

/** Bare relative paths (no prefix) with file extension.
 *  First segment must start with a letter and be at least 2 chars (avoids git diff a/b/ prefixes). */
export const BARE_PATH_RE =
  /(?<![:\w/~.\\])((?:[a-zA-Z@][\w.@\-+]+\/)+[\w.@\-+]*\.\w+(?::\d+(?::\d+)?)?)(?![/\w@\-+])/g;

export interface FileLink {
  startIndex: number;
  length: number;
  text: string;
}

/** All path regexes in priority order. file:// URLs are handled separately (first pass). */
const PATH_REGEXES = [ABS_PATH_RE, ABS_DIR_RE, REL_PATH_RE, REL_DIR_RE, BARE_PATH_RE];

/** Find all file links (file:// URLs and absolute/relative paths) in a line of text. */
export function findFileLinks(text: string): FileLink[] {
  const links: FileLink[] = [];
  let match;

  // First pass: file:// URLs (highest priority)
  FILE_URL_RE.lastIndex = 0;
  while ((match = FILE_URL_RE.exec(text)) !== null) {
    links.push({ startIndex: match.index, length: match[0].length, text: match[0] });
  }

  // Second pass: all path regexes with overlap detection
  for (const re of PATH_REGEXES) {
    re.lastIndex = 0;
    while ((match = re.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Skip if this range overlaps with an existing link
      const overlaps = links.some((l) => start < l.startIndex + l.length && end > l.startIndex);
      if (overlaps) continue;

      // Skip if preceded by a URL scheme (e.g., http://example.com/page.html)
      const before = text.slice(0, start);
      if (/\w+:\/\/\S*$/.test(before)) continue;

      links.push({ startIndex: start, length: match[0].length, text: match[0] });
    }
  }

  return links;
}

/** Whether a link text represents a relative path (needs CWD to resolve). */
export function isRelativePath(text: string): boolean {
  return !text.startsWith("/") && !text.startsWith("file://");
}

/** Parse a file path string (possibly with :line:col suffix) into structured params.
 *  If `cwd` is provided, relative paths are resolved against it. */
export function parseFilePath(
  text: string,
  cwd?: string | null,
): { filePath: string; line?: number; col?: number } {
  let cleaned = text.replace(/^file:\/\//, "");

  // ~/ paths are kept as-is — server resolves ~ via $HOME
  if (cwd && !cleaned.startsWith("/") && !cleaned.startsWith("~/")) {
    // Resolve relative path against CWD
    cleaned = `${cwd.replace(/\/$/, "")}/${cleaned}`;
  }

  const parts = cleaned.split(":");
  const result: { filePath: string; line?: number; col?: number } = { filePath: parts[0]! };
  if (parts[1]) result.line = Number(parts[1]);
  if (parts[2]) result.col = Number(parts[2]);
  return result;
}
