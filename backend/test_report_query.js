const sql = require('mssql');
require('dotenv').config();
const { fetchFullReportData } = require('./utils/reportDataFetcher');

async function testReport() {
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '1433'),
    options: { encrypt: false, trustServerCertificate: true }
  };
  const pool = await sql.connect(config);

  console.log('=== TESTING fetchFullReportData for 2026-10-07 ===');
  const data = await fetchFullReportData('2026-10-07', '2026-10-07', pool);
  console.log('Payment Breakdown:', data.paymentBreakdown);
  console.log('Payment Breakdown Counts:', data.paymentBreakdownCounts);
  console.log('Summary:', data.summary);

  process.exit(0);
}

testReport().catch(console.error);
