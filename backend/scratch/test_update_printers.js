const { poolPromise } = require("../config/db");
const sql = require("mssql");

async function test() {
  try {
    const pool = await poolPromise;
    console.log("🔌 Connected to database. Running test update...");

    // Test data simulating the settings payload for Lebanon
    const printer = {
      id: "8793", // Lebanon's visible code
      name: "Lebanon",
      ip: "192.168.0.200",
      isEnabled: 0, // Toggle OFF
      isActive: 1
    };

    const codeVal = parseInt(printer.id);
    const printerIp = printer.ip;
    const isActiveValue = 1;
    const isEnabledValue = 0;

    // Run the update query
    const result = await pool.request()
      .input("code", sql.Int, codeVal)
      .input("ip", sql.NVarChar, printerIp)
      .input("name", sql.NVarChar, printer.name)
      .input("isActive", sql.Bit, isActiveValue)
      .input("isEnabled", sql.Bit, isEnabledValue)
      .query(`
        UPDATE PrintMaster 
        SET PrinterPath = @ip, PrinterIP = @ip, KitchenTypeName = @name, PrinterName = @name, IsActive = @isActive, IsEnabled = @isEnabled
        WHERE (KitchenTypeValue = @code OR LOWER(TRIM(KitchenTypeName)) = LOWER(TRIM(@name))) AND PrinterType = 2
      `);

    console.log(`✅ Update query completed. Rows affected: ${result.rowsAffected[0]}`);

    // Query back the rows for Lebanon
    const selectRes = await pool.request()
      .query(`
        SELECT PrinterId, KitchenTypeName, KitchenTypeValue, IsActive, IsEnabled, PrinterIP
        FROM PrintMaster
        WHERE KitchenTypeName = 'Lebanon' AND PrinterType = 2
      `);

    console.log("📋 Current status of Lebanon printers in PrintMaster:");
    console.table(selectRes.recordset);

  } catch (err) {
    console.error("❌ Test failed with error:", err.message);
  } finally {
    process.exit(0);
  }
}

test();
