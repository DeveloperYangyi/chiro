import { useEffect, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { client } from "../client";

type Product = Schema["Product"]["type"];

interface BundleLine {
  productId: string;
  productName: string;
  stock: number;
  quantity: number;
}

const emptyForm = {
  name: "",
  unitPrice: "",
  quantity: "",
  infinite: false,
  note: "",
};

function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  // Bundle
  const [showBundle, setShowBundle] = useState(false);
  const [bundleName, setBundleName] = useState("");
  const [bundlePrice, setBundlePrice] = useState("");
  const [bundleLines, setBundleLines] = useState<BundleLine[]>([]);
  const [savingBundle, setSavingBundle] = useState(false);

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
    setShowForm(false);
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
      quantity: form.infinite ? -1 : (parseInt(form.quantity, 10) || 0),
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
    setShowForm(true);
    setForm({
      name: p.name ?? "",
      unitPrice: p.unitPrice != null ? String(p.unitPrice) : "",
      quantity: (p.quantity ?? 0) === -1 ? "" : (p.quantity != null ? String(p.quantity) : ""),
      infinite: (p.quantity ?? 0) === -1,
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

  // Bundle functions
  function addToBundle(p: Product) {
    if (bundleLines.some((l) => l.productId === p.id)) return;
    setBundleLines([
      ...bundleLines,
      {
        productId: p.id,
        productName: p.name ?? "",
        stock: p.quantity ?? 0,
        quantity: 1,
      },
    ]);
  }

  function updateBundleLineQty(productId: string, qty: number) {
    setBundleLines((prev) =>
      prev.map((l) =>
        l.productId === productId ? { ...l, quantity: Math.max(1, qty) } : l
      )
    );
  }

  function removeBundleLine(productId: string) {
    setBundleLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function resetBundle() {
    setBundleName("");
    setBundlePrice("");
    setBundleLines([]);
  }

  function maxBundleSets() {
    if (bundleLines.length === 0) return 0;
    const finite = bundleLines.filter((l) => l.stock !== -1);
    if (finite.length === 0) return Infinity;
    return Math.min(...finite.map((l) => Math.floor(l.stock / l.quantity)));
  }

  async function saveBundle() {
    if (!bundleName.trim()) { alert("請輸入組合名稱"); return; }
    if (bundleLines.length === 0) { alert("請至少選擇一項商品"); return; }
    const maxSets = maxBundleSets();
    if (maxSets <= 0) { alert("庫存不足，無法建立組合"); return; }
    const qty = maxSets === Infinity ? -1 : maxSets;

    setSavingBundle(true);
    try {
      await client.models.Product.create({
        name: bundleName.trim(),
        unitPrice: parseFloat(bundlePrice) || 0,
        quantity: qty,
        note: `組合：${bundleLines.map((l) => `${l.productName}×${l.quantity}`).join("、")}`,
        bundleItems: JSON.stringify(bundleLines.map((l) => ({ productId: l.productId, quantity: l.quantity }))),
      });

      resetBundle();
      setShowBundle(false);
    } catch (err) {
      alert(err instanceof Error ? `建立組合失敗：${err.message}` : "建立組合失敗");
    } finally {
      setSavingBundle(false);
    }
  }

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (p.name ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="page">
      <section className="panel">
        <div className="panel-head" style={{ marginBottom: showForm ? 16 : 0 }}>
          <h2>{editingId ? "編輯商品" : "新增商品"}</h2>
          {!editingId && (
            <button className="btn-secondary" onClick={() => setShowForm(!showForm)}>
              {showForm ? "收起" : "展開"}
            </button>
          )}
        </div>
        {showForm && (
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
            庫存數量 {!form.infinite && "*"}
            <input
              required={!form.infinite}
              type="number"
              step="1"
              min="0"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="0"
              disabled={form.infinite}
            />
            <label className="checkbox-label" style={{ marginTop: 4 }}>
              <input type="checkbox" checked={form.infinite} onChange={(e) => setForm({ ...form, infinite: e.target.checked, quantity: e.target.checked ? "" : form.quantity })} />
              無限庫存
            </label>
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
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>庫存清單（{filtered.length}）</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              className="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋商品名稱"
            />
            <button
              className="btn-secondary"
              onClick={() => { setShowBundle(!showBundle); if (!showBundle) resetBundle(); }}
            >
              {showBundle ? "取消組合" : "建立組合"}
            </button>
          </div>
        </div>

        {showBundle && (
          <div className="bundle-panel">
            <div className="form-grid">
              <label>
                組合名稱 *
                <input
                  required
                  value={bundleName}
                  onChange={(e) => setBundleName(e.target.value)}
                  placeholder="例：冷氣+安裝組合"
                />
              </label>
              <label>
                組合單價
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bundlePrice}
                  onChange={(e) => setBundlePrice(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>
            {bundleLines.length > 0 && (
              <>
              <div style={{ margin: "12px 0 0", fontWeight: 600 }}>
                可組數量：<span className="order-total">{maxBundleSets() === Infinity ? "∞" : maxBundleSets()}</span> 組
              </div>
              <table style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>商品</th>
                    <th className="num">庫存</th>
                    <th className="num">每組用量</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bundleLines.map((l) => (
                    <tr key={l.productId} className={l.quantity > l.stock ? "out-of-stock" : ""}>
                      <td>{l.productName}</td>
                      <td className="num">{l.stock}</td>
                      <td className="num">
                        <input
                          className="qty-input"
                          type="number"
                          min="1"
                          value={l.quantity}
                          onChange={(e) => updateBundleLineQty(l.productId, parseInt(e.target.value, 10) || 1)}
                        />
                      </td>
                      <td>
                        <button className="btn-link danger" onClick={() => removeBundleLine(l.productId)}>移除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </>
            )}
            {bundleLines.length === 0 && (
              <p className="muted" style={{ marginTop: 12 }}>點擊下方商品列表中的商品加入組合</p>
            )}
            <div className="form-actions" style={{ marginTop: 12 }}>
              <button className="btn-primary" onClick={saveBundle} disabled={savingBundle}>
                {savingBundle ? "建立中…" : "建立組合"}
              </button>
              <button className="btn-secondary" onClick={() => { resetBundle(); setShowBundle(false); }}>取消</button>
            </div>
          </div>
        )}

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
                <tr
                  key={p.id}
                  className={`${(p.quantity ?? 0) === 0 ? "out-of-stock" : ""} ${showBundle ? "bundle-selectable" : ""}`}
                  onClick={showBundle ? () => addToBundle(p) : undefined}
                  style={showBundle ? { cursor: "pointer" } : undefined}
                >
                  <td>
                    {showBundle && bundleLines.some((l) => l.productId === p.id) && (
                      <span style={{ color: "var(--success)", marginRight: 6 }}>✓</span>
                    )}
                    {p.name}
                  </td>
                  <td className="num">${(p.unitPrice ?? 0).toFixed(2)}</td>
                  <td className="num">
                    {(p.quantity ?? 0) === -1 ? (
                      <span className="qty-value">∞</span>
                    ) : showBundle ? (
                      <span className="qty-value">{p.quantity ?? 0}</span>
                    ) : (
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
                    )}
                  </td>
                  <td>
                    {!showBundle && (
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
                    )}
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
