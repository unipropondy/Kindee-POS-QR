const { poolPromise, sql } = require("../config/db");

async function simulate() {
  try {
    const pool = await poolPromise;
    console.log("=== STEP 1: INITIAL STATE FOR TABLE 3 ===");
    let tableInfo = await pool.request().query("SELECT TableId, TableNumber, Status, CurrentOrderId FROM TableMaster WHERE TableNumber = '3'");
    console.table(tableInfo.recordset);

    const realDishRes = await pool.request().query("SELECT TOP 1 DishId, Name FROM DishMaster");
    const realDishId = realDishRes.recordset[0].DishId;
    const realDishName = realDishRes.recordset[0].Name;

    console.log(`Using real dish: ${realDishName} (${realDishId})`);

    console.log("\n=== STEP 2: SIMULATING /send FOR TABLE 3 WITH 'red sauce pasta' ===");
    const orderNo = "20260805-9999";
    const orderGuidRes = await pool.request().query("SELECT NEWID() as guid");
    const orderGuid = orderGuidRes.recordset[0].guid;

    const tx = new sql.Transaction(pool);
    await tx.begin();

    const dummyUserGuid = "00000000-0000-0000-0000-000000000001";

    // Insert Order Header
    await tx.request()
      .input("oid", sql.UniqueIdentifier, orderGuid)
      .input("ono", sql.NVarChar(50), orderNo)
      .input("tno", sql.VarChar(50), "3")
      .input("uid", sql.UniqueIdentifier, dummyUserGuid)
      .query(`
        INSERT INTO RestaurantOrderCur (OrderId, OrderNumber, Tableno, TotalAmount, isOrderClosed, CreatedOn, ModifiedOn, OrderDateTime, StatusCode, CreatedBy)
        VALUES (@oid, @ono, @tno, 0.01, 0, GETDATE(), GETDATE(), GETDATE(), 1, @uid)
      `);

    // Insert Order Detail
    const detailGuidRes = await tx.request().query("SELECT NEWID() as guid");
    const detailGuid = detailGuidRes.recordset[0].guid;

    await tx.request()
      .input("did", sql.UniqueIdentifier, detailGuid)
      .input("oid", sql.UniqueIdentifier, orderGuid)
      .input("dish", sql.UniqueIdentifier, realDishId)
      .input("name", sql.NVarChar(200), realDishName)
      .input("price", sql.Decimal(18,2), 0.01)
      .input("ono", sql.NVarChar(50), orderNo)
      .input("uid", sql.UniqueIdentifier, dummyUserGuid)
      .query(`
        INSERT INTO RestaurantOrderDetailCur (OrderDetailId, OrderId, DishId, Description, DishName, Quantity, PricePerUnit, ActualAmount, TotalDetailLineAmount, BaseAmount, StatusCode, CreatedOn, OrderNumber, OrderDateTime, CreatedBy, BusinessUnitId)
        VALUES (@did, @oid, @dish, @name, @name, 1, @price, @price, @price, @price, 2, GETDATE(), @ono, GETDATE(), @uid, @uid)
      `);

    await tx.commit();
    console.log("Order 20260805-9999 created with 1 SENT item.");

    // Now update TableMaster
    await pool.request()
      .input("tid", sql.VarChar(50), "3")
      .input("oid", sql.NVarChar(50), orderNo)
      .query("UPDATE TableMaster SET Status = 1, CurrentOrderId = @oid WHERE TableNumber = @tid");

    tableInfo = await pool.request().query("SELECT TableId, TableNumber, Status, CurrentOrderId FROM TableMaster WHERE TableNumber = '3'");
    console.log("TableMaster after order send:");
    console.table(tableInfo.recordset);

    console.log("\n=== STEP 3: SIMULATING save-cart WITH 0 ITEMS FOR TABLE 3 (TableNumber = '3') WITH TRY_CAST ===");
    const cleanId = "3";
    const sentCheckRes = await pool.request().input("tidForCheck", sql.VarChar(50), cleanId).query(`
      DECLARE @TableNoCheck VARCHAR(50);
      SELECT TOP 1 @TableNoCheck = TableNumber FROM TableMaster WHERE TableNumber = @tidForCheck OR (TRY_CAST(@tidForCheck AS UNIQUEIDENTIFIER) IS NOT NULL AND TableId = TRY_CAST(@tidForCheck AS UNIQUEIDENTIFIER));
      IF @TableNoCheck IS NULL SET @TableNoCheck = @tidForCheck;

      SELECT COUNT(*) AS SentCount
      FROM RestaurantOrderDetailCur d
      JOIN RestaurantOrderCur h ON h.OrderId = d.OrderId
      WHERE (h.Tableno = @TableNoCheck OR h.Tableno = @tidForCheck)
        AND (h.isOrderClosed = 0 OR h.isOrderClosed IS NULL)
        AND d.StatusCode >= 2
    `);
    const sentCount = sentCheckRes.recordset[0]?.SentCount || 0;
    console.log(`sentCount found in DB for Table 3: ${sentCount}`);

    tableInfo = await pool.request().query("SELECT TableId, TableNumber, Status, CurrentOrderId FROM TableMaster WHERE TableNumber = '3'");
    console.log("TableMaster after save-cart with 0 items:");
    console.table(tableInfo.recordset);

    console.log("\n=== STEP 4: FETCHING CART FOR TABLE 3 ===");
    const cartRes = await pool.request().input("tid", sql.VarChar(50), "3").query(`
      SELECT 
        d.OrderDetailId, d.OrderId, h.OrderNumber, h.Tableno, d.DishName, d.Quantity, d.PricePerUnit, d.StatusCode
      FROM RestaurantOrderDetailCur d
      JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
      WHERE (h.isOrderClosed = 0 OR h.isOrderClosed IS NULL)
        AND d.StatusCode <> 0
        AND (
          h.Tableno = '3'
          OR h.Tableno = (SELECT TOP 1 TableNumber FROM TableMaster WHERE TableNumber = '3' OR (TRY_CAST('3' AS UNIQUEIDENTIFIER) IS NOT NULL AND TableId = TRY_CAST('3' AS UNIQUEIDENTIFIER)))
          OR h.OrderNumber = '20260805-9999'
        )
    `);
    console.log("Cart items returned:");
    console.table(cartRes.recordset);

    // CLEANUP TEST ORDER
    await pool.request().input("oid", sql.UniqueIdentifier, orderGuid).query(`
      DELETE FROM RestaurantOrderDetailCur WHERE OrderId = @oid;
      DELETE FROM RestaurantOrderCur WHERE OrderId = @oid;
      UPDATE TableMaster SET Status = 0, CurrentOrderId = NULL WHERE TableNumber = '3';
    `);
    console.log("\nTest order cleaned up cleanly.");
    process.exit(0);
  } catch (err) {
    console.error("Simulation error:", err);
    process.exit(1);
  }
}

simulate();
