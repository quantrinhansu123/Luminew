import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import AntdThemeContext from "@/contexts/AntdThemeContext";
import "./index.css";
import { ErrorBoundary } from "react-error-boundary";
import { message, Result } from "antd/lib";
import "@ant-design/v5-patch-for-react-19";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

message.config({
  top: 100,
  duration: 2,
  maxCount: 3,
  rtl: true,
  prefixCls: "my-message",
});

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary
      fallback={
        <Result
          status="500"
          title="500"
          subTitle="Có gì đó sai sai. Vui lòng thử lại sau."
        />
      }
    >
      <BrowserRouter>
        <AntdThemeContext>
          <AuthProvider>
            <App />
          </AuthProvider>
        </AntdThemeContext>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
