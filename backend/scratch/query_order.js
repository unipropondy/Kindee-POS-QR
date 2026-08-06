const { poolPromise } = require("../config/db");

async function check() {
  try {
    const pool = await poolPromise;
    console.log("=== LATEST 10 ORDERS ===");
    const res = await pool.request().query("SELECT TOP 10 OrderId, TableNo, entry_status, CreatedOn, isOrderClosed FROM RestaurantOrderCur ORDER BY CreatedOn DESC");
    console.table(res.recordset.map(r => ({
      OrderId: r.OrderId,
      TableNo: r.TableNo || r.Tableno,
      entry_status: r.entry_status,
      CreatedOn: r.CreatedOn,
      isOrderClosed: r.isOrderClosed
    })));

    for (const order of res.recordset) {
      console.log(`=== DETAILS FOR ORDER ${order.OrderId} (Table: ${order.TableNo || order.Tableno}) ===`);
      const details = await pool.request()
        .input("OrderId", order.OrderId)
        .query("SELECT d.OrderDetailId, d.DishId, d.Quantity, d.PricePerUnit, d.StatusCode, dm.Name FROM RestaurantOrderDetailCur d JOIN DishMaster dm ON d.DishId = dm.DishId WHERE d.OrderId = @OrderId");
      console.table(details.recordset);
    }
  } catch (err) {
    console.error("Error running checks:", err);
  }
  process.exit(0);
}

check();
