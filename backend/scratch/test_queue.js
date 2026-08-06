const { poolPromise, sql } = require("../config/db");
const { queueQRPrintJobs } = require("../utils/printHelper");

async function run() {
  try {
    const pool = await poolPromise;
    console.log("Connected to database.");

    // Let's search for dishIds for these items
    const dishRes = await pool.request().query(`
      SELECT TOP 5 DishId, Name
      FROM DishMaster
      WHERE Name IN ('spcl mutton kebab', 'Bru', 'Mini Idly')
    `);
    console.log("Dishes found:", dishRes.recordset);

    const sentItems = dishRes.recordset.map(r => ({
      id: r.DishId,
      name: r.Name,
      qty: 1,
      price: 10
    }));

    // Let's resolve kitchen details manually like backend does but with fix
    const dishIds = sentItems.map(item => item.id);
    if (dishIds.length > 0) {
      try {
        const kitchenRes = await pool.request()
          .query(`
            SELECT 
              dish.DishId as id,
              ISNULL(ckt.KitchenTypeCode, '2') as KitchenTypeCode, 
              ISNULL(ISNULL(ckt.KitchenTypeName, cat.CategoryName), 'KITCHEN') as KitchenTypeName,
              pm.PrinterIP as PrinterIP
            FROM DishMaster dish
            LEFT JOIN DishGroupMaster dgm ON dish.DishGroupId = dgm.DishGroupId
            LEFT JOIN CategoryMaster cat ON dgm.CategoryId = cat.CategoryId
            LEFT JOIN CategoryKitchenType ckt ON dgm.CategoryId = ckt.CategoryId
            LEFT JOIN (
              SELECT *, ROW_NUMBER() OVER(PARTITION BY KitchenTypeValue ORDER BY PrinterId) as rn 
              FROM PrintMaster WHERE IsActive = 1 AND PrinterType = 2
            ) pm ON CAST(ckt.KitchenTypeCode AS VARCHAR(50)) = CAST(pm.KitchenTypeValue AS VARCHAR(50)) AND pm.rn = 1
            WHERE dish.DishId IN (${dishIds.map(id => `'${id}'`).join(",")})
          `);
        console.log("Resolved kitchen info from DB:");
        console.table(kitchenRes.recordset);

        const kitchenMap = {};
        kitchenRes.recordset.forEach(row => {
          kitchenMap[row.id.toLowerCase()] = row;
        });

        sentItems.forEach(item => {
          const kInfo = kitchenMap[String(item.id).toLowerCase()];
          if (kInfo) {
            item.KitchenTypeCode = kInfo.KitchenTypeCode;
            item.KitchenTypeName = kInfo.KitchenTypeName;
            item.PrinterIP = kInfo.PrinterIP;
          }
        });
      } catch (err) {
        console.error("Error resolving kitchen info:", err.message);
      }
    }

    console.log("Items before queuing:", sentItems);

    await queueQRPrintJobs(pool, sql, {
      orderId: "TEST-ORDER-123",
      tableNo: "1",
      sentItems,
      isAdditional: false
    });

    console.log("Queue complete!");
  } catch (err) {
    console.error("Runner failed:", err);
  }
  process.exit(0);
}

run();
