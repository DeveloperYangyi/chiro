import type { Schema } from "../../data/resource";
import { Amplify } from "aws-amplify";
import { generateClient } from "aws-amplify/data";
import { getAmplifyDataClientConfig } from "@aws-amplify/backend/function/runtime";
import { env } from "$amplify/env/place-order";

/**
 * placeOrder 自訂 Mutation 的處理函式。
 *
 * 在伺服器端以單一請求完成下單流程：
 *  1. 讀取客戶資料（作為訂單快照）
 *  2. 逐項讀取商品、驗證庫存是否足夠
 *  3. 建立訂單（Order）
 *  4. 建立各訂單項目（OrderItem）並扣減對應商品庫存
 *
 * 若中途任何步驟失敗，會嘗試回滾（刪除已建立的項目與訂單、回補已扣減的庫存），
 * 讓前端只需呼叫一次即可，避免部分成功造成庫存與訂單不一致。
 */

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(
  env
);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

type HandlerArgs = {
  arguments: {
    customerId: string;
    operatorId?: string | null;
    createdBy?: string | null;
    orderDate?: string | null;
    note?: string | null;
    // JSON 字串：[{ productId, quantity }]
    items: string;
  };
};

type LineInput = { productId: string; quantity: number };

export const handler = async (event: HandlerArgs) => {
  const { customerId, operatorId, createdBy, orderDate, note, items } = event.arguments;

  let lines: LineInput[];
  try {
    lines = JSON.parse(items);
  } catch {
    throw new Error("items 格式錯誤，需為 JSON 陣列");
  }

  if (!customerId) throw new Error("缺少客戶 ID");
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("訂單至少需要一項商品");
  }

  // 1. 讀取客戶
  const { data: customer, errors: customerErrors } =
    await client.models.Customer.get({ id: customerId });
  if (customerErrors) throw new Error(customerErrors.map((e) => e.message).join("; "));
  if (!customer) throw new Error("找不到指定的客戶");

  // 1-b. 讀取工程師（可選）
  let operatorName: string | null = null;
  if (operatorId) {
    const { data: operator } = await client.models.Operator.get({ id: operatorId });
    if (operator) operatorName = operator.name;
  }

  // 2. 讀取商品並驗證庫存
  const resolved = await Promise.all(
    lines.map(async (l) => {
      const { data: product } = await client.models.Product.get({
        id: l.productId,
      });
      if (!product) throw new Error(`找不到商品：${l.productId}`);
      const qty = Math.max(1, Math.floor(l.quantity));
      if ((product.quantity ?? 0) < qty) {
        throw new Error(
          `商品「${product.name}」庫存不足（庫存 ${product.quantity ?? 0}，需求 ${qty}）`
        );
      }
      return {
        product,
        qty,
        unitPrice: product.unitPrice ?? 0,
        subtotal: (product.unitPrice ?? 0) * qty,
      };
    })
  );

  const totalPrice = resolved.reduce((sum, r) => sum + r.subtotal, 0);

  // 3. 建立訂單
  const { data: order, errors: orderErrors } = await client.models.Order.create({
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    customerAddress: customer.address,
    operatorId: operatorId ?? null,
    operatorName,
    createdBy: createdBy ?? null,
    orderDate: orderDate ?? new Date().toISOString().slice(0, 10),
    status: "PENDING",
    totalPrice,
    note: note ?? null,
  });
  if (orderErrors) throw new Error(orderErrors.map((e) => e.message).join("; "));
  if (!order) throw new Error("建立訂單失敗");

  // 4. 建立訂單項目並扣減庫存（記錄已完成步驟以便回滾）
  const createdItemIds: string[] = [];
  const deducted: { id: string; original: number }[] = [];

  try {
    for (const r of resolved) {
      const { data: item, errors: itemErrors } =
        await client.models.OrderItem.create({
          orderId: order.id,
          productId: r.product.id,
          productName: r.product.name,
          unitPrice: r.unitPrice,
          quantity: r.qty,
          subtotal: r.subtotal,
        });
      if (itemErrors) throw new Error(itemErrors.map((e) => e.message).join("; "));
      if (item) createdItemIds.push(item.id);

      const original = r.product.quantity ?? 0;
      const { errors: updateErrors } = await client.models.Product.update({
        id: r.product.id,
        quantity: Math.max(0, original - r.qty),
      });
      if (updateErrors) throw new Error(updateErrors.map((e) => e.message).join("; "));
      deducted.push({ id: r.product.id, original });
    }
  } catch (err) {
    // 回滾：回補庫存、刪除已建立的項目與訂單
    await Promise.allSettled([
      ...deducted.map((d) =>
        client.models.Product.update({ id: d.id, quantity: d.original })
      ),
      ...createdItemIds.map((id) => client.models.OrderItem.delete({ id })),
    ]);
    await client.models.Order.delete({ id: order.id });
    throw err instanceof Error ? err : new Error("下單失敗，已回滾");
  }

  return {
    orderId: order.id,
    totalPrice,
    itemCount: resolved.length,
  };
};
