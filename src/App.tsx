import { useState } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import StockPage from "./pages/StockPage";
import CustomerPage from "./pages/CustomerPage";
import OrderPage from "./pages/OrderPage";

type Tab = "stock" | "customers" | "orders";

function App() {
  const { signOut, user } = useAuthenticator();
  const [tab, setTab] = useState<Tab>("stock");

  return (
    <div className="app">
      <header className="app-header no-print">
        <div className="brand">
          <span className="brand-logo">📦</span>
          <h1>倉庫管理系統</h1>
        </div>
        <nav className="tabs">
          <button
            className={tab === "stock" ? "tab active" : "tab"}
            onClick={() => setTab("stock")}
          >
            庫存管理
          </button>
          <button
            className={tab === "customers" ? "tab active" : "tab"}
            onClick={() => setTab("customers")}
          >
            客戶資料
          </button>
          <button
            className={tab === "orders" ? "tab active" : "tab"}
            onClick={() => setTab("orders")}
          >
            訂單與送貨單
          </button>
        </nav>
        <div className="user-area">
          <span className="user-name">{user?.signInDetails?.loginId ?? "使用者"}</span>
          <button className="btn-secondary" onClick={signOut}>
            登出
          </button>
        </div>
      </header>

      <main className="app-main">
        {tab === "stock" && <StockPage />}
        {tab === "customers" && <CustomerPage />}
        {tab === "orders" && <OrderPage />}
      </main>
    </div>
  );
}

export default App;
