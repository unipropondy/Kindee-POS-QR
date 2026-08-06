const { poolPromise } = require('../config/db');

async function main() {
  try {
    const pool = await poolPromise;
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'CompanySettings' AND COLUMN_NAME = 'UpiId'
      )
      BEGIN
        ALTER TABLE CompanySettings ADD UpiId NVARCHAR(200) NULL;
        PRINT 'UpiId column added successfully';
      END
      ELSE
      BEGIN
        PRINT 'UpiId column already exists';
      END
    `);
    console.log('✅ UpiId column ready in CompanySettings table');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
