import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import "antd/dist/reset.css";
import App from "./app/App";
import { DEFAULT_THEME, themeFor, type ThemeName } from "./theme";
import "./styles.css";

/**
 * 主题状态放在这里，因为 antd 的 ConfigProvider 必须包在 AntApp 外面，
 * 而设置项是从 App 里读出来的 —— 由 App 把选中的主题回报给这里。
 */
function Root() {
  const [themeName, setThemeName] = useState<ThemeName>(DEFAULT_THEME);
  return (
    <React.StrictMode>
      <ConfigProvider theme={themeFor(themeName)} locale={zhCN} button={{ autoInsertSpace: false }}>
        <AntApp message={{ top: 88, maxCount: 3, duration: 4 }}>
          <App onThemeChange={setThemeName} />
        </AntApp>
      </ConfigProvider>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<Root />);
