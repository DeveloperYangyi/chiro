import { useCallback, useEffect, useMemo, useState } from "react";
import type { Schema } from "../../amplify/data/resource";
import { client } from "../client";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { fetchAuthSession } from "aws-amplify/auth";
import DeliverySheet from "./DeliverySheet";

type Customer = Schema["Customer"]["type"];
type Product = Schema["Product"]["type"];
type Order = Schema["Order"]["type"];
type OrderItem = Schema["OrderItem"]["type"];
type Operator = Schema["Operator"]["type"];
type Payment = Schema["Payment"]["type"];
type TransferReceiver = Schema["TransferReceiver"]["type"];

interface DraftLine {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  stock: number;
  subtotalOverride: number | null;
  subtotalRaw: string;
}

function now() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function nowTime() {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  const rh = Math.max(7, Math.min(20, h));
  const rm = m < 8 ? "00" : m < 23 ? "15" : m < 38 ? "30" : m < 53 ? "45" : "00";
  const fh = rm === "00" && m >= 53 ? Math.min(20, rh + 1) : rh;
  return `${String(fh).padStart(2, "0")}:${rm}`;
}

const TIME_SLOTS: string[] = [];
for (let h = 7; h <= 20; h++) {
  for (const m of ["00", "15", "30", "45"]) {
    TIME_SLOTS.push(`${String(h).padStart(2, "0")}:${m}`);
  }
}

