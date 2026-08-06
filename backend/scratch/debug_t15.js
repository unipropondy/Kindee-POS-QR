const { poolPromise } = require("../config/db");

async function debugT15() {
  try {
    const pool = await poolPromise;
    console.log("=== TABLEMASTER SEARCH FOR '%15%' ===");
    const tables = await pool.request().query(`
      SELECT TableId, TableNumber, Status, CurrentOrderId, TotalAmount, StartTime, ModifiedOn 
      FROM TableMaster 
      WHERE TableNumber LIKE '%15%'
    `);
    console.table(tables.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

debugT15();
