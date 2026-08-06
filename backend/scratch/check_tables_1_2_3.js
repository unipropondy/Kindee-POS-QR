const { poolPromise, sql } = require("../config/db");

async function checkSpecificTables() {
  try {
    const pool = await poolPromise;
    console.log("=== TABLES 1, 2, 3 IN TABLEMASTER ===");
    const tables = await pool.request().query(`
      SELECT TableId, TableNumber, Status, CurrentOrderId, StartTime, TotalAmount, entry_status
      FROM TableMaster
      WHERE TableNumber IN ('1', '2', '3')
    `);
    console.table(tables.recordset);

    console.log("\n=== ALL OPEN ORDERS IN RESTAURANTORDERCUR FOR TABLES 1, 2, 3 ===");
    const activeOrders = await pool.request().query(`
      SELECT OrderId, OrderNumber, Tableno, TotalAmount, isOrderClosed, CreatedOn, ModifiedOn
      FROM RestaurantOrderCur
      WHERE Tableno IN ('1', '2', '3') AND (isOrderClosed = 0 OR isOrderClosed IS NULL)
      ORDER BY CreatedOn DESC
    `);
    console.table(activeOrders.recordset);

    console.log("\n=== ALL OPEN ORDER DETAILS FOR TABLES 1, 2, 3 ===");
    const activeDetails = await pool.request().query(`
      SELECT d.OrderDetailId, d.OrderId, h.OrderNumber, h.Tableno, d.DishId, d.DishName, d.Quantity, d.PricePerUnit, d.StatusCode, d.CreatedOn
      FROM RestaurantOrderDetailCur d
      JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
      WHERE h.Tableno IN ('1', '2', '3') AND (h.isOrderClosed = 0 OR h.isOrderClosed IS NULL)
      ORDER BY h.Tableno, d.CreatedOn ASC
    `);
    console.table(activeDetails.recordset);

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

checkSpecificTables();
