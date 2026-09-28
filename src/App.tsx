import { useEffect, useState } from "react";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession } from "aws-amplify/auth";
import HomePage from "./pages/HomePage";
import StockPage from "./pages/StockPage";
import CustomerPage from "./pages/CustomerPage";
import OrderPage from "./pages/OrderPage";
import UserPage from "./pages/UserPage";
import logo from "./assets/chirologo.png";

type Tab = "home" | "stock" | "customers" | "orders" | "users";

function App() {
  const { signOut, user } = useAuthenticator();
  const [tab, setTab] = useState<Tab>("home");
  const [isAdmin, setIsAdmin] = useState(false);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    fetchAuthSession().then((session) => {
      const payload = session.tokens?.accessToken?.payload;
      const groups = (payload?.["cognito:groups"] as string[]) ?? [];
      setIsAdmin(groups.includes("ADMINS"));
    });
    // Get preferred_username from ID token
    fetchAuthSession().then((session) => {
      const claims = session.tokens?.idToken?.payload;
      const name = (claims?.["preferred_username"] as string) ?? "";
      setDisplayName(name);
    });
  }, [user]);

  return (
    <div className="app">
      <header className="app-header no-print">
        <div className="brand">
          <span className="brand-logo"><img src={logo} alt="開羅" width={36} height={36} style={{ borderRadius: 6 }} /></span>
          <h1>開羅客服管理系統</h1>
        </div>
        <nav className="tabs">
          <button
            className={tab === "home" ? "tab active" : "tab"}
            onClick={() => setTab("home")}
          >
            首頁
          </button>
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
          {isAdmin && (
            <button
              className={tab === "users" ? "tab active" : "tab"}
              onClick={() => setTab("users")}
            >
              人員管理
            </button>
          )}
        </nav>
        <div className="user-area">
          <span className="user-name">{displayName || (user?.signInDetails?.loginId ?? "使用者")}</span>
          {isAdmin && <span className="admin-badge">管理員</span>}
          <button className="btn-secondary" onClick={signOut}>
            登出
          </button>
        </div>
      </header>

      <main className="app-main">
        {tab === "home" && <HomePage />}
        {tab === "stock" && <StockPage />}
        {tab === "customers" && <CustomerPage />}
        {tab === "orders" && <OrderPage />}
        {tab === "users" && isAdmin && <UserPage />}
      </main>
    </div>
  );
}

export default App;
