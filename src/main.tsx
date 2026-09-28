import React from "react";
import ReactDOM from "react-dom/client";
import { Authenticator } from '@aws-amplify/ui-react';
// 先載入 client.ts，確保在任何頁面模組執行 generateClient() 之前
// 已呼叫 Amplify.configure()。
import "./client";
import App from "./App.tsx";
import ErrorBoundary from "./ErrorBoundary";
import "./index.css";
import '@aws-amplify/ui-react/styles.css';

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Authenticator hideSignUp>
        <App />
      </Authenticator>
    </ErrorBoundary>
  </React.StrictMode>
);
