const { poolPromise } = require("../config/db");

async function cleanStaleTableMasterOrders() {
  try {
    const pool = await poolPromise;
    console.log("=== CLEANING STALE CurrentOrderId FROM VACANT TABLES ===");

    // Reset TableMaster CurrentOrderId if the order is closed or does not belong to this table
    const result = await pool.request().query(`
      UPDATE TableMaster
      SET CurrentOrderId = NULL, Status = 0, StartTime = NULL
      WHERE Status = 0 OR CurrentOrderId IN (
        SELECT OrderNumber FROM RestaurantOrderCur WHERE isOrderClosed = 1
      )
    `);

    console.log(`✅ Reset ${result.rowsAffected[0] || 0} vacant tables in TableMaster.`);

    const check = await pool.request().query("SELECT TableNumber, Status, CurrentOrderId FROM TableMaster WHERE CurrentOrderId IS NOT NULL");
    console.log("\nCurrently Active Tables in TableMaster:");
    console.table(check.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

cleanStaleTableMasterOrders();
