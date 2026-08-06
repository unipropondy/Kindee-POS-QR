const { poolPromise, sql } = require("../config/db");

async function verifyTableIsolation() {
  try {
    const pool = await poolPromise;
    console.log("=== CHECKING TABLEMASTER CURRENT ORDER IDS ===");
    const res = await pool.request().query("SELECT TableNumber, TableId, Status, CurrentOrderId FROM TableMaster WHERE TableNumber IN ('15', '16', '20') ORDER BY CAST(TableNumber AS INT)");
    console.table(res.recordset);

    console.log("\n=== CHECKING ACTIVE ORDERS FOR TABLES 15, 16, 20 IN DB ===");
    const ordersRes = await pool.request().query(`
      SELECT OrderId, OrderNumber, Tableno, isOrderClosed, CreatedOn 
      FROM RestaurantOrderCur 
      WHERE Tableno IN ('15', '16', '20') AND (isOrderClosed = 0 OR isOrderClosed IS NULL)
      ORDER BY CreatedOn DESC
    `);
    console.table(ordersRes.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

verifyTableIsolation();
