const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const sql = require("mssql");
const jwt = require("jsonwebtoken");

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  }
};

const API_URL = "http://localhost:3000";
const tableId = "51b4059b-95f1-409c-85d8-c5e24d55aad5"; // Table 3
const JWT_SECRET = process.env.JWT_SECRET || "POS_QR_JWT_SECRET_KEY_12345";

// Sign a valid test token
const token = jwt.sign(
  { userId: "00000000-0000-0000-0000-000000000000", role: "ADMIN" },
  JWT_SECRET,
  { expiresIn: "24h" }
);

async function run() {
  const pool = await sql.connect(dbConfig);
  
  // 1. Reset Table 3 in DB
  console.log("🧹 Resetting Table 3...");
  await pool.request()
    .input("tid", sql.UniqueIdentifier, tableId)
    .input("cid", sql.VarChar(128), tableId)
    .query(`
      UPDATE TableMaster SET Status = 0, entry_status = NULL, CurrentOrderId = NULL, TotalAmount = 0 WHERE TableId = @tid;
      DELETE FROM CartItems WHERE CartId = @cid;
    `);

  // 2. Add some items via save-cart
  console.log(`🛒 Saving initial cart with orderId: NEW...`);
  const cartRes = await fetch(`${API_URL}/api/orders/save-cart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tableId: tableId,
      orderId: "NEW",
      items: [
        {
          lineItemId: "11111111-1111-1111-1111-111111111111",
          id: "2b21268b-d33f-4180-bbbb-84c10467c15f", // Chicken Shawarma
          name: "Chicken Shawarma",
          qty: 2,
          price: 1.00,
          status: "SENT",
          statusCode: 2
        },
        {
          lineItemId: "22222222-2222-2222-2222-222222222222",
          id: "e6e8c984-3eba-4da6-acfb-ce1bfdd5f18a", // Chicken Chettinad
          name: "Chicken Chettinadu",
          qty: 1,
          price: 5.50,
          status: "SENT",
          statusCode: 2
        }
      ]
    })
  });
  console.log("Cart save status:", cartRes.status);

  // Fetch updated order number from TableMaster
  const tableCheck = await pool.request().input("tid", sql.UniqueIdentifier, tableId).query(`
    SELECT CurrentOrderId FROM TableMaster WHERE TableId = @tid
  `);
  const orderNo = tableCheck.recordset[0]?.CurrentOrderId;
  if (!orderNo) {
    throw new Error("OrderNumber not found in TableMaster");
  }
  console.log("Resolved Order Number:", orderNo);

  const orderRes = await pool.request().input("ono", sql.NVarChar(50), orderNo).query(`
    SELECT OrderId FROM RestaurantOrderCur WHERE OrderNumber = @ono
  `);
  if (orderRes.recordset.length === 0) {
    throw new Error("Order GUID not found in RestaurantOrderCur");
  }
  const orderId = orderRes.recordset[0].OrderId;
  console.log("Resolved Order GUID:", orderId);

  // 3. Process Part 1 (Split by items: Pay 1 Chicken Shawarma)
  console.log("💳 Paying Part 1: 1 Chicken Shawarma...");
  const part1Res = await fetch(`${API_URL}/api/sales/save`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      tableId: tableId,
      orderType: "DINE_IN",
      isSplit: "true",
      paymentMethod: "CASH",
      totalAmount: 1.09, // 1.00 * 1.09 GST = 1.09
      subTotal: 1.00,
      items: [
        {
          lineItemId: "11111111-1111-1111-1111-111111111111",
          id: "2b21268b-d33f-4180-bbbb-84c10467c15f",
          name: "Chicken Shawarma",
          qty: 1.0,
          price: 1.00
        }
      ],
      payments: [{ payMode: "CASH", amount: 1.09 }],
      displayOrderId: orderNo,
      cashierId: "00000000-0000-0000-0000-000000000000"
    })
  });
  const part1Json = await part1Res.json();
  console.log("Part 1 Response:", part1Json);

  // Fetch remaining details in DB
  const curRes1 = await pool.request().input("oid", sql.NVarChar(50), orderId).query(`
    SELECT DishName, Quantity FROM RestaurantOrderDetailCur WHERE OrderId = @oid
  `);
  console.log("Remaining quantities in DB after Part 1:", curRes1.recordset);

  // Sync cart for Part 2 (simulating client setContextItems with remaining items)
  console.log("🔄 Syncing remaining cart items to DB (1 Chicken Shawarma, 1 Chicken Chettinad)...");
  await fetch(`${API_URL}/api/orders/save-cart`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      tableId: tableId,
      orderId: orderNo,
      items: [
        {
          lineItemId: "11111111-1111-1111-1111-111111111111",
          id: "2b21268b-d33f-4180-bbbb-84c10467c15f",
          name: "Chicken Shawarma",
          qty: 1.0,
          price: 1.00,
          status: "SENT",
          statusCode: 2
        },
        {
          lineItemId: "22222222-2222-2222-2222-222222222222",
          id: "e6e8c984-3eba-4da6-acfb-ce1bfdd5f18a",
          name: "Chicken Chettinadu",
          qty: 1.0,
          price: 5.50,
          status: "SENT",
          statusCode: 2
        }
      ]
    })
  });

  // 4. Process Part 2 (Split by items: Pay 1 Chicken Chettinad)
  console.log("💳 Paying Part 2: 1 Chicken Chettinad...");
  const part2Res = await fetch(`${API_URL}/api/sales/save`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      tableId: tableId,
      orderType: "DINE_IN",
      isSplit: "true",
      paymentMethod: "NETS",
      totalAmount: 6.00, // 5.50 * 1.09 = 5.995 -> 6.00
      subTotal: 5.50,
      items: [
        {
          lineItemId: "22222222-2222-2222-2222-222222222222",
          id: "e6e8c984-3eba-4da6-acfb-ce1bfdd5f18a",
          name: "Chicken Chettinadu",
          qty: 1.0,
          price: 5.50
        }
      ],
      payments: [{ payMode: "NETS", amount: 6.00 }],
      displayOrderId: orderNo,
      cashierId: "00000000-0000-0000-0000-000000000000"
    })
  });
  const part2Json = await part2Res.json();
  console.log("Part 2 Response:", part2Json);

  // Sync remaining cart for Part 3 (1 Chicken Shawarma remaining)
  console.log("🔄 Syncing remaining cart items to DB (1 Chicken Shawarma remaining)...");
  await fetch(`${API_URL}/api/orders/save-cart`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      tableId: tableId,
      orderId: orderNo,
      items: [
        {
          lineItemId: "11111111-1111-1111-1111-111111111111",
          id: "2b21268b-d33f-4180-bbbb-84c10467c15f",
          name: "Chicken Shawarma",
          qty: 1.0,
          price: 1.00,
          status: "SENT",
          statusCode: 2
        }
      ]
    })
  });

  // 5. Process Part 3 (Final Part: Remaining 1 Chicken Shawarma, isSplit: false)
  console.log("💳 Paying Part 3: Remaining Chicken Shawarma...");
  const part3Res = await fetch(`${API_URL}/api/sales/save`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({
      tableId: tableId,
      orderType: "DINE_IN",
      isSplit: "false",
      paymentMethod: "CASH",
      totalAmount: 1.09,
      subTotal: 1.00,
      items: [
        {
          lineItemId: "11111111-1111-1111-1111-111111111111",
          id: "2b21268b-d33f-4180-bbbb-84c10467c15f",
          name: "Chicken Shawarma",
          qty: 1.0,
          price: 1.00
        }
      ],
      payments: [{ payMode: "CASH", amount: 1.09 }],
      displayOrderId: orderNo,
      cashierId: "00000000-0000-0000-0000-000000000000"
    })
  });
  const part3Json = await part3Res.json();
  console.log("Part 3 Response:", part3Json);

  // 6. DB Integrity verification
  console.log("🔍 Checking archived quantities in SettlementItemDetail...");
  const detailRes = await pool.request().query(`
    SELECT sh.BillNo, sd.DishName, sd.Qty, sd.Price 
    FROM SettlementItemDetail sd
    JOIN SettlementHeader sh ON sd.SettlementID = sh.SettlementID
    JOIN RestaurantInvoice ri ON sh.SettlementID = ri.RestaurantBillId
    WHERE ri.OrderId = '${orderId}'
  `);
  console.log("SettlementItemDetail Rows:");
  console.log(detailRes.recordset);

  const histRes = await pool.request().query(`
    SELECT DishName, Quantity FROM RestaurantOrderDetail WHERE OrderId = '${orderId}'
  `);
  console.log("Historical Order Detail Rows:");
  console.log(histRes.recordset);

  const activeHeaderRes = await pool.request().query(`
    SELECT COUNT(*) as count FROM RestaurantOrderCur WHERE OrderId = '${orderId}'
  `);
  console.log("Order Header in Cur Count (should be 1):", activeHeaderRes.recordset[0].count);

  const activeDetailRes = await pool.request().query(`
    SELECT COUNT(*) as count FROM RestaurantOrderDetailCur WHERE OrderId = '${orderId}'
  `);
  console.log("Order Detail in Cur Count (should be 0):", activeDetailRes.recordset[0].count);

  await pool.close();
}
run().catch(console.error);
