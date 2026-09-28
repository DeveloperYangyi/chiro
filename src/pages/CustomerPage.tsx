import { useEffect, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { client } from "../client";

type Customer = Schema["Customer"]["type"];
type Order = Schema["Order"]["type"];
type OrderItem = Schema["OrderItem"]["type"];
type Payment = Schema["Payment"]["type"];

const emptyForm = {
  name: "",
  phone: "",
  phone2: "",
  address: "",
  note: "",
};

function CustomerPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<Order[]>([]);
  const [historyPayments, setHistoryPayments] = useState<Payment[]>([]);
  const [historyItemsMap, setHistoryItemsMap] = useState<Record<string, OrderItem[]>>({});
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const sub = client.models.Customer.observeQuery().subscribe({
      next: (data) => {
        const sorted = [...data.items].sort((a, b) =>
          (a.name ?? "").localeCompare(b.name ?? "")
        );
        setCustomers(sorted);
      },
    });
    const oSub = client.models.Order.observeQuery().subscribe({
      next: (data) => setOrders([...data.items].filter((o) => !o.isDeleted)),
    });
    const oiSub = client.models.OrderItem.observeQuery().subscribe({
      next: (data) => setOrderItems([...data.items]),
    });
    return () => { sub.unsubscribe(); oSub.unsubscribe(); oiSub.unsubscribe(); };
  }, []);

  function resetForm() {
    setForm({ ...emptyForm });
    setEditingId(null);
    setShowForm(false);
  }

  function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        alert("檔案無資料列");
        return;
      }
      const header = parseCsvLine(lines[0]).map((h) => h.replace(/^\uFEFF/, "").trim());
      const nameIdx = header.findIndex((h) => /姓名|name/i.test(h));
      const phoneIdx = header.findIndex((h) => /^電話$|^phone$/i.test(h));
      const phone2Idx = header.findIndex((h) => /電話2|phone2/i.test(h));
      const addressIdx = header.findIndex((h) => /地址|address/i.test(h));
      const noteIdx = header.findIndex((h) => /備註|note/i.test(h));

      if (nameIdx === -1) {
        alert("找不到「姓名」欄位，請確認 CSV 標題列包含：姓名, 電話, 地址, 備註");
        return;
      }

      let created = 0;
      let skipped = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const name = cols[nameIdx]?.trim();
        if (!name) { skipped++; continue; }
        await client.models.Customer.create({
          name,
          phone: phoneIdx >= 0 ? cols[phoneIdx]?.trim() || null : null,
          phone2: phone2Idx >= 0 ? cols[phone2Idx]?.trim() || null : null,
          address: addressIdx >= 0 ? cols[addressIdx]?.trim() || null : null,
          note: noteIdx >= 0 ? cols[noteIdx]?.trim() || null : null,
        });
        created++;
      }
      alert(`匯入完成：新增 ${created} 筆，跳過 ${skipped} 筆`);
    } catch (err) {
      alert(err instanceof Error ? `匯入失敗：${err.message}` : "匯入失敗");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      alert("請輸入客戶姓名");
      return;
    }
    if (!form.phone.trim()) {
      alert("請輸入電話號碼");
      return;
    }
    if (!form.address.trim()) {
      alert("請輸入地址");
      return;
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      phone2: form.phone2.trim() || null,
      address: form.address.trim() || null,
      note: form.note.trim() || null,
    };
    if (editingId) {
      await client.models.Customer.update({ id: editingId, ...payload });
    } else {
      await client.models.Customer.create(payload);
    }
    resetForm();
  }

  function handleEdit(c: Customer) {
    setEditingId(c.id);
    setShowForm(true);
    setForm({
      name: c.name ?? "",
      phone: c.phone ?? "",
      phone2: c.phone2 ?? "",
      address: c.address ?? "",
      note: c.note ?? "",
    });
  }

  async function handleDelete(id: string) {
    if (confirm("確定要停用此客戶嗎？")) {
      await client.models.Customer.update({ id, isActive: false });
      if (editingId === id) resetForm();
      if (historyCustomer?.id === id) setHistoryCustomer(null);
    }
  }

  async function openHistory(c: Customer) {
    setHistoryCustomer(c);
    setLoadingHistory(true);
    const { data } = await client.models.Order.list({
      filter: { customerId: { eq: c.id } },
    });
    const sorted = [...data].filter((o) => !o.isDeleted).sort((a, b) =>
      (b.orderDate ?? "").localeCompare(a.orderDate ?? "")
    );
    setHistory(sorted);
    // Fetch payments for these orders
    const orderIds = sorted.map((o) => o.id);
    const payResults = await Promise.all(
      orderIds.map((id) =>
        client.models.Payment.list({ filter: { orderId: { eq: id } } })
      )
    );
    setHistoryPayments(payResults.flatMap((r) => r.data));
    const itemResults = await Promise.all(
      sorted.map((o) =>
        client.models.OrderItem.list({ filter: { orderId: { eq: o.id } } })
      )
    );
    const itemsMap: Record<string, OrderItem[]> = {};
    sorted.forEach((o, i) => { itemsMap[o.id] = itemResults[i].data; });
    setHistoryItemsMap(itemsMap);
    setLoadingHistory(false);
  }

  function isOrderPaid(orderId: string) {
    return historyPayments.some((p) => p.orderId === orderId);
  }

  function getLastOrder(customerId: string) {
    const custOrders = orders
      .filter((o) => o.customerId === customerId)
      .sort((a, b) => `${b.orderDate ?? ""}${b.orderTime ?? ""}`.localeCompare(`${a.orderDate ?? ""}${a.orderTime ?? ""}`));
    if (custOrders.length === 0) return null;
    const last = custOrders[0];
    const items = orderItems.filter((i) => i.orderId === last.id);
    return { order: last, items };
  }

  const filtered = customers.filter((c) => {
    if (c.isActive === false) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.name ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q) ||
      (c.address ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-head" style={{ marginBottom: showForm ? 16 : 0 }}>
          <h2>{editingId ? "編輯客戶" : "新增客戶"}</h2>
          {!editingId && (
            <button className="btn-secondary" onClick={() => setShowForm(!showForm)}>
              {showForm ? "收起" : "展開"}
            </button>
          )}
        </div>
        {showForm && (
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            客戶姓名 *
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="請輸入客戶姓名"
            />
          </label>
          <label>
            電話號碼 *
            <input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="電話號碼"
            />
          </label>
          <label>
            電話號碼2
            <input
              value={form.phone2}
              onChange={(e) => setForm({ ...form, phone2: e.target.value })}
              placeholder="選填"
            />
          </label>
          <label className="full">
            地址 *
            <input
              required
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="送貨地址"
            />
          </label>
          <label className="full">
            備註
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="備註"
            />
          </label>
          <div className="form-actions full">
            <button type="submit" className="btn-primary">
              {editingId ? "更新客戶" : "新增客戶"}
            </button>
            {editingId && (
              <button type="button" className="btn-secondary" onClick={resetForm}>
                取消
              </button>
            )}
            {!editingId && (
              <>
                <label className="btn-secondary" style={{ cursor: "pointer", textAlign: "center" }}>
                  {importing ? "匯入中…" : "匯入 CSV"}
                  <input
                    type="file"
                    accept=".csv"
                    style={{ display: "none" }}
                    onChange={handleCsvImport}
                    disabled={importing}
                  />
                </label>
                <a
                  className="btn-secondary"
                  href="data:text/csv;charset=utf-8,%EF%BB%BF姓名,電話,電話2,地址,備註\n"
                  download="客戶範本.csv"
                  style={{ textAlign: "center", textDecoration: "none" }}
                >
                  下載範本
                </a>
              </>
            )}
          </div>
        </form>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>客戶清單（{filtered.length}）</h2>
          <input
            className="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋姓名、電話或地址"
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th>電話</th>
                <th>電話2</th>
                <th>地址</th>
                <th>最近訂單</th>
                <th>備註</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="empty">
                    尚無客戶資料
                  </td>
                </tr>
              )}
              {filtered.map((c) => {
                const last = getLastOrder(c.id);
                return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone || "—"}</td>
                  <td>{c.phone2 || "—"}</td>
                  <td>{c.address || "—"}</td>
                  <td>
                    {last ? (
                      <>
                        <div>{last.order.orderDate} {last.order.orderTime || ""}</div>
                        <div className="muted" style={{ fontSize: "0.78rem" }}>
                          {last.items.map((i) => `${i.productName}×${i.quantity}`).join("、")}
                        </div>
                      </>
                    ) : "—"}
                  </td>
                  <td>{c.note || "—"}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-link" onClick={() => openHistory(c)}>
                        訂單歷史
                      </button>
                      <button className="btn-link" onClick={() => handleEdit(c)}>
                        編輯
                      </button>
                      <button
                        className="btn-link danger"
                        onClick={() => handleDelete(c.id)}
                      >
                        停用
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {historyCustomer && (
        <div className="modal-overlay" onClick={() => setHistoryCustomer(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="modal-head">
              <h2>{historyCustomer.name} 的訂單歷史</h2>
              <button
                className="btn-close"
                onClick={() => setHistoryCustomer(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {loadingHistory ? (
                <p className="muted">載入中…</p>
              ) : history.length === 0 ? (
                <p className="muted">此客戶尚無訂單</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>訂單日期</th>
                      <th>商品明細</th>
                      <th>工程師</th>
                      <th>狀態</th>
                      <th className="num">總金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((o) => (
                      <tr key={o.id}>
                        <td>{o.orderDate || "—"} {o.orderTime || ""}</td>
                        <td>
                          {(historyItemsMap[o.id] ?? []).map((i) => `${i.productName}×${i.quantity}`).join("、") || "—"}
                        </td>
                        <td>{o.operatorName || "—"}</td>
                        <td>
                          {isOrderPaid(o.id) ? (
                            <span className="payment-badge">已收款</span>
                          ) : (
                            <span style={{ color: "var(--danger)" }}>未收款</span>
                          )}
                        </td>
                        <td className="num">${Math.ceil(o.totalPrice ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerPage;
