const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const sql = require("mssql");
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  }
};
async function run() {
  const pool = await sql.connect(dbConfig);
  const res = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'RestaurantOrderDetailCur' AND COLUMN_NAME = 'Quantity'
  `);
  console.log(res.recordset);
  await pool.close();
}
run().catch(console.error);
