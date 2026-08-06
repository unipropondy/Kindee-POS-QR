const { poolPromise } = require("../config/db");

async function run() {
  try {
    const pool = await poolPromise;
    const testKCodes = ['1', '4', '6', '8798'];
    for (const kCode of testKCodes) {
      const printerRes = await pool.request()
        .input('KTV', kCode)
        .query(`
          SELECT TOP 1 ISNULL(NULLIF(PrinterIP, ''), NULLIF(PrinterPath, '')) as PrinterIP, PrinterName
          FROM PrintMaster
          WHERE PrinterType = 2
            AND CAST(KitchenTypeValue AS VARCHAR(50)) = CAST(@KTV AS VARCHAR(50))
            AND IsActive = 1
            AND (PrinterIP IS NOT NULL AND PrinterIP <> '' OR PrinterPath IS NOT NULL AND PrinterPath <> '')
        `);
      console.log(`KTV = ${kCode} (WITH NULLIF):`, printerRes.recordset);
    }
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
