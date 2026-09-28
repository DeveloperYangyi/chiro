import { useEffect, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { client } from "../client";

type Product = Schema["Product"]["type"];

const emptyForm = {
  name: "",
  unitPrice: "",
  quantity: "",
  note: "",
};

function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const sub = client.models.Product.observeQuery().subscribe({
      next: (data) => {
        const sorted = [...data.items].sort((a, b) =>
          (a.name ?? "").localeCompare(b.name ?? "")
        );
        setProducts(sorted);
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
      alert("請輸入商品名稱");
      return;
    }
    const payload = {
      name: form.name.trim(),
      unitPrice: parseFloat(form.unitPrice) || 0,
      quantity: parseInt(form.quantity, 10) || 0,
      note: form.note.trim() || null,
    };

    if (editingId) {
      await client.models.Product.update({ id: editingId, ...payload });
    } else {
      await client.models.Product.create(payload);
    }
    resetForm();
  }

  function handleEdit(p: Product) {
    setEditingId(p.id);
    setForm({
      name: p.name ?? "",
      unitPrice: p.unitPrice != null ? String(p.unitPrice) : "",
      quantity: p.quantity != null ? String(p.quantity) : "",
      note: p.note ?? "",
    });
  }

  async function handleDelete(id: string) {
    if (confirm("確定要刪除此商品嗎？")) {
      await client.models.Product.delete({ id });
      if (editingId === id) resetForm();
    }
  }

  async function adjustQuantity(p: Product, delta: number) {
    const next = Math.max(0, (p.quantity ?? 0) + delta);
    await client.models.Product.update({ id: p.id, quantity: next });
  }

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (p.name ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="page">
      <section className="panel">
        <h2>{editingId ? "編輯商品" : "新增商品"}</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            商品名稱 *
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="請輸入商品名稱"
            />
          </label>
          <label>
            單價 *
            <input
              required
              type="number"
              step="0.01"
              min="0"
              value={form.unitPrice}
              onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
              placeholder="0.00"
            />
          </label>
          <label>
            庫存數量 *
            <input
              required
              type="number"
              step="1"
              min="0"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="0"
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
              {editingId ? "更新商品" : "新增商品"}
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
          <h2>庫存清單（{filtered.length}）</h2>
          <input
            className="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋商品名稱"
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>商品名稱</th>
                <th className="num">單價</th>
                <th className="num">庫存</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    尚無商品資料
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className={(p.quantity ?? 0) === 0 ? "out-of-stock" : ""}>
                  <td>{p.name}</td>
                  <td className="num">${(p.unitPrice ?? 0).toFixed(2)}</td>
                  <td className="num">
                    <div className="qty-cell">
                      <button
                        className="qty-btn"
                        onClick={() => adjustQuantity(p, -1)}
                        title="減少"
                      >
                        −
                      </button>
                      <span className="qty-value">{p.quantity ?? 0}</span>
                      <button
                        className="qty-btn"
                        onClick={() => adjustQuantity(p, 1)}
                        title="增加"
                      >
                        +
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-link" onClick={() => handleEdit(p)}>
                        編輯
                      </button>
                      <button
                        className="btn-link danger"
                        onClick={() => handleDelete(p.id)}
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
    </div>
  );
}

export default StockPage;
