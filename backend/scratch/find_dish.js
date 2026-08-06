const { poolPromise } = require("../config/db");

async function run() {
  try {
    const pool = await poolPromise;
    console.log("Querying dishes and their kitchen/category mapping...");
    const res = await pool.request().query(`
      SELECT TOP 20
        d.DishId, d.Name, dgm.DishGroupId, dgm.CategoryId, cat.CategoryName,
        ckt.KitchenTypeCode, ckt.KitchenTypeName, pm.PrinterName, pm.PrinterIP
      FROM DishMaster d
      LEFT JOIN DishGroupMaster dgm ON d.DishGroupId = dgm.DishGroupId
      LEFT JOIN CategoryMaster cat ON dgm.CategoryId = cat.CategoryId
      LEFT JOIN CategoryKitchenType ckt ON dgm.CategoryId = ckt.CategoryId
      LEFT JOIN PrintMaster pm ON CAST(ckt.KitchenTypeCode AS VARCHAR(50)) = CAST(pm.KitchenTypeValue AS VARCHAR(50)) AND pm.PrinterType = 2
      WHERE d.Name LIKE '%pasta%' OR d.Name LIKE '%juice%' OR d.Name LIKE '%sauce%'
    `);
    console.log(res.recordset);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
