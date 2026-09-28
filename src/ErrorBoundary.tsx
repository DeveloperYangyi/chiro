import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * 全域錯誤邊界：避免任何一個頁面的執行期錯誤造成整頁空白，
 * 改為顯示可讀的錯誤訊息與排查提示。
 */
class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("應用程式發生錯誤：", error);
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.message;
      const looksLikeSchema =
        msg.includes("observeQuery") ||
        msg.includes("undefined") ||
        msg.includes("models");
      return (
        <div className="error-screen">
          <h1>⚠️ 系統發生錯誤</h1>
          <p className="error-msg">{msg}</p>
          {looksLikeSchema && (
            <div className="error-hint">
              <p>
                這通常表示後端資料模型尚未部署，或 <code>amplify_outputs.json</code>{" "}
                與目前的資料結構不一致。
              </p>
              <p>請於終端機執行以下指令部署後端沙盒（Sandbox）：</p>
              <pre>npx ampx sandbox</pre>
              <p>部署完成後重新整理此頁面即可。</p>
            </div>
          )}
          <button className="btn-primary" onClick={() => location.reload()}>
            重新整理
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
