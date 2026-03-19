/** Regex for file:// URLs */
export const FILE_URL_RE = /file:\/\/[^\s"')\]>]+/g;

/** Regex for absolute paths with file extension, optionally followed by :line:col.
 *  Negative lookbehind: not preceded by word char, colon, or slash (avoids matching inside URLs). */
export const ABS_PATH_RE = /(?<![:\w/])(\/[\w.@\-/]+\.\w+(?::\d+(?::\d+)?)?)/g;

export interface FileLink {
  startIndex: number;
  length: number;
  text: string;
}

/** Find all file links (file:// URLs and absolute paths) in a line of text. */
export function findFileLinks(text: string): FileLink[] {
  const links: FileLink[] = [];
  let match;

  // First pass: file:// URLs (higher priority)
  FILE_URL_RE.lastIndex = 0;
  while ((match = FILE_URL_RE.exec(text)) !== null) {
    links.push({ startIndex: match.index, length: match[0].length, text: match[0] });
  }

  // Second pass: absolute paths — skip if overlapping with a file:// match or inside a URL scheme
  ABS_PATH_RE.lastIndex = 0;
  while ((match = ABS_PATH_RE.exec(text)) !== null) {
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

  return links;
}

/** Parse a file path string (possibly with :line:col suffix) into structured params. */
export function parseFilePath(text: string): { filePath: string; line?: number; col?: number } {
  const cleaned = text.replace(/^file:\/\//, "");
  const parts = cleaned.split(":");
  const result: { filePath: string; line?: number; col?: number } = { filePath: parts[0]! };
  if (parts[1]) result.line = Number(parts[1]);
  if (parts[2]) result.col = Number(parts[2]);
  return result;
}
