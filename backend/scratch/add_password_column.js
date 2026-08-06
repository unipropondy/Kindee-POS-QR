const { poolPromise } = require("../config/db");

async function run() {
  try {
    const pool = await poolPromise;
    console.log("Running migration to add Password column to MemberMaster...");
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[MemberMaster]') AND name = 'Password')
      BEGIN
          ALTER TABLE [dbo].[MemberMaster] ADD Password VARCHAR(255) NULL;
          PRINT 'Added Password column';
      END
      ELSE
      BEGIN
          PRINT 'Password column already exists';
      END
    `);
    console.log("Migration finished successfully.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
  process.exit(0);
}

run();
