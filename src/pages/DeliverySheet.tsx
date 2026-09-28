import type { Schema } from "../../amplify/data/resource";

type Order = Schema["Order"]["type"];
type OrderItem = Schema["OrderItem"]["type"];

interface Props {
  order: Order;
  items: OrderItem[];
}

/**
 * 送貨單（Delivery Sheet）
 * 列印尺寸：9.5 英吋 x 5.5 英吋
 * 內容：客戶姓名、地址、電話、訂單項目、每項單價與數量、總金額
 */
function DeliverySheet({ order, items }: Props) {
  const total =
    order.totalPrice ??
    items.reduce((sum, it) => sum + (it.subtotal ?? 0), 0);

  return (
    <div className="delivery-sheet">
      <div className="ds-header">
        <div className="ds-title">送貨單</div>
        <div className="ds-meta">
          <div>訂單日期：{order.orderDate || "—"}</div>
          <div className="ds-orderno">單號：{order.id.slice(0, 8).toUpperCase()}</div>
        </div>
      </div>

      <div className="ds-customer">
        <div className="ds-row">
          <span className="ds-label">客戶姓名：</span>
          <span className="ds-value">{order.customerName || "—"}</span>
        </div>
        <div className="ds-row">
          <span className="ds-label">聯絡電話：</span>
          <span className="ds-value">{order.customerPhone || "—"}</span>
        </div>
        <div className="ds-row">
          <span className="ds-label">送貨地址：</span>
          <span className="ds-value">{order.customerAddress || "—"}</span>
        </div>
      </div>

      <table className="ds-table">
        <thead>
          <tr>
            <th className="ds-idx">#</th>
            <th>商品名稱</th>
            <th className="ds-num">單價</th>
            <th className="ds-num">數量</th>
            <th className="ds-num">小計</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id}>
              <td className="ds-idx">{i + 1}</td>
              <td>{it.productName}</td>
              <td className="ds-num">${(it.unitPrice ?? 0).toFixed(2)}</td>
              <td className="ds-num">{it.quantity ?? 0}</td>
              <td className="ds-num">${(it.subtotal ?? 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ds-footer">
        <div className="ds-total">
          <span>總金額：</span>
          <span className="ds-total-value">${total.toFixed(2)}</span>
        </div>
        <div className="ds-sign">
          <span>簽收：______________</span>
        </div>
      </div>
    </div>
  );
}

export default DeliverySheet;
