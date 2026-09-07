import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StyleProvider } from "@ant-design/cssinjs";
import { App as AntdApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import "antd-mobile/es/global";
import { antdTheme } from "openxiangda/antd-theme";

import App from "./dev/App";
import "./index.css";

dayjs.locale("zh-cn");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StyleProvider hashPriority="high">
      <ConfigProvider
        locale={zhCN}
        theme={antdTheme}
      >
        <AntdApp>
          <App />
        </AntdApp>
      </ConfigProvider>
    </StyleProvider>
  </StrictMode>,
);
