import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import "antd/dist/reset.css";
import App from "./app/App";
import { theme } from "./theme";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ConfigProvider theme={theme} locale={zhCN} button={{ autoInsertSpace: false }}>
      <AntApp message={{ top: 88, maxCount: 3, duration: 4 }}>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