function OrderPage() {
  const { user } = useAuthenticator();
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    fetchAuthSession().then((session) => {
      const name = (session.tokens?.idToken?.payload?.["preferred_username"] as string) ?? "";
      setDisplayName(name);
    });
  }, [user]);

  const currentUserName = displayName || (user?.signInDetails?.loginId ?? "");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [transferReceivers, setTransferReceivers] = useState<TransferReceiver[]>([]);
  const [allOrderItems, setAllOrderItems] = useState<OrderItem[]>([]);

  // 新訂單草稿
  const [customerId, setCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [operatorId, setOperatorId] = useState("");
  const [orderDate, setOrderDate] = useState(now());
  const [orderTime, setOrderTime] = useState(nowTime());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [saving, setSaving] = useState(false);
  const [includeTax, setIncludeTax] = useState(false);
  const [showOrderForm, setShowOrderForm] = useState(false);

  // 編輯
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [editItems, setEditItems] = useState<OrderItem[]>([]);
  const [editOriginalItems, setEditOriginalItems] = useState<OrderItem[]>([]);
  const [editNewItems, setEditNewItems] = useState<DraftLine[]>([]);
  const [editRemovedIds, setEditRemovedIds] = useState<string[]>([]);
  const [editSelectedProductId, setEditSelectedProductId] = useState("");
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editCustomerPhone, setEditCustomerPhone] = useState("");
  const [editCustomerAddress, setEditCustomerAddress] = useState("");
  const [editOperatorName, setEditOperatorName] = useState("");
  const [editOrderDate, setEditOrderDate] = useState("");
  const [editOrderTime, setEditOrderTime] = useState("07:00");
  const [editIncludeTax, setEditIncludeTax] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // 列印用
  const [printOrder, setPrintOrder] = useState<Order | null>(null);
  const [printItems, setPrintItems] = useState<OrderItem[]>([]);
  const [printScale, setPrintScale] = useState(1);

  const calcPrintScale = useCallback(() => {
    const pw = 9.5 * 96; // paper width in px
    const ph = 5.5 * 96; // paper height in px
    const toolbar = 60;   // toolbar + gaps
    const pad = 48;       // padding around
    const maxW = window.innerWidth - pad;
    const maxH = window.innerHeight - toolbar - pad;
    setPrintScale(Math.min(1, maxW / pw, maxH / ph));
  }, []);

  useEffect(() => {
    if (!printOrder) return;
    calcPrintScale();
    window.addEventListener("resize", calcPrintScale);
    return () => window.removeEventListener("resize", calcPrintScale);
  }, [printOrder, calcPrintScale]);

  // 收款
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER">("CASH");
  const [paymentBy, setPaymentBy] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [filterMonth, setFilterMonth] = useState(now().slice(0, 7));

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
    const opSub = client.models.Operator.observeQuery().subscribe({
      next: (data) =>
        setOperators(
          [...data.items].sort((a, b) =>
            (a.name ?? "").localeCompare(b.name ?? "")
          )
        ),
    });
    const paySub = client.models.Payment.observeQuery().subscribe({
      next: (data) => setPayments([...data.items]),
    });
    const trSub = client.models.TransferReceiver.observeQuery().subscribe({
      next: (data) => setTransferReceivers([...data.items].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))),
    });
    const oiSub = client.models.OrderItem.observeQuery().subscribe({
      next: (data) => setAllOrderItems([...data.items]),
    });
    return () => {
      cSub.unsubscribe();
      pSub.unsubscribe();
      oSub.unsubscribe();
      opSub.unsubscribe();
      paySub.unsubscribe();
      trSub.unsubscribe();
      oiSub.unsubscribe();
    };
  }, []);

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + (l.subtotalOverride ?? l.unitPrice * l.quantity), 0),
    [lines]
  );
  const tax = includeTax ? subtotal * 0.05 : 0;
  const total = Math.ceil(subtotal + tax);

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
        subtotalOverride: null,
        subtotalRaw: "",
      },
    ]);
    setSelectedProductId("");
  }

  function updateLineQty(productId: string, qty: number) {
    setLines((prev) =>
      prev.map((l) =>
        l.productId === productId ? { ...l, quantity: Math.max(1, qty), subtotalOverride: null, subtotalRaw: "" } : l
      )
    );
  }

  function updateLineSubtotal(productId: string, value: string) {
    const num = parseFloat(value);
    setLines((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? { ...l, subtotalRaw: value, subtotalOverride: isNaN(num) ? l.subtotalOverride : num }
          : l
      )
    );
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function resetDraft() {
    setCustomerId("");
    setCustomerSearch("");
    setOperatorId("");
    setOrderDate(now());
    setOrderTime(nowTime());
    setNote("");
    setLines([]);
    setSelectedProductId("");
    setIncludeTax(false);
  }

  async function saveOrder() {
    if (!customerId) { alert("請選擇客戶"); return; }
    if (!operatorId) { alert("請選擇工程師"); return; }
    if (lines.length === 0) { alert("請至少加入一項商品"); return; }
    const shortage = lines.find((l) => l.stock !== -1 && l.quantity > l.stock);
    if (shortage) {
      alert(`商品「${shortage.productName}」庫存不足（庫存 ${shortage.stock}，需求 ${shortage.quantity}）`);
      return;
    }
    setSaving(true);
    try {
      const { errors } = await client.mutations.placeOrder({
        customerId,
        operatorId,
        createdBy: currentUserName,
        orderDate,
        orderTime,
        totalOverride: total,
        note: note.trim() || undefined,
        items: JSON.stringify(
          lines.map((l) => ({ productId: l.productId, quantity: l.quantity }))
        ),
      });
      if (errors && errors.length > 0) throw new Error(errors.map((e) => e.message).join("；"));
      resetDraft();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? `建立訂單失敗：${err.message}` : "建立訂單時發生錯誤");
    } finally {
      setSaving(false);
    }
  }

  async function softDeleteOrder(order: Order) {
    if (getPayment(order.id)) {
      alert("此訂單已收款，無法刪除");
      return;
    }
    if (!confirm("確定要刪除此訂單嗎？")) return;
    await client.models.Order.update({ id: order.id, isDeleted: true });
  }

  async function openPrint(order: Order) {
    const { data: items } = await client.models.OrderItem.list({
      filter: { orderId: { eq: order.id } },
    });
    setPrintItems(items);
    setPrintOrder(order);
  }

  function getPayment(orderId: string) {
    return payments.find((p) => p.orderId === orderId);
  }

  const activeOrders = orders.filter((o) => !o.isDeleted);
  const filteredOrders = activeOrders
    .filter((o) => (o.orderDate ?? "").startsWith(filterMonth))
    .sort((a, b) => {
      const d = (b.orderDate ?? "").localeCompare(a.orderDate ?? "");
      if (d !== 0) return d;
      return (b.orderTime ?? "").localeCompare(a.orderTime ?? "");
    });

  // 編輯
  async function openEdit(order: Order) {
    const { data: items } = await client.models.OrderItem.list({
      filter: { orderId: { eq: order.id } },
    });
    setEditingOrder(order);
    setEditItems(items);
    setEditOriginalItems(items.map((i) => ({ ...i })));
    setEditNewItems([]);
    setEditRemovedIds([]);
    setEditSelectedProductId("");
    setEditCustomerName(order.customerName ?? "");
    setEditCustomerPhone(order.customerPhone ?? "");
    setEditCustomerAddress(order.customerAddress ?? "");
    setEditOperatorName(order.operatorName ?? "");
    setEditOrderDate((order.orderDate ?? "").slice(0, 10));
    setEditOrderTime(order.orderTime ?? "07:00");
    const itemsSubtotal = items.reduce((s, it) => s + (it.subtotal ?? 0), 0);
    setEditIncludeTax(itemsSubtotal > 0 && (order.totalPrice ?? 0) > itemsSubtotal);
  }

  async function saveEdit() {
    if (!editingOrder) return;
    setSavingEdit(true);
    try {
      await client.models.Order.update({
        id: editingOrder.id,
        customerName: editCustomerName,
        customerPhone: editCustomerPhone,
        customerAddress: editCustomerAddress,
        operatorName: editOperatorName,
        orderDate: editOrderDate,
        orderTime: editOrderTime,
      });

      // --- Stock adjustments ---
      // Helper: get product and its bundle components
      async function getProductInfo(productId: string) {
        const { data: p } = await client.models.Product.get({ id: productId });
        if (!p) return null;
        let comps: { productId: string; quantity: number }[] = [];
        if (p.bundleItems) {
          try { comps = JSON.parse(p.bundleItems); } catch { /* ignore */ }
        }
        return { product: p, isBundle: comps.length > 0, components: comps, isInfinite: (p.quantity ?? 0) === -1 };
      }

      // Helper: adjust stock for a product (positive = restore, negative = deduct)
      async function adjustStock(productId: string, delta: number) {
        if (delta === 0) return;
        const { data: p } = await client.models.Product.get({ id: productId });
        if (!p || (p.quantity ?? 0) === -1) return;
        await client.models.Product.update({
          id: productId,
          quantity: Math.max(0, (p.quantity ?? 0) + delta),
        });
      }

      // Restore stock for removed items
      for (const id of editRemovedIds) {
        const orig = editOriginalItems.find((i) => i.id === id);
        if (!orig || !orig.productId) continue;
        const info = await getProductInfo(orig.productId);
        if (!info) continue;
        if (info.isBundle) {
          for (const comp of info.components) {
            await adjustStock(comp.productId, comp.quantity * (orig.quantity ?? 0));
          }
        } else {
          await adjustStock(orig.productId, orig.quantity ?? 0);
        }
      }

      // Adjust stock for quantity changes on existing items
      for (const it of editItems.filter((i) => !editRemovedIds.includes(i.id))) {
        const orig = editOriginalItems.find((o) => o.id === it.id);
        if (!orig || !it.productId) continue;
        const qtyDiff = (orig.quantity ?? 0) - (it.quantity ?? 0); // positive = restore, negative = deduct
        if (qtyDiff === 0) continue;
        const info = await getProductInfo(it.productId);
        if (!info) continue;
        if (info.isBundle) {
          for (const comp of info.components) {
            await adjustStock(comp.productId, comp.quantity * qtyDiff);
          }
        } else {
          await adjustStock(it.productId, qtyDiff);
        }
      }

      // Deduct stock for new items
      for (const nl of editNewItems) {
        const info = await getProductInfo(nl.productId);
        if (!info) continue;
        if (info.isBundle) {
          for (const comp of info.components) {
            await adjustStock(comp.productId, -(comp.quantity * nl.quantity));
          }
        } else {
          await adjustStock(nl.productId, -nl.quantity);
        }
      }

      // --- Update/Delete/Create order items ---
      for (const it of editItems.filter((i) => !editRemovedIds.includes(i.id))) {
        await client.models.OrderItem.update({
          id: it.id,
          productName: it.productName,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          subtotal: it.subtotal,
        });
      }
      for (const id of editRemovedIds) {
        await client.models.OrderItem.delete({ id });
      }
      for (const nl of editNewItems) {
        await client.models.OrderItem.create({
          orderId: editingOrder.id,
          productId: nl.productId,
          productName: nl.productName,
          unitPrice: nl.unitPrice,
          quantity: nl.quantity,
          subtotal: nl.subtotalOverride ?? nl.unitPrice * nl.quantity,
        });
      }

      // recalc total
      const existingSubtotal = editItems
        .filter((i) => !editRemovedIds.includes(i.id))
        .reduce((s, it) => s + (it.subtotal ?? 0), 0);
      const newSubtotal = editNewItems.reduce((s, l) => s + (l.subtotalOverride ?? l.unitPrice * l.quantity), 0);
      const editSubtotal = existingSubtotal + newSubtotal;
      const editTax = editIncludeTax ? editSubtotal * 0.05 : 0;
      const newTotal = Math.ceil(editSubtotal + editTax);
      await client.models.Order.update({ id: editingOrder.id, totalPrice: newTotal });
      setEditingOrder(null);
    } catch (err) {
      alert(err instanceof Error ? `更新失敗：${err.message}` : "更新失敗");
    } finally {
      setSavingEdit(false);
    }
  }

  function updateEditItem(id: string, field: string, value: string) {
    setEditItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, [field]: field === "productName" ? value : parseFloat(value) || 0 };
        if (field === "unitPrice" || field === "quantity") {
          updated.subtotal = (updated.unitPrice ?? 0) * (updated.quantity ?? 0);
        }
        return updated;
      })
    );
  }

  function removeEditItem(id: string) {
    setEditRemovedIds((prev) => [...prev, id]);
  }

  function restoreEditItem(id: string) {
    setEditRemovedIds((prev) => prev.filter((x) => x !== id));
  }

  function addEditNewItem() {
    if (!editSelectedProductId) return;
    const p = products.find((x) => x.id === editSelectedProductId);
    if (!p) return;
    const allProductIds = [
      ...editItems.filter((i) => !editRemovedIds.includes(i.id)).map((i) => i.productId),
      ...editNewItems.map((i) => i.productId),
    ];
    if (allProductIds.includes(p.id)) {
      alert("此商品已在訂單中");
      return;
    }
    setEditNewItems([
      ...editNewItems,
      {
        productId: p.id,
        productName: p.name ?? "",
        unitPrice: p.unitPrice ?? 0,
        quantity: 1,
        stock: p.quantity ?? 0,
        subtotalOverride: null,
        subtotalRaw: "",
      },
    ]);
    setEditSelectedProductId("");
  }

  function updateEditNewItemQty(productId: string, qty: number) {
    setEditNewItems((prev) =>
      prev.map((l) =>
        l.productId === productId ? { ...l, quantity: Math.max(1, qty), subtotalOverride: null, subtotalRaw: "" } : l
      )
    );
  }

  function updateEditNewItemSubtotal(productId: string, value: string) {
    const num = parseFloat(value);
    setEditNewItems((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? { ...l, subtotalRaw: value, subtotalOverride: isNaN(num) ? l.subtotalOverride : num }
          : l
      )
    );
  }

  function removeEditNewItem(productId: string) {
    setEditNewItems((prev) => prev.filter((l) => l.productId !== productId));
  }

  const editSubtotalCalc = useMemo(() => {
    const existing = editItems.filter((i) => !editRemovedIds.includes(i.id)).reduce((s, it) => s + (it.subtotal ?? 0), 0);
    const added = editNewItems.reduce((s, l) => s + (l.subtotalOverride ?? l.unitPrice * l.quantity), 0);
    return existing + added;
  }, [editItems, editRemovedIds, editNewItems]);

  function openPayment(order: Order) {
    setPaymentOrder(order);
    setPaymentMethod("CASH");
    setPaymentBy("");
  }

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
      <section className="panel no-print">
        <div className="panel-head" style={{ marginBottom: showOrderForm ? 16 : 0 }}>
          <h2>建立新訂單</h2>
          <button className="btn-secondary" onClick={() => setShowOrderForm(!showOrderForm)}>
            {showOrderForm ? "收起" : "展開"}
          </button>
        </div>
        {showOrderForm && (<>
        <div className="form-grid">
          <label>
            客戶 *
            <div className="search-select">
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setCustomerId("");
                  setShowCustomerDropdown(true);
                }}
                onFocus={() => setShowCustomerDropdown(true)}
                placeholder="搜尋客戶姓名或電話"
              />
              {showCustomerDropdown && customerSearch.trim() !== "" && (
                <ul className="search-select-list">
                  {customers
                    .filter((c) => {
                      const q = customerSearch.trim().toLowerCase();
                      return (
                        (c.name ?? "").toLowerCase().includes(q) ||
                        (c.phone ?? "").toLowerCase().includes(q)
                      );
                    })
                    .map((c) => (
                      <li
                        key={c.id}
                        className="search-select-item"
                        onMouseDown={() => {
                          setCustomerId(c.id);
                          setCustomerSearch(`${c.name}${c.phone ? `（${c.phone}）` : ""}`);
                          setShowCustomerDropdown(false);
                        }}
                      >
                        {c.name}{c.phone ? `（${c.phone}）` : ""}
                      </li>
                    ))}
                  {customers.filter((c) => {
                    const q = customerSearch.trim().toLowerCase();
                    return (c.name ?? "").toLowerCase().includes(q) || (c.phone ?? "").toLowerCase().includes(q);
                  }).length === 0 && (
                    <li className="search-select-empty">找不到符合的客戶</li>
                  )}
                </ul>
              )}
            </div>
          </label>
          <label>
            工程師 *
            <select required value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
              <option value="">請選擇工程師</option>
              {operators.map((op) => (
                <option key={op.id} value={op.id}>{op.name}</option>
              ))}
            </select>
          </label>
          <label>
            訂單日期 *
            <input required type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
          </label>
          <label>
            時間 *
            <select required value={orderTime} onChange={(e) => setOrderTime(e.target.value)}>
              {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>

        <div className="add-item-row">
          <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}>
            <option value="">選擇商品加入訂單</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（庫存 {(p.quantity ?? 0) === -1 ? "∞" : (p.quantity ?? 0)}）— ${(p.unitPrice ?? 0).toFixed(2)}
              </option>
            ))}
          </select>
          <button className="btn-secondary" onClick={addLine}>加入</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: "30%" }}>商品名稱</th>
                <th style={{ width: "15%" }}>單價</th>
                <th style={{ width: "22%" }}>數量</th>
                <th style={{ width: "18%" }}>小計</th>
                <th style={{ width: "15%" }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={5} className="empty">尚未加入商品</td></tr>
              )}
              {lines.map((l) => (
                <tr key={l.productId} className={l.stock !== -1 && l.quantity > l.stock ? "out-of-stock" : ""}>
                  <td>{l.productName}</td>
                  <td>${l.unitPrice.toFixed(2)}</td>
                  <td>
                    <input className="qty-input" type="number" min="1" value={l.quantity}
                      onChange={(e) => updateLineQty(l.productId, parseInt(e.target.value, 10) || 1)} />
                    <span className="stock-hint">/ 庫存 {l.stock === -1 ? "∞" : l.stock}</span>
                  </td>
                  <td>
                    <input className="subtotal-input" type="number" step="1" min="0"
                      value={l.subtotalRaw !== "" ? l.subtotalRaw : (l.subtotalOverride === null ? Math.round(l.unitPrice * l.quantity) : l.subtotalRaw)}
                      onChange={(e) => updateLineSubtotal(l.productId, e.target.value)} />
                  </td>
                  <td>
                    <button className="btn-link danger" onClick={() => removeLine(l.productId)}>移除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="order-total-row">
          <label className="tax-check">
            <input type="checkbox" checked={includeTax} onChange={(e) => setIncludeTax(e.target.checked)} />
            含 5% 稅
          </label>
          <div className="total-detail">
            {includeTax && (
              <>
                <span className="subtotal-line">小計：${subtotal.toFixed(2)}</span>
                <span className="tax-line">稅金（5%）：${tax.toFixed(2)}</span>
              </>
            )}
            <span>訂單總金額：<span className="order-total">${total}</span></span>
          </div>
        </div>

        <div className="form-actions">
          <button className="btn-primary" onClick={saveOrder} disabled={saving}>
            {saving ? "儲存中…" : "建立訂單"}
          </button>
          <button className="btn-secondary" onClick={resetDraft}>清除</button>
        </div>
        </>)}
      </section>

      <section className="panel no-print">
        <div className="panel-head">
          <h2>訂單清單（{filteredOrders.length}）</h2>
          <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>時間</th>
                <th>客戶</th>
                <th>電話</th>
                <th>商品項目</th>
                <th>工程師</th>
                <th className="num">總金額</th>
                <th>建立者</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 && (
                <tr><td colSpan={9} className="empty">此月份尚無訂單</td></tr>
              )}
              {filteredOrders.map((o) => {
                const pay = getPayment(o.id);
                return (
                  <tr key={o.id}>
                    <td>{o.orderDate || "—"}</td>
                    <td>{o.orderTime || "—"}</td>
                    <td>{o.customerName || "—"}</td>
                    <td>{o.customerPhone || "—"}</td>
                    <td className="muted" style={{ fontSize: "0.82rem" }}>
                      {allOrderItems.filter((i) => i.orderId === o.id).map((i) => `${i.productName}×${i.quantity}`).join("、") || "—"}
                    </td>
                    <td>{o.operatorName || "—"}</td>
                    <td className="num">${Math.ceil(o.totalPrice ?? 0)}</td>
                    <td>{o.createdBy || "—"}</td>
                    <td>
                      <div className="row-actions">
                        {!pay && <button className="btn-link" onClick={() => openEdit(o)}>編輯</button>}
                        <button className="btn-link" onClick={() => openPrint(o)}>列印派工單</button>
                        {pay ? (
                          <span className="payment-badge">
                            已收款（{pay.method === "CASH" ? "現金" : "匯款"}・收款：{pay.receivedBy}・確認：{pay.confirmedBy}）
                          </span>
                        ) : (
                          <button className="btn-link" onClick={() => openPayment(o)}>收款</button>
                        )}
                        {!pay && (
                          <button className="btn-link danger" onClick={() => softDeleteOrder(o)}>刪除</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 編輯訂單彈窗 */}
      {editingOrder && (
        <div className="modal-overlay" onClick={() => setEditingOrder(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div className="modal-head">
              <h2>編輯訂單 — {editingOrder.id.slice(0, 8).toUpperCase()}</h2>
              <button className="btn-close" onClick={() => setEditingOrder(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label>
                  客戶姓名
                  <input value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} />
                </label>
                <label>
                  電話
                  <input value={editCustomerPhone} onChange={(e) => setEditCustomerPhone(e.target.value)} />
                </label>
                <label className="full">
                  地址
                  <input value={editCustomerAddress} onChange={(e) => setEditCustomerAddress(e.target.value)} />
                </label>
                <label>
                  工程師
                  <select value={editOperatorName} onChange={(e) => setEditOperatorName(e.target.value)}>
                    <option value="">請選擇</option>
                    {operators.map((op) => (
                      <option key={op.id} value={op.name}>{op.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  訂單日期
                  <input type="date" value={editOrderDate} onChange={(e) => setEditOrderDate(e.target.value)} />
                </label>
                <label>
                  時間
                  <select value={editOrderTime} onChange={(e) => setEditOrderTime(e.target.value)}>
                    {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>

              <h3 style={{ margin: "16px 0 8px" }}>訂單項目</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: "30%" }}>商品名稱</th>
                      <th style={{ width: "15%" }}>單價</th>
                      <th style={{ width: "15%" }}>數量</th>
                      <th style={{ width: "20%" }}>小計</th>
                      <th style={{ width: "20%" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editItems.map((it) => {
                      const removed = editRemovedIds.includes(it.id);
                      return (
                        <tr key={it.id} style={removed ? { opacity: 0.4, textDecoration: "line-through" } : undefined}>
                          <td>
                            <input value={it.productName ?? ""} disabled={removed}
                              onChange={(e) => updateEditItem(it.id, "productName", e.target.value)} />
                          </td>
                          <td>
                            <input className="qty-input" type="number" step="0.01" disabled={removed}
                              value={it.unitPrice ?? 0}
                              onChange={(e) => updateEditItem(it.id, "unitPrice", e.target.value)} />
                          </td>
                          <td>
                            <input className="qty-input" type="number" min="1" disabled={removed}
                              value={it.quantity ?? 0}
                              onChange={(e) => updateEditItem(it.id, "quantity", e.target.value)} />
                          </td>
                          <td>${(it.subtotal ?? 0).toFixed(2)}</td>
                          <td>
                            {removed ? (
                              <button className="btn-link" onClick={() => restoreEditItem(it.id)}>復原</button>
                            ) : (
                              <button className="btn-link danger" onClick={() => removeEditItem(it.id)}>移除</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {editNewItems.map((l) => (
                      <tr key={l.productId}>
                        <td>{l.productName}</td>
                        <td>${l.unitPrice.toFixed(2)}</td>
                        <td>
                          <input className="qty-input" type="number" min="1" value={l.quantity}
                            onChange={(e) => updateEditNewItemQty(l.productId, parseInt(e.target.value, 10) || 1)} />
                        </td>
                        <td>
                          <input className="subtotal-input" type="number" step="1" min="0"
                            value={l.subtotalRaw !== "" ? l.subtotalRaw : (l.subtotalOverride === null ? Math.round(l.unitPrice * l.quantity) : l.subtotalRaw)}
                            onChange={(e) => updateEditNewItemSubtotal(l.productId, e.target.value)} />
                        </td>
                        <td>
                          <button className="btn-link danger" onClick={() => removeEditNewItem(l.productId)}>移除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="add-item-row">
                <select value={editSelectedProductId} onChange={(e) => setEditSelectedProductId(e.target.value)}>
                  <option value="">選擇商品加入訂單</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（庫存 {(p.quantity ?? 0) === -1 ? "∞" : (p.quantity ?? 0)}）— ${(p.unitPrice ?? 0).toFixed(2)}
                    </option>
                  ))}
                </select>
                <button className="btn-secondary" onClick={addEditNewItem}>加入</button>
              </div>

              <div className="order-total-row">
                <label className="tax-check">
                  <input type="checkbox" checked={editIncludeTax} onChange={(e) => setEditIncludeTax(e.target.checked)} />
                  含 5% 稅
                </label>
                <div className="total-detail">
                  {editIncludeTax && (
                    <>
                      <span className="subtotal-line">小計：${editSubtotalCalc.toFixed(2)}</span>
                      <span className="tax-line">稅金（5%）：${(editSubtotalCalc * 0.05).toFixed(2)}</span>
                    </>
                  )}
                  <span>訂單總金額：<span className="order-total">
                    ${Math.ceil(editSubtotalCalc * (editIncludeTax ? 1.05 : 1))}
                  </span></span>
                </div>
              </div>

              <div className="form-actions" style={{ marginTop: 16 }}>
                <button className="btn-primary" onClick={saveEdit} disabled={savingEdit}>
                  {savingEdit ? "儲存中…" : "儲存變更"}
                </button>
                <button className="btn-secondary" onClick={() => setEditingOrder(null)}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 收款彈窗 */}
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

      {/* 列印區域 */}
      {printOrder && (
        <div className="print-area">
          <div className="print-toolbar no-print">
            <button className="btn-primary" onClick={() => window.print()}>列印</button>
            <button className="btn-secondary" onClick={() => setPrintOrder(null)}>關閉預覽</button>
          </div>
          <div className="print-preview-wrapper" style={{ transform: `scale(${printScale})` }}>
            <DeliverySheet order={printOrder} items={printItems} />
          </div>
        </div>
      )}
    </div>
  );
}

export default OrderPage;
