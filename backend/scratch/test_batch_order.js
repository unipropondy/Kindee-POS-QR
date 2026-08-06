const { poolPromise } = require("../config/db");
const http = require("http");
const jwt = require("jsonwebtoken");

const token = jwt.sign(
  { userId: "00000000-0000-0000-0000-000000000000", userName: "TestAdmin" },
  process.env.JWT_SECRET || "9e581b685316ce4d65d29444725ca823b8d3603a7a78c4c8156fd61102478147"
);

function postRequest(path, payloadObj, useAuth = false) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(payloadObj);
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    };
    if (useAuth) {
      headers["Authorization"] = "Bearer " + token;
    }
    const req = http.request({
      hostname: "localhost",
      port: 3000,
      path: path,
      method: "POST",
      headers: headers
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
      });
    });
    req.on("error", (reject));
    req.write(payload);
    req.end();
  });
}

async function run() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB. Querying TableMaster and DishMaster...");

    // Find a valid table GUID
    const tableRes = await pool.request().query("SELECT TOP 1 TableId, TableNumber FROM TableMaster");
    const table = tableRes.recordset[0];
    if (!table) {
      console.error("No tables found in TableMaster!");
      process.exit(1);
    }
    const tableId = String(table.TableId).replace(/^\{|\}$/g, "").trim();
    console.log(`Using Table: ${table.TableNumber} (${tableId})`);

    // Find a valid dish GUID
    const dishRes = await pool.request().query("SELECT TOP 1 DishId, Name FROM DishMaster");
    const dish = dishRes.recordset[0];
    if (!dish) {
      console.error("No dishes found in DishMaster!");
      process.exit(1);
    }
    const dishId = String(dish.DishId).replace(/^\{|\}$/g, "").trim();
    console.log(`Using Dish: ${dish.Name} (${dishId})`);

    // Construct 120 mock items
    const items = [];
    for (let i = 0; i < 120; i++) {
      items.push({
        id: dishId,
        lineItemId: require("crypto").randomUUID(),
        qty: 1,
        price: 10,
        name: `Mock Dish ${i}`,
        status: "NEW"
      });
    }

    // Step 1: Send Order
    console.log("1. Sending order with 120 items...");
    const sendRes = await postRequest("/api/orders/send", {
      tableId: tableId,
      items: items,
      userId: "00000000-0000-0000-0000-000000000000"
    });
    console.log("Send Status:", sendRes.statusCode, "Response:", sendRes.data);
    if (sendRes.statusCode !== 200) {
      console.error("❌ Send failed!");
      process.exit(1);
    }

    // Step 2: Checkout Table
    console.log("2. Checking out table...");
    const checkoutRes = await postRequest("/api/orders/checkout", {
      tableId: tableId
    });
    console.log("Checkout Status:", checkoutRes.statusCode, "Response:", checkoutRes.data);
    if (checkoutRes.statusCode !== 200) {
      console.error("❌ Checkout failed!");
      process.exit(1);
    }

    // Step 3: Settle / Complete Payment
    console.log("3. Completing order/payment...");
    const completeRes = await postRequest("/api/orders/complete", {
      tableId: tableId,
      userId: "00000000-0000-0000-0000-000000000000"
    }, true);
    console.log("Complete Status:", completeRes.statusCode, "Response:", completeRes.data);
    if (completeRes.statusCode !== 200) {
      console.error("❌ Settle failed!");
      process.exit(1);
    }

    console.log("🎉 All end-to-end tests passed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Test crashed:", err.message);
    process.exit(1);
  }
}

run();
