const { poolPromise, sql } = require("../config/db");

async function testTable4DraftCart() {
  try {
    const pool = await poolPromise;
    console.log("=== STEP 1: INITIAL STATE FOR TABLE 4 ===");
    let tableInfo = await pool.request().query("SELECT TableId, TableNumber, Status, CurrentOrderId FROM TableMaster WHERE TableNumber = '4'");
    console.table(tableInfo.recordset);

    console.log("\n=== STEP 2: SIMULATING save-cart WITH 2 DRAFT ITEMS FOR TABLE 4 (TableNumber = '4') ===");
    const cleanId = "4";
    const currentOrderId = "20260805-0064";

    // Perform TableMaster update as done in save-cart
    await pool.request()
      .input("tid", sql.VarChar(50), cleanId)
      .input("oid", sql.NVarChar(50), currentOrderId)
      .input("skipSync", sql.Bit, false)
      .query(`
        UPDATE TableMaster 
        SET Status = CASE 
                       WHEN @skipSync = 1 AND Status IN (2, 3) THEN Status 
                       WHEN @oid IS NOT NULL THEN 1 
                       ELSE 0 
                     END, 
            CurrentOrderId = @oid,
            StartTime = CASE WHEN @oid IS NOT NULL AND (StartTime IS NULL OR StartTime < '2000-01-01') THEN GETDATE() 
                             WHEN @oid IS NULL THEN NULL 
                             ELSE StartTime END
        WHERE TableNumber = @tid OR (TRY_CAST(@tid AS UNIQUEIDENTIFIER) IS NOT NULL AND TableId = TRY_CAST(@tid AS UNIQUEIDENTIFIER))
      `);

    tableInfo = await pool.request().query("SELECT TableId, TableNumber, Status, CurrentOrderId FROM TableMaster WHERE TableNumber = '4'");
    console.log("TableMaster for Table 4 after save-cart:");
    console.table(tableInfo.recordset);

    if (tableInfo.recordset[0]?.Status === 1) {
      console.log("✅ SUCCESS! Table 4 is now Status 1 (Occupied/Orange) on Table Grid!");
    } else {
      console.error("❌ FAILED! Table 4 is still Status 0 (Vacant)");
    }

    // Clean up
    await pool.request().query("UPDATE TableMaster SET Status = 0, CurrentOrderId = NULL WHERE TableNumber = '4'");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

testTable4DraftCart();
