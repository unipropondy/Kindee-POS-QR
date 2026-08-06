const { poolPromise } = require("../config/db");

async function run() {
  try {
    const pool = await poolPromise;
    console.log("Querying all active tables in TableMaster (Status > 0 or TotalAmount > 0)...");
    const activeTables = await pool.request().query("SELECT TableId, TableNumber, Status, TotalAmount, CurrentOrderId, entry_status FROM TableMaster WHERE Status > 0 OR TotalAmount > 0");
    console.log("Active Tables:", activeTables.recordset);

    console.log("\nQuerying active orders in RestaurantOrderCur...");
    const activeOrders = await pool.request().query("SELECT OrderId, OrderNumber, Tableno, TotalAmount, isOrderClosed FROM RestaurantOrderCur WHERE (isOrderClosed = 0 OR isOrderClosed IS NULL)");
    console.log("Active Orders in RestaurantOrderCur:", activeOrders.recordset);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
