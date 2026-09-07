import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const resolveProxyTarget = (value?: string) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    return url.origin;
  } catch {
    return "";
  }
};

const toPort = (value?: string) => {
  const port = Number(value || 5174);
  return Number.isFinite(port) && port > 0 ? port : 5174;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const serviceTarget = resolveProxyTarget(
    env.OPENXIANGDA_BASE_URL || env.APP_PLATFORM_URL,
  );
  const servicePrefix = env.APP_SERVICE_PREFIX || "/service";

  return {
    define: {
      "process.env.NODE_ENV": JSON.stringify(
        process.env.NODE_ENV || "development",
      ),
      "process.env.OPENXIANGDA_APP_TYPE": JSON.stringify(
        env.OPENXIANGDA_APP_TYPE || env.APP_TYPE || "",
      ),
      "process.env.APP_TYPE": JSON.stringify(
        env.APP_TYPE || env.OPENXIANGDA_APP_TYPE || "",
      ),
      "process.env.OPENXIANGDA_BASE_URL": JSON.stringify(
        env.OPENXIANGDA_BASE_URL || env.APP_PLATFORM_URL || "",
      ),
      "process.env.APP_PLATFORM_URL": JSON.stringify(
        env.APP_PLATFORM_URL || env.OPENXIANGDA_BASE_URL || "",
      ),
      "process.env.APP_SERVICE_PREFIX": JSON.stringify(servicePrefix),
    },
    plugins: [react()],
    resolve: {
      alias: [
        {
          find: "@",
          replacement: fileURLToPath(new URL("./src", import.meta.url)),
        },
      ],
      dedupe: [
        "react",
        "react-dom",
        "antd",
        "@ant-design/cssinjs",
        "@ant-design/icons",
      ],
    },
    optimizeDeps: {
      include: ["antd", "@ant-design/cssinjs", "@ant-design/icons", "antd-mobile"],
    },
    server: {
      host: env.OPENXIANGDA_DEV_HOST || "127.0.0.1",
      port: toPort(env.OPENXIANGDA_DEV_PORT),
      proxy: serviceTarget
        ? {
            [servicePrefix]: {
              target: serviceTarget,
              changeOrigin: true,
              secure: false,
              cookieDomainRewrite: "",
              cookiePathRewrite: "/",
              headers: {
                "x-openxiangda-dev-proxy": "1",
              },
            },
          }
        : undefined,
    },
  };
});
