const { poolPromise, sql } = require("../config/db");

async function checkSchema() {
  const pool = await poolPromise;
  const res = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'RestaurantOrderDetailCur'
  `);
  console.table(res.recordset);
  process.exit(0);
}

checkSchema();
