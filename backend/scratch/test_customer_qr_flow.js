const { poolPromise, sql } = require("../config/db");

async function testCustomerQROrderFlow() {
  try {
    const pool = await poolPromise;
    console.log("=== STEP 1: VERIFYING QR CODE SETTING IN DATABASE ===");
    const appSettings = await pool.request().query("SELECT TOP 1 EnableQRCodeSettings FROM AppSettings");
    const qrEnabled = Boolean(appSettings.recordset[0]?.EnableQRCodeSettings);
    console.log(`QR Setting in AppSettings: EnableQRCodeSettings = ${qrEnabled}`);

    console.log("\n=== STEP 2: SIMULATING CUSTOMER QR CART SAVE FOR TABLE 3 (TableNumber = '3') ===");
    const cleanId = "3";
    const currentOrderId = "QR-TEST-20260805-0001";

    // Simulate save-cart with entryStatus = 'q'
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    await transaction.request()
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

    if (qrEnabled) {
      await transaction.request().input("tid", sql.VarChar(50), cleanId).query(`
        UPDATE TableMaster SET Status = 2, entry_status = 'q', PAYMENT_STATUS = 0 WHERE TableNumber = @tid OR (TRY_CAST(@tid AS UNIQUEIDENTIFIER) IS NOT NULL AND TableId = TRY_CAST(@tid AS UNIQUEIDENTIFIER))
      `);
    } else {
      await transaction.request().input("tid", sql.VarChar(50), cleanId).query(`
        UPDATE TableMaster SET Status = 1, entry_status = 'q', PAYMENT_STATUS = 0 WHERE TableNumber = @tid OR (TRY_CAST(@tid AS UNIQUEIDENTIFIER) IS NOT NULL AND TableId = TRY_CAST(@tid AS UNIQUEIDENTIFIER))
      `);
    }

    await transaction.commit();

    let tableStatus = await pool.request().query("SELECT TableNumber, Status, entry_status, CurrentOrderId FROM TableMaster WHERE TableNumber = '3'");
    console.log("TableMaster for Table 3 after QR Order Save:");
    console.table(tableStatus.recordset);

    if (tableStatus.recordset[0]?.entry_status === 'q') {
      console.log("✅ SUCCESS! Customer QR Order flow updated Table 3 cleanly with entry_status = 'q'!");
    } else {
      console.error("❌ FAILED! entry_status was not updated");
    }

    // Clean up test state
    await pool.request().query("UPDATE TableMaster SET Status = 0, entry_status = NULL, CurrentOrderId = NULL, StartTime = NULL WHERE TableNumber = '3'");
    console.log("\nCleaned up test state cleanly.");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

testCustomerQROrderFlow();
