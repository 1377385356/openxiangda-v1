export function getPageUploadPatterns(targetPage, pages = []) {
  const names = new Set([targetPage].filter(Boolean));
  for (const page of pages) {
    const code = page?.config?.code;
    if (page?.dirName === targetPage || code === targetPage) {
      if (page.dirName) names.add(page.dirName);
      if (code) names.add(code);
    }
  }
  return ["page-runtime/**/*", ...[...names].map((name) => `pages/${name}/**/*`)];
}

export async function buildUploadPatterns({ targetForm, targetPage, discoverPages }) {
  if (targetForm) return ["form-runtime/**/*", `forms/${targetForm}/**/*`];
  if (targetPage) {
    const pages = discoverPages ? await discoverPages() : [];
    return getPageUploadPatterns(targetPage, pages);
  }
  return ["{form-runtime,page-runtime,forms,pages}/**/*"];
}
