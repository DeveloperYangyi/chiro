import { useEffect, useMemo, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { client } from "../client";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession } from "aws-amplify/auth";

type Order = Schema["Order"]["type"];
type Payment = Schema["Payment"]["type"];
type OrderItem = Schema["OrderItem"]["type"];
type Operator = Schema["Operator"]["type"];
type TransferReceiver = Schema["TransferReceiver"]["type"];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getQuarter(dateStr: string) {
  const m = parseInt(dateStr.slice(5, 7), 10);
  return Math.ceil(m / 3);
}

function FinancePage() {
  const { user } = useAuthenticator();
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    fetchAuthSession().then((session) => {
      const name = (session.tokens?.idToken?.payload?.["preferred_username"] as string) ?? "";
      setDisplayName(name);
    });
  }, [user]);

  const currentUserName = displayName || (user?.signInDetails?.loginId ?? "");

  const [subTab, setSubTab] = useState<"revenue" | "profit" | "cost">("revenue");
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [transferReceivers, setTransferReceivers] = useState<TransferReceiver[]>([]);
  const [filterMonth, setFilterMonth] = useState(todayStr().slice(0, 7));
  const [costFilterOp, setCostFilterOp] = useState("");

  // 收款
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER">("CASH");
  const [paymentBy, setPaymentBy] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  useEffect(() => {
    const oSub = client.models.Order.observeQuery().subscribe({
      next: (data) => setOrders([...data.items].filter((o) => !o.isDeleted)),
    });
    const pSub = client.models.Payment.observeQuery().subscribe({
      next: (data) => setPayments([...data.items]),
    });
    const oiSub = client.models.OrderItem.observeQuery().subscribe({
      next: (data) => setOrderItems([...data.items]),
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
      oiSub.unsubscribe();
      opSub.unsubscribe();
      trSub.unsubscribe();
    };
  }, []);

  const paidSet = useMemo(() => new Set(payments.map((p) => p.orderId)), [payments]);

  const today = todayStr();
  const currentYear = today.slice(0, 4);
  const currentQuarter = getQuarter(today);

  const monthOrders = useMemo(
    () =>
      orders
        .filter((o) => (o.orderDate ?? "").startsWith(filterMonth))
        .sort((a, b) => {
          const cmp = (b.orderDate ?? "").localeCompare(a.orderDate ?? "");
          if (cmp !== 0) return cmp;
          return (b.orderTime ?? "").localeCompare(a.orderTime ?? "");
        }),
    [orders, filterMonth]
  );

  // Revenue stats
  const stats = useMemo(() => {
    const todayOrders = orders.filter((o) => o.orderDate === today);
    const monthAll = orders.filter((o) => (o.orderDate ?? "").startsWith(filterMonth));
    const quarterOrders = orders.filter((o) => {
      const y = (o.orderDate ?? "").slice(0, 4);
      return y === currentYear && getQuarter(o.orderDate ?? "") === currentQuarter;
    });
    const yearOrders = orders.filter((o) => (o.orderDate ?? "").startsWith(currentYear));

    const sum = (list: Order[]) => list.reduce((s, o) => s + (o.totalPrice ?? 0), 0);
    const costSum = (list: Order[]) => list.reduce((s, o) => s + (o.cost ?? 0), 0);
    const paidSum = (list: Order[]) =>
      list.filter((o) => paidSet.has(o.id)).reduce((s, o) => s + (o.totalPrice ?? 0), 0);
    const unpaidSum = (list: Order[]) =>
      list.filter((o) => !paidSet.has(o.id)).reduce((s, o) => s + (o.totalPrice ?? 0), 0);

    return {
      today: { total: sum(todayOrders), paid: paidSum(todayOrders), unpaid: unpaidSum(todayOrders), cost: costSum(todayOrders), count: todayOrders.length },
      month: { total: sum(monthAll), paid: paidSum(monthAll), unpaid: unpaidSum(monthAll), cost: costSum(monthAll), count: monthAll.length },
      quarter: { total: sum(quarterOrders), paid: paidSum(quarterOrders), unpaid: unpaidSum(quarterOrders), cost: costSum(quarterOrders), count: quarterOrders.length },
      year: { total: sum(yearOrders), paid: paidSum(yearOrders), unpaid: unpaidSum(yearOrders), cost: costSum(yearOrders), count: yearOrders.length },
    };
  }, [orders, paidSet, today, filterMonth, currentYear, currentQuarter]);

  function getItemsText(orderId: string) {
    return orderItems
      .filter((i) => i.orderId === orderId)
      .map((i) => `${i.productName}×${i.quantity}`)
      .join("、") || "—";
  }

  function getPayment(orderId: string) {
    return payments.find((p) => p.orderId === orderId);
  }

  const [editingCosts, setEditingCosts] = useState<Record<string, string>>({});
  const [savingCostId, setSavingCostId] = useState<string | null>(null);

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

  async function saveCost(orderId: string) {
    const value = editingCosts[orderId];
    if (value === undefined) return;
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    setSavingCostId(orderId);
    try {
      await client.models.Order.update({ id: orderId, cost: num });
      setEditingCosts((prev) => { const next = { ...prev }; delete next[orderId]; return next; });
    } catch (err) {
      alert(err instanceof Error ? `儲存失敗：${err.message}` : "儲存失敗");
    } finally {
      setSavingCostId(null);
    }
  }

  return (
    <div className="page">
      <div className="fin-layout">
        <nav className="fin-sidenav">
          <button
            className={subTab === "revenue" ? "fin-nav-item active" : "fin-nav-item"}
            onClick={() => setSubTab("revenue")}
          >
            💰 營收
          </button>
          <button
            className={subTab === "profit" ? "fin-nav-item active" : "fin-nav-item"}
            onClick={() => setSubTab("profit")}
          >
            📈 淨利
          </button>
          <button
            className={subTab === "cost" ? "fin-nav-item active" : "fin-nav-item"}
            onClick={() => setSubTab("cost")}
          >
            📊 成本
          </button>
        </nav>

        <div className="fin-content">
          {subTab === "revenue" && (
            <>
              <section className="panel">
                <h2>📊 營收總覽</h2>
                <div className="fin-summary-grid">
                  <div className="fin-card">
                    <div className="fin-card-title">今日（{today}）</div>
                    <div className="fin-card-total">${Math.ceil(stats.today.total)}</div>
                    <div className="fin-card-detail">
                      <span className="fin-paid">已收 ${Math.ceil(stats.today.paid)}</span>
                      <span className="fin-unpaid">未收 ${Math.ceil(stats.today.unpaid)}</span>
                    </div>
                    <div className="fin-card-count">{stats.today.count} 筆訂單</div>
                  </div>
                  <div className="fin-card">
                    <div className="fin-card-title">本月（{filterMonth}）</div>
                    <div className="fin-card-total">${Math.ceil(stats.month.total)}</div>
                    <div className="fin-card-detail">
                      <span className="fin-paid">已收 ${Math.ceil(stats.month.paid)}</span>
                      <span className="fin-unpaid">未收 ${Math.ceil(stats.month.unpaid)}</span>
                    </div>
                    <div className="fin-card-count">{stats.month.count} 筆訂單</div>
                  </div>
                  <div className="fin-card">
                    <div className="fin-card-title">本季（Q{currentQuarter}）</div>
                    <div className="fin-card-total">${Math.ceil(stats.quarter.total)}</div>
                    <div className="fin-card-detail">
                      <span className="fin-paid">已收 ${Math.ceil(stats.quarter.paid)}</span>
                      <span className="fin-unpaid">未收 ${Math.ceil(stats.quarter.unpaid)}</span>
                    </div>
                    <div className="fin-card-count">{stats.quarter.count} 筆訂單</div>
                  </div>
                  <div className="fin-card">
                    <div className="fin-card-title">本年（{currentYear}）</div>
                    <div className="fin-card-total">${Math.ceil(stats.year.total)}</div>
                    <div className="fin-card-detail">
                      <span className="fin-paid">已收 ${Math.ceil(stats.year.paid)}</span>
                      <span className="fin-unpaid">未收 ${Math.ceil(stats.year.unpaid)}</span>
                    </div>
                    <div className="fin-card-count">{stats.year.count} 筆訂單</div>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h2>📋 訂單明細（{monthOrders.length}）</h2>
                  <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
                </div>
                {(() => {
                  const days = [...new Set(monthOrders.map((o) => o.orderDate ?? ""))].sort((a, b) => b.localeCompare(a));
                  return days.map((day) => {
                    const dayOrders = monthOrders.filter((o) => o.orderDate === day);
                    const dayTotal = dayOrders.reduce((s, o) => s + (o.totalPrice ?? 0), 0);
                    const dayPaid = dayOrders.filter((o) => paidSet.has(o.id)).reduce((s, o) => s + (o.totalPrice ?? 0), 0);
                    const dayUnpaid = dayTotal - dayPaid;
                    return (
                      <div key={day} style={{ marginBottom: 16 }}>
                        <div className="fin-day-header">
                          <span>{day}</span>
                          <span className="fin-day-stats">
                            {dayOrders.length} 筆 ・ 合計 ${Math.ceil(dayTotal)}
                            <span className="fin-paid"> ・ 已收 ${Math.ceil(dayPaid)}</span>
                            {dayUnpaid > 0 && <span className="fin-unpaid"> ・ 未收 ${Math.ceil(dayUnpaid)}</span>}
                          </span>
                        </div>
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>時間</th>
                                <th>客戶</th>
                                <th>項目</th>
                                <th>工程師</th>
                                <th className="num">營收</th>
                                <th>收款狀態</th>
                                <th>收款方式</th>
                                <th>收款人</th>
                                <th>操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dayOrders.map((o) => {
                                const pay = getPayment(o.id);
                                return (
                                  <tr key={o.id}>
                                    <td>{o.orderTime || "—"}</td>
                                    <td>{o.customerName || "—"}</td>
                                    <td className="muted" style={{ fontSize: "0.82rem" }}>{getItemsText(o.id)}</td>
                                    <td>{o.operatorName || "—"}</td>
                                    <td className="num">${Math.ceil(o.totalPrice ?? 0)}</td>
                                    <td>
                                      {pay ? (
                                        <span className="payment-badge">已收款</span>
                                      ) : (
                                        <span style={{ color: "var(--danger)" }}>未收款</span>
                                      )}
                                    </td>
                                    <td>{pay ? (pay.method === "CASH" ? "現金" : "匯款") : "—"}</td>
                                    <td>{pay?.receivedBy || "—"}</td>
                                    <td>
                                      {!pay && <button className="btn-link" onClick={() => { setPaymentOrder(o); setPaymentMethod("CASH"); setPaymentBy(""); }}>收款</button>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  });
                })()}
                {monthOrders.length === 0 && (
                  <p className="muted" style={{ textAlign: "center", padding: 24 }}>此月份尚無訂單</p>
                )}
              </section>
            </>
          )}

          {subTab === "profit" && (
            <>
              <section className="panel">
                <h2>📈 淨利總覽</h2>
                <div className="fin-summary-grid">
                  <div className="fin-card">
                    <div className="fin-card-title">今日（{today}）</div>
                    <div className="fin-card-total">
                      ${Math.ceil(stats.today.total - stats.today.cost)}
                    </div>
                    <div className="fin-card-detail">
                      <span className="fin-paid">已收 ${Math.ceil(stats.today.paid)}</span>
                      <span className="fin-unpaid">未收 ${Math.ceil(stats.today.unpaid)}</span>
                    </div>
                    <div className="fin-card-count">{stats.today.count} 筆訂單 | 成本 ${Math.ceil(stats.today.cost)}</div>
                  </div>
                  <div className="fin-card">
                    <div className="fin-card-title">本月（{filterMonth}）</div>
                    <div className="fin-card-total">
                      ${Math.ceil(stats.month.total - stats.month.cost)}
                    </div>
                    <div className="fin-card-detail">
                      <span className="fin-paid">已收 ${Math.ceil(stats.month.paid)}</span>
                      <span className="fin-unpaid">未收 ${Math.ceil(stats.month.unpaid)}</span>
                    </div>
                    <div className="fin-card-count">{stats.month.count} 筆訂單 | 成本 ${Math.ceil(stats.month.cost)}</div>
                  </div>
                  <div className="fin-card">
                    <div className="fin-card-title">本季（Q{currentQuarter}）</div>
                    <div className="fin-card-total">
                      ${Math.ceil(stats.quarter.total - stats.quarter.cost)}
                    </div>
                    <div className="fin-card-detail">
                      <span className="fin-paid">已收 ${Math.ceil(stats.quarter.paid)}</span>
                      <span className="fin-unpaid">未收 ${Math.ceil(stats.quarter.unpaid)}</span>
                    </div>
                    <div className="fin-card-count">{stats.quarter.count} 筆訂單 | 成本 ${Math.ceil(stats.quarter.cost)}</div>
                  </div>
                  <div className="fin-card">
                    <div className="fin-card-title">本年（{currentYear}）</div>
                    <div className="fin-card-total">
                      ${Math.ceil(stats.year.total - stats.year.cost)}
                    </div>
                    <div className="fin-card-detail">
                      <span className="fin-paid">已收 ${Math.ceil(stats.year.paid)}</span>
                      <span className="fin-unpaid">未收 ${Math.ceil(stats.year.unpaid)}</span>
                    </div>
                    <div className="fin-card-count">{stats.year.count} 筆訂單 | 成本 ${Math.ceil(stats.year.cost)}</div>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h2>📋 訂單成本明細（{monthOrders.length}）</h2>
                  <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
                </div>
                {(() => {
                  const days = [...new Set(monthOrders.map((o) => o.orderDate ?? ""))].sort((a, b) => b.localeCompare(a));
                  return days.map((day) => {
                    const dayOrders = monthOrders.filter((o) => o.orderDate === day);
                    const dayRevenue = dayOrders.reduce((s, o) => s + (o.totalPrice ?? 0), 0);
                    const dayCost = dayOrders.reduce((s, o) => s + (o.cost ?? 0), 0);
                    const dayProfit = dayRevenue - dayCost;
                    return (
                      <div key={day} style={{ marginBottom: 16 }}>
                        <div className="fin-day-header">
                          <span>{day}</span>
                          <span className="fin-day-stats">
                            {dayOrders.length} 筆 ・ 營收 ${Math.ceil(dayRevenue)}
                            <span style={{ color: "var(--danger)" }}> ・ 成本 ${Math.ceil(dayCost)}</span>
                            <span style={{ color: dayProfit >= 0 ? "var(--success)" : "var(--danger)" }}> ・ 淨利 ${Math.ceil(dayProfit)}</span>
                          </span>
                        </div>
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>時間</th>
                                <th>客戶</th>
                                <th>項目</th>
                                <th>工程師</th>
                                <th className="num">營收</th>
                                <th>收款狀態</th>
                                <th>收款方式</th>
                                <th>收款人</th>
                                <th>操作</th>
                                <th className="num">成本</th>
                                <th className="num">淨利</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dayOrders.map((o) => {
                                const pay = getPayment(o.id);
                                const profit = (o.totalPrice ?? 0) - (o.cost ?? 0);
                                return (
                                  <tr key={o.id}>
                                    <td>{o.orderTime || "—"}</td>
                                    <td>{o.customerName || "—"}</td>
                                    <td className="muted" style={{ fontSize: "0.82rem" }}>{getItemsText(o.id)}</td>
                                    <td>{o.operatorName || "—"}</td>
                                    <td className="num">${Math.ceil(o.totalPrice ?? 0)}</td>
                                    <td>
                                      {pay ? (
                                        <span className="payment-badge">已收款</span>
                                      ) : (
                                        <span style={{ color: "var(--danger)" }}>未收款</span>
                                      )}
                                    </td>
                                    <td>{pay ? (pay.method === "CASH" ? "現金" : "匯款") : "—"}</td>
                                    <td>{pay?.receivedBy || "—"}</td>
                                    <td>
                                      {!pay && <button className="btn-link" onClick={() => { setPaymentOrder(o); setPaymentMethod("CASH"); setPaymentBy(""); }}>收款</button>}
                                    </td>
                                    <td className="num">
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                                        <input
                                          className="subtotal-input"
                                          type="number"
                                          min="0"
                                          step="1"
                                          value={editingCosts[o.id] ?? (o.cost ?? 0)}
                                          onChange={(e) => setEditingCosts((prev) => ({ ...prev, [o.id]: e.target.value }))}
                                        />
                                        {editingCosts[o.id] !== undefined && (
                                          <button
                                            className="btn-primary"
                                            style={{ padding: "4px 10px", fontSize: "0.78rem" }}
                                            onClick={() => saveCost(o.id)}
                                            disabled={savingCostId === o.id}
                                          >
                                            {savingCostId === o.id ? "…" : "儲存"}
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                    <td className="num" style={{ color: profit >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                                      ${Math.ceil(profit)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  });
                })()}
                {monthOrders.length === 0 && (
                  <p className="muted" style={{ textAlign: "center", padding: 24 }}>此月份尚無訂單</p>
                )}
              </section>
            </>
          )}

          {subTab === "cost" && (
            <>
              <section className="panel">
                <div className="panel-head">
                  <h2>📊 工程師成本分析</h2>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select value={costFilterOp} onChange={(e) => setCostFilterOp(e.target.value)}>
                      <option value="">全部工程師</option>
                      {operators.map((op) => (
                        <option key={op.id} value={op.name}>{op.name}</option>
                      ))}
                    </select>
                    <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
                  </div>
                </div>

                {/* Per-engineer summary cards */}
                {(() => {
                  const opNames = costFilterOp
                    ? [costFilterOp]
                    : [...new Set(monthOrders.map((o) => o.operatorName ?? ""))].filter(Boolean).sort();
                  return (
                    <div className="fin-summary-grid" style={{ marginBottom: 20 }}>
                      {opNames.map((name) => {
                        const opOrders = monthOrders.filter((o) => o.operatorName === name);
                        const cost = opOrders.reduce((s, o) => s + (o.cost ?? 0), 0);
                        return (
                          <div key={name} className="fin-card">
                            <div className="fin-card-title">{name}</div>
                            <div className="fin-card-total">成本 ${Math.ceil(cost)}</div>
                            <div className="fin-card-count">{opOrders.length} 筆訂單</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>

              <section className="panel">
                <h2>📋 訂單明細</h2>
                {(() => {
                  const filtered = costFilterOp
                    ? monthOrders.filter((o) => o.operatorName === costFilterOp)
                    : monthOrders;
                  const days = [...new Set(filtered.map((o) => o.orderDate ?? ""))].sort((a, b) => b.localeCompare(a));
                  return days.map((day) => {
                    const dayOrders = filtered.filter((o) => o.orderDate === day);
                    const dayRevenue = dayOrders.reduce((s, o) => s + (o.totalPrice ?? 0), 0);
                    const dayCost = dayOrders.reduce((s, o) => s + (o.cost ?? 0), 0);
                    const dayProfit = dayRevenue - dayCost;
                    return (
                      <div key={day} style={{ marginBottom: 16 }}>
                        <div className="fin-day-header">
                          <span>{day}</span>
                          <span className="fin-day-stats">
                            {dayOrders.length} 筆 ・ 營收 ${Math.ceil(dayRevenue)}
                            <span style={{ color: "var(--danger)" }}> ・ 成本 ${Math.ceil(dayCost)}</span>
                            <span style={{ color: dayProfit >= 0 ? "var(--success)" : "var(--danger)" }}> ・ 淨利 ${Math.ceil(dayProfit)}</span>
                          </span>
                        </div>
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>時間</th>
                                <th>客戶</th>
                                <th>項目</th>
                                <th>工程師</th>
                                <th className="num">營收</th>
                                <th className="num">成本</th>
                                <th className="num">淨利</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dayOrders.map((o) => {
                                const profit = (o.totalPrice ?? 0) - (o.cost ?? 0);
                                return (
                                  <tr key={o.id}>
                                    <td>{o.orderTime || "—"}</td>
                                    <td>{o.customerName || "—"}</td>
                                    <td className="muted" style={{ fontSize: "0.82rem" }}>{getItemsText(o.id)}</td>
                                    <td>{o.operatorName || "—"}</td>
                                    <td className="num">${Math.ceil(o.totalPrice ?? 0)}</td>
                                    <td className="num">${Math.ceil(o.cost ?? 0)}</td>
                                    <td className="num" style={{ color: profit >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
                                      ${Math.ceil(profit)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  });
                })()}
                {(() => {
                  const filtered = costFilterOp
                    ? monthOrders.filter((o) => o.operatorName === costFilterOp)
                    : monthOrders;
                  return filtered.length === 0 ? (
                    <p className="muted" style={{ textAlign: "center", padding: 24 }}>此月份尚無訂單</p>
                  ) : null;
                })()}
              </section>
            </>
          )}
        </div>
      </div>

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

export default FinancePage;
