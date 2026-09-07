const openxiangdaPath = require("node:path");
const openxiangdaPresetModule = require("openxiangda/tailwind-preset");
const openxiangdaPreset =
  openxiangdaPresetModule.default ?? openxiangdaPresetModule;

function resolveOpenXiangdaContent() {
  try {
    const packagePath = require.resolve("openxiangda");
    const distDir = openxiangdaPath.dirname(packagePath);
    return [openxiangdaPath.join(distDir, "..", "**/*.{js,mjs,cjs}")];
  } catch {
    return [];
  }
}

const openxiangdaContent = resolveOpenXiangdaContent();

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    ...openxiangdaContent,
  ],
  blocklist: ["[-:T]", "[-:TZ.]"],
  presets: [openxiangdaPreset],
  theme: {
    extend: {},
  },
  plugins: [],
};
