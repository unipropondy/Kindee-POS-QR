const { poolPromise } = require("../config/db");

async function debugTable1() {
  try {
    const pool = await poolPromise;
    console.log("=== TABLEMASTER STATE FOR TABLE 1 & RECENT TABLES ===");
    const tables = await pool.request().query(`
      SELECT TableId, TableNumber, Status, CurrentOrderId, TotalAmount, StartTime, ModifiedOn 
      FROM TableMaster 
      WHERE TableNumber IN ('1', '2', '3', '4', '5', '6', 'D9') OR Status <> 0
    `);
    console.table(tables.recordset);

    console.log("\n=== RESTAURANTORDERCUR RECENT ORDERS ===");
    const orders = await pool.request().query(`
      SELECT TOP 10 OrderId, OrderNumber, Tableno, isOrderClosed, TotalAmount, CreatedOn, ModifiedOn 
      FROM RestaurantOrderCur 
      ORDER BY CreatedOn DESC
    `);
    console.table(orders.recordset);

    console.log("\n=== RESTAURANTORDERDETAILCUR ITEMS FOR MOST RECENT ORDER ===");
    if (orders.recordset.length > 0) {
      const mostRecentOrder = orders.recordset[0].OrderId;
      const items = await pool.request()
        .input("oid", mostRecentOrder)
        .query(`
          SELECT OrderDetailId, OrderId, DishId, Description, Quantity, PricePerUnit, ActualAmount, StatusCode, OrderNumber, CreatedOn 
          FROM RestaurantOrderDetailCur 
          WHERE OrderId = @oid
        `);
      console.table(items.recordset);
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

debugTable1();
