import { useEffect, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { client } from "../client";

type Product = Schema["Product"]["type"];
type Order = Schema["Order"]["type"];
type OrderItem = Schema["OrderItem"]["type"];
type Payment = Schema["Payment"]["type"];

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
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

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
    return () => {
      oSub.unsubscribe();
      pSub.unsubscribe();
      paySub.unsubscribe();
    };
  }, []);

  const activeOrders = orders.filter((o) => !o.isDeleted);
  const today = todayStr();
  const todayOrders = activeOrders.filter((o) => o.orderDate === today);
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.totalPrice ?? 0), 0);
  const lowStock = products.filter((p) => (p.quantity ?? 0) <= 5);

  const paidOrderIds = new Set(payments.map((p) => p.orderId));
  const unpaidOrders = activeOrders
    .filter((o) => !paidOrderIds.has(o.id))
    .sort((a, b) => (a.orderDate ?? "").localeCompare(b.orderDate ?? ""));
  const unpaidTotal = unpaidOrders.reduce((s, o) => s + (o.totalPrice ?? 0), 0);

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
              <span className="summary-value">${todayRevenue.toFixed(2)}</span>
              <span className="summary-label">今日營收</span>
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
                  <th>客戶</th>
                  <th>電話</th>
                  <th>地址</th>
                  <th>商品明細</th>
                  <th className="num">總金額</th>
                </tr>
              </thead>
              <tbody>
                {todayOrders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.customerName || "—"}</td>
                    <td>{o.customerPhone || "—"}</td>
                    <td>{o.customerAddress || "—"}</td>
                    <td>
                      <OrderItems orderId={o.id} />
                    </td>
                    <td className="num">${(o.totalPrice ?? 0).toFixed(2)}</td>
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
                  <th>電話</th>
                  <th>工程師</th>
                  <th className="num">總金額</th>
                </tr>
              </thead>
              <tbody>
                {unpaidOrders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderDate || "—"}</td>
                    <td>{o.customerName || "—"}</td>
                    <td>{o.customerPhone || "—"}</td>
                    <td>{o.operatorName || "—"}</td>
                    <td className="num">${(o.totalPrice ?? 0).toFixed(2)}</td>
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
                  <tr key={p.id} className={(p.quantity ?? 0) <= 5 ? "out-of-stock" : ""}>
                    <td>{p.name}</td>
                    <td className="num">{p.quantity ?? 0}</td>
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
    </div>
  );
}

export default HomePage;
