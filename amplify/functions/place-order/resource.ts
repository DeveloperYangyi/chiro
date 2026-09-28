import { defineFunction } from "@aws-amplify/backend";

// 下單處理函式：在伺服器端驗證庫存、建立訂單與項目、扣減庫存
export const placeOrder = defineFunction({
  name: "place-order",
  entry: "./handler.ts",
  timeoutSeconds: 30,
});
