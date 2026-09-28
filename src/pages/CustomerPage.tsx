import { useEffect, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { client } from "../client";

type Customer = Schema["Customer"]["type"];
type Order = Schema["Order"]["type"];

const emptyForm = {
  name: "",
  phone: "",
  address: "",
  note: "",
};

const statusLabel: Record<string, string> = {
  PENDING: "待處理",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

function CustomerPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<Order[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    const sub = client.models.Customer.observeQuery().subscribe({
      next: (data) => {
        const sorted = [...data.items].sort((a, b) =>
          (a.name ?? "").localeCompare(b.name ?? "")
        );
        setCustomers(sorted);
      },
    });
    return () => sub.unsubscribe();
  }, []);

  function resetForm() {
    setForm({ ...emptyForm });
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      alert("請輸入客戶姓名");
      return;
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
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
    setForm({
      name: c.name ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      note: c.note ?? "",
    });
  }

  async function handleDelete(id: string) {
    if (confirm("確定要刪除此客戶嗎？")) {
      await client.models.Customer.delete({ id });
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
    const sorted = [...data].sort((a, b) =>
      (b.orderDate ?? "").localeCompare(a.orderDate ?? "")
    );
    setHistory(sorted);
    setLoadingHistory(false);
  }

  const filtered = customers.filter((c) => {
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
        <h2>{editingId ? "編輯客戶" : "新增客戶"}</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            客戶姓名 *
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="請輸入客戶姓名"
            />
          </label>
          <label>
            電話號碼
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="電話號碼"
            />
          </label>
          <label className="full">
            地址
            <input
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
          </div>
        </form>
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
                <th>地址</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    尚無客戶資料
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.phone || "—"}</td>
                  <td>{c.address || "—"}</td>
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
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {historyCustomer && (
        <div className="modal-overlay" onClick={() => setHistoryCustomer(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
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
              <p className="muted">
                電話：{historyCustomer.phone || "—"} ・ 地址：
                {historyCustomer.address || "—"}
              </p>
              {loadingHistory ? (
                <p className="muted">載入中…</p>
              ) : history.length === 0 ? (
                <p className="muted">此客戶尚無訂單</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>訂單日期</th>
                      <th>狀態</th>
                      <th className="num">總金額</th>
                      <th>備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((o) => (
                      <tr key={o.id}>
                        <td>{o.orderDate || "—"}</td>
                        <td>{statusLabel[o.status ?? "PENDING"] ?? o.status}</td>
                        <td className="num">${(o.totalPrice ?? 0).toFixed(2)}</td>
                        <td>{o.note || "—"}</td>
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
