import { useEffect, useMemo, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { client } from "../client";
import DeliverySheet from "./DeliverySheet";

type Customer = Schema["Customer"]["type"];
type Product = Schema["Product"]["type"];
type Order = Schema["Order"]["type"];
type OrderItem = Schema["OrderItem"]["type"];

interface DraftLine {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  stock: number;
}

const statusLabel: Record<string, string> = {
  PENDING: "待處理",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function OrderPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  // 新訂單草稿
  const [customerId, setCustomerId] = useState("");
  const [orderDate, setOrderDate] = useState(today());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [saving, setSaving] = useState(false);

  // 列印用
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [printItems, setPrintItems] = useState<OrderItem[]>([]);

  useEffect(() => {
    const cSub = client.models.Customer.observeQuery().subscribe({
      next: (data) =>
        setCustomers(
          [...data.items].sort((a, b) =>
            (a.name ?? "").localeCompare(b.name ?? "")
          )
        ),
    });
    const pSub = client.models.Product.observeQuery().subscribe({
      next: (data) =>
        setProducts(
          [...data.items].sort((a, b) =>
            (a.name ?? "").localeCompare(b.name ?? "")
          )
        ),
    });
    const oSub = client.models.Order.observeQuery().subscribe({
      next: (data) =>
        setOrders(
          [...data.items].sort((a, b) =>
            (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
          )
        ),
    });
    return () => {
      cSub.unsubscribe();
      pSub.unsubscribe();
      oSub.unsubscribe();
    };
  }, []);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    [lines]
  );

  function addLine() {
    if (!selectedProductId) return;
    const p = products.find((x) => x.id === selectedProductId);
    if (!p) return;
    if (lines.some((l) => l.productId === p.id)) {
      alert("此商品已在訂單中，請直接調整數量");
      return;
    }
    setLines([
      ...lines,
      {
        productId: p.id,
        productName: p.name ?? "",
        unitPrice: p.unitPrice ?? 0,
        quantity: 1,
        stock: p.quantity ?? 0,
      },
    ]);
    setSelectedProductId("");
  }

  function updateLineQty(productId: string, qty: number) {
    setLines((prev) =>
      prev.map((l) =>
        l.productId === productId ? { ...l, quantity: Math.max(1, qty) } : l
      )
    );
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function resetDraft() {
    setCustomerId("");
    setOrderDate(today());
    setNote("");
    setLines([]);
    setSelectedProductId("");
  }

  async function saveOrder() {
    if (!customerId) {
      alert("請選擇客戶");
      return;
    }
    if (lines.length === 0) {
      alert("請至少加入一項商品");
      return;
    }
    // 檢查庫存
    const shortage = lines.find((l) => l.quantity > l.stock);
    if (shortage) {
      alert(
        `商品「${shortage.productName}」庫存不足（庫存 ${shortage.stock}，需求 ${shortage.quantity}）`
      );
      return;
    }

    setSaving(true);
    try {
      // 以單一自訂 Mutation 於伺服器端原子化地建立訂單、項目並扣減庫存。
      // 若庫存不足或中途失敗，伺服器會回滾，不會留下部分成功的資料。
      const { data, errors } = await client.mutations.placeOrder({
        customerId,
        orderDate,
        note: note.trim() || undefined,
        items: JSON.stringify(
          lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
        ),
      });

      if (errors && errors.length > 0) {
        throw new Error(errors.map((e) => e.message).join("；"));
      }

      resetDraft();
      alert(
        `訂單已建立，庫存已更新（共 ${data?.itemCount ?? lines.length} 項，總金額 $${(
          data?.totalPrice ?? total
        ).toFixed(2)}）`
      );
    } catch (err) {
      console.error(err);
      alert(
        err instanceof Error ? `建立訂單失敗：${err.message}` : "建立訂單時發生錯誤"
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(order: Order, status: Order["status"]) {
    await client.models.Order.update({ id: order.id, status });
  }

  async function deleteOrder(order: Order) {
    if (!confirm("確定要刪除此訂單嗎？（不會回補庫存）")) return;
    const { data: items } = await client.models.OrderItem.list({
      filter: { orderId: { eq: order.id } },
    });
    await Promise.all(
      items.map((it) => client.models.OrderItem.delete({ id: it.id }))
    );
    await client.models.Order.delete({ id: order.id });
  }

  async function openPrint(order: Order) {
    const { data: items } = await client.models.OrderItem.list({
      filter: { orderId: { eq: order.id } },
    });
    setPrintItems(items);
    setPrintOrder(order);
    // 等待送貨單渲染後再開啟列印
    setTimeout(() => window.print(), 200);
  }

  return (
    <div className="page">
      <section className="panel no-print">
        <h2>建立新訂單</h2>
        <div className="form-grid">
          <label>
            客戶 *
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">請選擇客戶</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? `（${c.phone}）` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            訂單日期
            <input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
            />
          </label>
          <label className="full">
            備註
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="備註"
            />
          </label>
        </div>

        <div className="add-item-row">
          <select
            value={selectedProductId}
            onChange={(e) => setSelectedProductId(e.target.value)}
          >
            <option value="">選擇商品加入訂單</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（庫存 {p.quantity ?? 0}）— ${(p.unitPrice ?? 0).toFixed(2)}
              </option>
            ))}
          </select>
          <button className="btn-secondary" onClick={addLine}>
            加入
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>商品名稱</th>
                <th className="num">單價</th>
                <th className="num">數量</th>
                <th className="num">小計</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    尚未加入商品
                  </td>
                </tr>
              )}
              {lines.map((l) => (
                <tr key={l.productId} className={l.quantity > l.stock ? "out-of-stock" : ""}>
                  <td>{l.productName}</td>
                  <td className="num">${l.unitPrice.toFixed(2)}</td>
                  <td className="num">
                    <input
                      className="qty-input"
                      type="number"
                      min="1"
                      value={l.quantity}
                      onChange={(e) =>
                        updateLineQty(l.productId, parseInt(e.target.value, 10) || 1)
                      }
                    />
                    <span className="stock-hint">/ 庫存 {l.stock}</span>
                  </td>
                  <td className="num">${(l.unitPrice * l.quantity).toFixed(2)}</td>
                  <td>
                    <button
                      className="btn-link danger"
                      onClick={() => removeLine(l.productId)}
                    >
                      移除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="order-total-row">
          <span>訂單總金額：</span>
          <span className="order-total">${total.toFixed(2)}</span>
        </div>

        <div className="form-actions">
          <button className="btn-primary" onClick={saveOrder} disabled={saving}>
            {saving ? "儲存中…" : "建立訂單"}
          </button>
          <button className="btn-secondary" onClick={resetDraft}>
            清除
          </button>
        </div>
      </section>

      <section className="panel no-print">
        <h2>訂單清單（{orders.length}）</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>客戶</th>
                <th>電話</th>
                <th className="num">總金額</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    尚無訂單
                  </td>
                </tr>
              )}
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.orderDate || "—"}</td>
                  <td>{o.customerName || "—"}</td>
                  <td>{o.customerPhone || "—"}</td>
                  <td className="num">${(o.totalPrice ?? 0).toFixed(2)}</td>
                  <td>
                    <select
                      className="status-select"
                      value={o.status ?? "PENDING"}
                      onChange={(e) =>
                        updateStatus(o, e.target.value as Order["status"])
                      }
                    >
                      <option value="PENDING">{statusLabel.PENDING}</option>
                      <option value="COMPLETED">{statusLabel.COMPLETED}</option>
                      <option value="CANCELLED">{statusLabel.CANCELLED}</option>
                    </select>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-link" onClick={() => openPrint(o)}>
                        列印送貨單
                      </button>
                      <button
                        className="btn-link danger"
                        onClick={() => deleteOrder(o)}
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

      {/* 列印區域：平時隱藏，僅列印時顯示 */}
      {printOrder && (
        <div className="print-area">
          <div className="print-toolbar no-print">
            <button className="btn-primary" onClick={() => window.print()}>
              列印
            </button>
            <button className="btn-secondary" onClick={() => setPrintOrder(null)}>
              關閉預覽
            </button>
          </div>
          <DeliverySheet order={printOrder} items={printItems} />
        </div>
      )}
    </div>
  );
}

export default OrderPage;
