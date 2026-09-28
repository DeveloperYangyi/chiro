import { useEffect, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { client } from "../client";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession } from "aws-amplify/auth";

type Product = Schema["Product"]["type"];
type Order = Schema["Order"]["type"];
type OrderItem = Schema["OrderItem"]["type"];
type Payment = Schema["Payment"]["type"];
type Operator = Schema["Operator"]["type"];
type TransferReceiver = Schema["TransferReceiver"]["type"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function OrderItems({ orderId }: { orderId: string }) {
  const [items, setItems] = useState<OrderItem[]>([]);

  useEffect(() => {
    client.models.OrderItem.list({ filter: { orderId: { eq: orderId } } }).then(
      ({ data }) => setItems(data)
    );
  }, [orderId]);

  if (items.length === 0) return <span className="muted">載入中…</span>;

  return (
    <ul className="order-items-list">
      {items.map((it) => (
        <li key={it.id}>
          {it.productName} ×{it.quantity}
        </li>
      ))}
    </ul>
  );
}

function HomePage() {
  const { user } = useAuthenticator();
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    fetchAuthSession().then((session) => {
      const name = (session.tokens?.idToken?.payload?.["preferred_username"] as string) ?? "";
      setDisplayName(name);
    });
  }, [user]);

  const currentUserName = displayName || (user?.signInDetails?.loginId ?? "");

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [transferReceivers, setTransferReceivers] = useState<TransferReceiver[]>([]);

  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER">("CASH");
  const [paymentBy, setPaymentBy] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    const oSub = client.models.Order.observeQuery().subscribe({
      next: (data) => setOrders([...data.items]),
    });
    const pSub = client.models.Product.observeQuery().subscribe({
      next: (data) => setProducts([...data.items]),
    });
    const paySub = client.models.Payment.observeQuery().subscribe({
      next: (data) => setPayments([...data.items]),
    });
    const opSub = client.models.Operator.observeQuery().subscribe({
      next: (data) => setOperators([...data.items].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))),
    });
    const trSub = client.models.TransferReceiver.observeQuery().subscribe({
      next: (data) => setTransferReceivers([...data.items].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))),
    });
    return () => {
      oSub.unsubscribe();
      pSub.unsubscribe();
      paySub.unsubscribe();
      opSub.unsubscribe();
      trSub.unsubscribe();
    };
  }, []);

  const activeOrders = orders.filter((o) => !o.isDeleted);
  const today = todayStr();
  const todayOrders = activeOrders.filter((o) => o.orderDate === today);
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.totalPrice ?? 0), 0);
  const lowStock = products.filter((p) => (p.quantity ?? 0) !== -1 && (p.quantity ?? 0) <= 5);

  const paidOrderIds = new Set(payments.map((p) => p.orderId));
  const unpaidOrders = activeOrders
    .filter((o) => !paidOrderIds.has(o.id))
    .sort((a, b) => (a.orderDate ?? "").localeCompare(b.orderDate ?? ""));
  const unpaidTotal = unpaidOrders.reduce((s, o) => s + (o.totalPrice ?? 0), 0);

  async function savePayment() {
    if (!paymentOrder) return;
    if (!paymentBy.trim()) { alert("請選擇收款人"); return; }
    setSavingPayment(true);
    try {
      await client.models.Payment.create({
        orderId: paymentOrder.id,
        method: paymentMethod,
        amount: paymentOrder.totalPrice ?? 0,
        receivedBy: paymentBy.trim(),
        confirmedBy: currentUserName,
        receivedAt: new Date().toISOString(),
      });
      setPaymentOrder(null);
    } catch (err) {
      alert(err instanceof Error ? `收款失敗：${err.message}` : "收款失敗");
    } finally {
      setSavingPayment(false);
    }
  }

  return (
    <div className="page">
      <section className="panel">
        <h2>📊 今日總覽 — {today}</h2>
        <div className="summary-grid">
          <div className="summary-card">
            <span className="summary-icon">🛒</span>
            <div className="summary-info">
              <span className="summary-value">{todayOrders.length}</span>
              <span className="summary-label">今日訂單</span>
            </div>
          </div>
          <div className="summary-card">
            <span className="summary-icon">💰</span>
            <div className="summary-info">
              <span className="summary-value">${Math.ceil(todayRevenue)}</span>
              <span className="summary-label">今日營收（含未收款）</span>
            </div>
          </div>
          <div className="summary-card warn">
            <span className="summary-icon">⚠️</span>
            <div className="summary-info">
              <span className="summary-value">{lowStock.length}</span>
              <span className="summary-label">低庫存警示</span>
            </div>
          </div>
          <div className={unpaidOrders.length > 0 ? "summary-card warn" : "summary-card"}>
            <span className="summary-icon">💳</span>
            <div className="summary-info">
              <span className="summary-value">{unpaidOrders.length}</span>
              <span className="summary-label">未收款訂單</span>
            </div>
          </div>
        </div>
      </section>

      {todayOrders.length > 0 && (
        <section className="panel">
          <h2>🛒 今日訂單</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>時間</th>
                  <th>客戶</th>
                  <th>電話</th>
                  <th>地址</th>
                  <th>工程師</th>
                  <th>商品明細</th>
                  <th className="num">總金額</th>
                </tr>
              </thead>
              <tbody>
                {todayOrders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderTime || "—"}</td>
                    <td>{o.customerName || "—"}</td>
                    <td>{o.customerPhone || "—"}</td>
                    <td>{o.customerAddress || "—"}</td>
                    <td>{o.operatorName || "—"}</td>
                    <td>
                      <OrderItems orderId={o.id} />
                    </td>
                    <td className="num">${Math.ceil(o.totalPrice ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {unpaidOrders.length > 0 && (
        <section className="panel">
          <h2>💳 未收款訂單（{unpaidOrders.length}）— 合計 ${Math.ceil(unpaidTotal)}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>客戶</th>
                  <th>商品項目</th>
                  <th>工程師</th>
                  <th className="num">總金額</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {unpaidOrders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderDate || "—"}</td>
                    <td>{o.customerName || "—"}</td>
                    <td><OrderItems orderId={o.id} /></td>
                    <td>{o.operatorName || "—"}</td>
                    <td className="num">${Math.ceil(o.totalPrice ?? 0)}</td>
                    <td>
                      <button className="btn-link" onClick={() => { setPaymentOrder(o); setPaymentMethod("CASH"); setPaymentBy(""); }}>收款</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>📦 庫存總覽</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>商品名稱</th>
                <th className="num">庫存數量</th>
              </tr>
            </thead>
            <tbody>
              {products
                .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
                .map((p) => (
                  <tr key={p.id} className={(p.quantity ?? 0) !== -1 && (p.quantity ?? 0) <= 5 ? "out-of-stock" : ""}>
                    <td>{p.name}</td>
                    <td className="num">{(p.quantity ?? 0) === -1 ? "∞" : (p.quantity ?? 0)}</td>
                  </tr>
                ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={2} className="empty">尚無商品</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {paymentOrder && (
        <div className="modal-overlay" onClick={() => setPaymentOrder(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2>收款 — {paymentOrder.customerName}</h2>
              <button className="btn-close" onClick={() => setPaymentOrder(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="muted">訂單金額：${Math.ceil(paymentOrder.totalPrice ?? 0)}</p>
              <div className="form-grid">
                <label>
                  收款方式 *
                  <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value as "CASH" | "TRANSFER"); setPaymentBy(""); }}>
                    <option value="CASH">現金</option>
                    <option value="TRANSFER">匯款</option>
                  </select>
                </label>
                <label>
                  收款人 *
                  <select value={paymentBy} onChange={(e) => setPaymentBy(e.target.value)}>
                    <option value="">請選擇收款人</option>
                    {paymentMethod === "CASH"
                      ? operators.map((op) => (
                          <option key={op.id} value={op.name}>{op.name}</option>
                        ))
                      : transferReceivers.map((r) => (
                          <option key={r.id} value={r.name}>{r.name}</option>
                        ))
                    }
                  </select>
                </label>
              </div>
              <div className="form-actions" style={{ marginTop: 16 }}>
                <button className="btn-primary" onClick={savePayment} disabled={savingPayment}>
                  {savingPayment ? "儲存中…" : "確認收款"}
                </button>
                <button className="btn-secondary" onClick={() => setPaymentOrder(null)}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HomePage;
