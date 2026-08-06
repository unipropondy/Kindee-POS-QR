const { poolPromise } = require("../config/db");

async function run() {
  try {
    const pool = await poolPromise;
    console.log("Querying all rows in PrintMaster...");
    const pm = await pool.request().query("SELECT PrinterId, PrinterName, PrinterType, KitchenTypeValue, PrinterPath, PrinterIP, IsActive FROM PrintMaster");
    console.log(pm.recordset);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
