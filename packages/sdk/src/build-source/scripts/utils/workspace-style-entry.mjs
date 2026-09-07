import fs from "node:fs";
import path from "node:path";

export const WORKSPACE_STYLE_ENTRY_CANDIDATES = [
  "src/index.css",
  "src/styles/index.css",
];

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

export function listWorkspaceStyleEntryPaths(rootDir) {
  return WORKSPACE_STYLE_ENTRY_CANDIDATES.map((candidate) =>
    path.join(rootDir, candidate),
  );
}

export function resolveWorkspaceStyleEntry(rootDir) {
  const candidates = listWorkspaceStyleEntryPaths(rootDir);
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

export function createWorkspaceStyleImport(rootDir, fromDir) {
  const stylePath = resolveWorkspaceStyleEntry(rootDir);
  let relativePath = toPosix(path.relative(fromDir, stylePath));
  if (!relativePath.startsWith(".")) relativePath = `./${relativePath}`;
  return relativePath;
}
