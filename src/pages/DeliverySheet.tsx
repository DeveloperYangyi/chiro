import type { Schema } from "../../amplify/data/resource";

type Order = Schema["Order"]["type"];
type OrderItem = Schema["OrderItem"]["type"];

interface Props {
  order: Order;
  items: OrderItem[];
}

function DeliverySheet({ order, items }: Props) {
  const subtotal = items.reduce((sum, it) => sum + (it.subtotal ?? 0), 0);
  const total = order.totalPrice ?? subtotal;
  const hasTax = total > subtotal && subtotal > 0;
  const tax = hasTax ? total - subtotal : 0;

  return (
    <div className="delivery-sheet">
      <div className="ds-header">
        <div className="ds-title">派工單</div>
        <div className="ds-meta">
          <div>訂單日期：{order.orderDate || "—"}</div>
          <div className="ds-orderno">單號：{order.id.slice(0, 8).toUpperCase()}</div>
        </div>
      </div>

      <div className="ds-customer">
        <div className="ds-row-inline">
          <span><span className="ds-label">客戶姓名：</span>{order.customerName || "—"}</span>
          <span><span className="ds-label">聯絡電話：</span>{order.customerPhone || "—"}</span>
          <span><span className="ds-label">送貨地址：</span>{order.customerAddress || "—"}</span>
          <span className="ds-right"><span className="ds-label">工程師：</span>{order.operatorName || "—"}</span>
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
          {hasTax && (
            <>
              <div>小計：${subtotal.toFixed(2)}</div>
              <div>稅金（5%）：${tax.toFixed(2)}</div>
            </>
          )}
          <div>
            <span>總金額：</span>
            <span className="ds-total-value">${Math.ceil(total)}</span>
          </div>
        </div>
        <div className="ds-sign">
          <span>簽收：______________</span>
        </div>
      </div>
    </div>
  );
}

export default DeliverySheet;
