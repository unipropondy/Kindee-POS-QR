const { poolPromise } = require("../config/db");

async function check() {
  try {
    const pool = await poolPromise;
    console.log("=== TABLE MASTER COLUMNS ===");
    const cols = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TableMaster'");
    console.log(cols.recordset.map(c => c.COLUMN_NAME));

    console.log("=== TABLE MASTER ROWS ===");
    const rows = await pool.request().query("SELECT TOP 5 * FROM TableMaster");
    console.table(rows.recordset);
  } catch (err) {
    console.error("Error running checks:", err);
  }
  process.exit(0);
}

check();
