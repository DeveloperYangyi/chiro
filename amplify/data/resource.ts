import { type ClientSchema, a, defineData } from "@aws-amplify/backend";
import { placeOrder } from "../functions/place-order/resource";

/*== 倉庫管理系統 資料模型 =================================================
定義四個模型：
- Product（商品／庫存）
- Customer（客戶：姓名、地址、電話）
- Order（訂單：關聯客戶、總金額、狀態）
- OrderItem（訂單項目：商品名稱、單價、數量、小計）
授權採用 API Key，任何以 API Key 驗證的使用者皆可進行 CRUDL 操作。
=========================================================================*/
const schema = a.schema({
  // 商品／庫存
  Product: a
    .model({
      name: a.string().required(), // 商品名稱
      sku: a.string(), // 商品編號
      unitPrice: a.float().required().default(0), // 單價
      quantity: a.integer().required().default(0), // 庫存數量
      unit: a.string(), // 單位（例如：件、箱）
      note: a.string(), // 備註
    })
    .authorization((allow) => [allow.publicApiKey()]),

  // 客戶
  Customer: a
    .model({
      name: a.string().required(), // 客戶姓名
      phone: a.string(), // 電話號碼
      address: a.string(), // 地址
      note: a.string(), // 備註
      orders: a.hasMany("Order", "customerId"), // 訂單歷史
    })
    .authorization((allow) => [allow.publicApiKey()]),

  // 訂單
  Order: a
    .model({
      customerId: a.id(), // 客戶 ID
      customer: a.belongsTo("Customer", "customerId"),
      // 下單時快照客戶資料，避免客戶資料變動影響歷史訂單／送貨單
      customerName: a.string(),
      customerPhone: a.string(),
      customerAddress: a.string(),
      orderDate: a.date(), // 訂單日期
      status: a.enum(["PENDING", "COMPLETED", "CANCELLED"]), // 待處理／已完成／已取消
      totalPrice: a.float().required().default(0), // 訂單總金額
      note: a.string(), // 備註
      items: a.hasMany("OrderItem", "orderId"), // 訂單項目
    })
    .authorization((allow) => [allow.publicApiKey()]),

  // 訂單項目
  OrderItem: a
    .model({
      orderId: a.id(), // 訂單 ID
      order: a.belongsTo("Order", "orderId"),
      productId: a.id(), // 商品 ID
      productName: a.string().required(), // 商品名稱（快照）
      unitPrice: a.float().required().default(0), // 單價
      quantity: a.integer().required().default(1), // 數量
      subtotal: a.float().required().default(0), // 小計
    })
    .authorization((allow) => [allow.publicApiKey()]),

  // 下單結果
  PlaceOrderResult: a.customType({
    orderId: a.string(),
    totalPrice: a.float(),
    itemCount: a.integer(),
  }),

  // 自訂 Mutation：以單一請求原子化地建立訂單、項目並扣減庫存
  placeOrder: a
    .mutation()
    .arguments({
      customerId: a.string().required(),
      orderDate: a.string(),
      note: a.string(),
      // JSON 字串：[{ productId, quantity }]
      items: a.string().required(),
    })
    .returns(a.ref("PlaceOrderResult"))
    .authorization((allow) => [allow.publicApiKey()])
    .handler(a.handler.function(placeOrder)),
})
  // 授權 place-order 函式存取整個 Data API（以便在伺服器端查詢／建立模型）。
  // 這也會將 AMPLIFY_DATA_DEFAULT_NAME 等環境變數注入該函式。
  .authorization((allow) => [allow.resource(placeOrder)]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "apiKey",
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
