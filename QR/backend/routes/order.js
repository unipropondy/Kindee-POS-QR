const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");
const {
  generateAndQueueKOTs,
  generateAndQueueReceipt
} = require("../utils/printHelper");
const DEFAULT_GUID = "00000000-0000-0000-0000-000000000000";

const NOTE_KEYS = ["note", "Note", "notes", "Notes", "remarks", "Remarks"];
const TAKEAWAY_KEYS = ["isTakeaway", "IsTakeaway", "isTakeAway", "IsTakeAway"];
const SPICY_KEYS = ["spicy", "Spicy"];
const SALT_KEYS = ["salt", "Salt"];
const OIL_KEYS = ["oil", "Oil"];
const SUGAR_KEYS = ["sugar", "Sugar"];

const toGuidOrNull = (value) => {
  if (!value) return null;
  const s = String(value).trim().replace(/^\{|\}$/g, "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
};

function resolveItemTextField(item = {}, keys = []) {
  const itemKeys = Object.keys(item || {});
  for (const k of keys) {
    const actualKey = itemKeys.find(ik => ik.toLowerCase() === k.toLowerCase());
    if (actualKey !== undefined) {
      const raw = item[actualKey];
      if (raw !== undefined && raw !== null) return { hasExplicitValue: true, value: String(raw) };
    }
  }
  return { hasExplicitValue: false, value: "" };
}

function resolveItemNote(item = {}) { return resolveItemTextField(item, NOTE_KEYS); }
function resolveItemTakeaway(item = {}) {
  const result = resolveItemTextField(item, TAKEAWAY_KEYS);
  const val = result.value.toLowerCase();
  return {
    hasExplicitTakeaway: result.hasExplicitValue,
    value: result.hasExplicitValue ? (val === "true" || val === "1") : false
  };
}

/**
 * Get or Generate Order ID for a table
 * Returns existing ID if table is active, otherwise generates a new one.
 */
let cachedBusinessUnitId = null;

async function getOrGenerateOrderId(req, tableId) {
  const pool = await poolPromise;
  const cleanId = String(tableId)
    .replace(/^\{|\}$/g, "")
    .trim();
  if (!tableId || tableId === "undefined" || tableId === "null") return "NEW";

  try {
    // 1. Instant check for existing ID
    const quickCheck = await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .query("SELECT CurrentOrderId FROM TableMaster WHERE TableId = @tid");

    let existingId = quickCheck.recordset[0]?.CurrentOrderId;
    if (existingId && existingId !== "NEW" && existingId !== "#NEW" && !existingId.startsWith("TEMP-") && existingId.length > 5) return existingId;

    // 2. Optimized Business Unit ID Retrieval (Cached)
    if (!cachedBusinessUnitId) {
      const bizRow = await pool.request().query("SELECT TOP 1 BusinessUnitId FROM [dbo].[RestaurantOrderCur] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'");
      cachedBusinessUnitId = bizRow.recordset.length > 0 ? bizRow.recordset[0].BusinessUnitId : DEFAULT_GUID;
    }

    const istDate = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
    const todayStr = istDate.toISOString().split('T')[0];
    const datePrefix = todayStr.replace(/-/g, '');

    let dailySequence = 1;

    // 3. ATOMIC ATTEMPT: Use MERGE or Transaction for Sequence
    const seqResult = await pool.request()
      .input("RestId", sql.UniqueIdentifier, String(cachedBusinessUnitId))
      .input("Today", sql.Date, todayStr)
      .query(`
        BEGIN TRANSACTION;
        IF NOT EXISTS (SELECT 1 FROM OrderSequences WHERE RestaurantId = @RestId AND SequenceDate = @Today)
        BEGIN
            INSERT INTO OrderSequences (RestaurantId, SequenceDate, LastNumber) VALUES (@RestId, @Today, 0);
        END
        UPDATE OrderSequences SET LastNumber = LastNumber + 1 OUTPUT INSERTED.LastNumber
        WHERE RestaurantId = @RestId AND SequenceDate = @Today;
        COMMIT TRANSACTION;
      `);

    dailySequence = seqResult.recordset[0]?.LastNumber || 1;

    const displayOrderId = `${datePrefix}-${String(dailySequence).padStart(4, '0')}`;

    // 4. Atomic Update of Table Status
    await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .input("oid", sql.NVarChar(50), displayOrderId)
      .query("UPDATE TableMaster SET CurrentOrderId = @oid, StartTime = ISNULL(StartTime, GETDATE()) WHERE TableId = @tid");

    return displayOrderId;
  } catch (err) {
    console.error("🔥 [Critical] OrderID Generation Failed:", err.message);
    // FALLBACK: Use count as emergency instead of returning "NEW"
    const istDate = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
    const datePrefix = istDate.toISOString().split('T')[0].replace(/-/g, '');
    const countRes = await pool.request().query(`SELECT (COUNT(*) + 1) as LastNumber FROM RestaurantOrderCur WHERE OrderNumber LIKE '${datePrefix}%'`);
    const emergencySeq = countRes.recordset[0]?.LastNumber || 1;
    return `${datePrefix}-EM${String(emergencySeq).padStart(3, '0')}`;
  }
}

/**
 * Professional Table Sync Helper
 * Syncs CartItems to RestaurantOrderCur and RestaurantOrderDetailCur
 */
async function syncToProfessionalTables(transaction, tableId, displayOrderId, items, userId) {
  const isTakeaway = (!tableId || tableId === "undefined" || tableId === "null");
  const cleanTableId = isTakeaway ? null : String(tableId).replace(/^\{|\}$/g, "").trim();
  const cleanOrderNo = String(displayOrderId || "PENDING").replace(/^\{|\}$/g, "").trim();

  let actualTableNo = "TAKEAWAY";
  if (cleanTableId) {
    const tCheck = await transaction.request()
      .input("tid", sql.VarChar(50), cleanTableId)
      .query("SELECT TableNumber FROM TableMaster WHERE TableId = @tid");
    if (tCheck.recordset.length > 0) actualTableNo = tCheck.recordset[0].TableNumber;
  }

  let bizId = DEFAULT_GUID;
  const bizCheck = await transaction.request().query("SELECT TOP 1 BusinessUnitId FROM [dbo].[RestaurantOrderCur] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'");
  if (bizCheck.recordset.length > 0) bizId = bizCheck.recordset[0].BusinessUnitId;
  if (!bizId) bizId = DEFAULT_GUID;

  let finalUserId = userId;
  if (!finalUserId || finalUserId.length < 10) finalUserId = DEFAULT_GUID;

  let orderGuid;
  // 🛡️ STRICT LOOKUP: Prioritize OrderNumber first, then most recent active table order
  const headerCheck = await transaction.request()
    .input("orderNo", sql.NVarChar(50), cleanOrderNo)
    .input("tableNo", sql.VarChar(20), actualTableNo)
    .query(`
      SELECT TOP 1 OrderId FROM RestaurantOrderCur WITH (UPDLOCK)
      WHERE OrderNumber = @orderNo 
      OR (LTRIM(RTRIM(Tableno)) = LTRIM(RTRIM(@tableNo)) AND (isOrderClosed = 0 OR isOrderClosed IS NULL)) 
      ORDER BY CreatedOn DESC
    `);

  if (headerCheck.recordset.length > 0) {
    orderGuid = headerCheck.recordset[0].OrderId;
    // Ensure the OrderNumber is synced to the professional one if it was a draft (TEMP-, PENDING, etc)
    await transaction.request()
      .input("orderId", sql.UniqueIdentifier, orderGuid)
      .input("orderNo", sql.NVarChar(50), cleanOrderNo)
      .query(`
        UPDATE RestaurantOrderCur 
        SET OrderNumber = @orderNo 
        WHERE OrderId = @orderId 
        AND (OrderNumber IS NULL OR OrderNumber = '' OR OrderNumber = 'PENDING' OR OrderNumber = 'NEW' OR OrderNumber = '#NEW' OR OrderNumber LIKE 'TEMP-%')
      `);
  } else {
    orderGuid = require("crypto").randomUUID();
    await transaction.request().input("orderId", sql.UniqueIdentifier, orderGuid).input("orderNo", sql.NVarChar(50), cleanOrderNo).input("tableNo", sql.VarChar(20), actualTableNo).input(
      "userId",
      sql.UniqueIdentifier,
      toGuidOrNull(finalUserId) || DEFAULT_GUID
    )
      .input("bizId", sql.UniqueIdentifier, bizId)
      .input("entry_Status", sql.NVarChar(20), "q")
      .query("INSERT INTO RestaurantOrderCur (OrderId, OrderNumber, OrderDateTime, Tableno, StatusCode, CreatedBy, CreatedOn, isOrderClosed, BusinessUnitId,entry_Status) VALUES (@orderId, @orderNo, GETDATE(), LTRIM(RTRIM(@tableNo)), 1, @userId, GETDATE(), 0, @bizId, 'q')");
  }
  for (const item of items) {
    const cleanProdId = String(item.id || item.ProductId || DEFAULT_GUID).replace(/^\{|\}$/g, "").trim();
    let finalProdId = cleanProdId;
    if (finalProdId.length < 10) finalProdId = DEFAULT_GUID;

    let lineItemId = item.lineItemId || item.ItemId;
    const statusCodes = { 'NEW': 1, 'SENT': 2, 'READY': 3, 'SERVED': 4, 'HOLD': 5, 'VOIDED': 0 };
    const currentStatusCode = statusCodes[item.status || item.Status] || 2;
    const dishName = String(
      item.name || item.ProductName || "Dish"
    ).substring(0, 50);
    const unitPrice = item.price || item.Cost || 0;
    const noteInfo = resolveItemNote(item);
    const takeawayInfo = resolveItemTakeaway(item);
    const modsJSON = JSON.stringify(item.modifiers || []).substring(0, 500);
    const comboDetailsJSON = JSON.stringify(item.comboSelections || []).substring(0, 4000);

    // 🕵️‍♂️ SMART-MATCH: If ID is missing, try to find an existing item with same Dish & Modifiers
    // if (!lineItemId || lineItemId.length < 10) {
    //   const matchCheck = await transaction.request()
    //     .input("orderId", sql.UniqueIdentifier, orderGuid)
    //     .input("dishId", sql.UniqueIdentifier, finalProdId)
    //     .input("mods", sql.NVarChar(sql.MAX), modsJSON)
    //     .query("SELECT TOP 1 OrderDetailId FROM RestaurantOrderDetailCur WHERE OrderId = @orderId AND DishId = @dishId AND CAST(ModifiersJSON AS NVARCHAR(MAX)) = LTRIM(RTRIM(@mods)) AND StatusCode <> 0 ORDER BY CreatedOn DESC");

    //   if (matchCheck.recordset.length > 0) {
    //     lineItemId = matchCheck.recordset[0].OrderDetailId;
    //   } else {
    //     lineItemId = require("crypto").randomUUID();
    //   }
    // }

    // if (!lineItemId || lineItemId.length < 10) {
    //   const matchCheck = await transaction.request()
    //     .input("orderId", sql.UniqueIdentifier, orderGuid)
    //     .input("dishId", sql.UniqueIdentifier, finalProdId)
    //     .query(`
    //   SELECT TOP 1 OrderDetailId
    //   FROM RestaurantOrderDetailCur
    //   WHERE OrderId = @orderId
    //     AND DishId = @dishId
    //     AND StatusCode <> 0
    //   ORDER BY CreatedOn DESC
    // `);

    //   if (matchCheck.recordset.length > 0) {
    //     lineItemId = matchCheck.recordset[0].OrderDetailId;
    //   } else {
    //     lineItemId = require("crypto").randomUUID();
    //   }
    // }

    
   if (!lineItemId || lineItemId.length < 10) {

      const matchCheck = await transaction.request()
        .input("orderId", sql.UniqueIdentifier, orderGuid)
        .input("dishId", sql.UniqueIdentifier, finalProdId)
        .input("mods", sql.NVarChar(sql.MAX), modsJSON)
        .input("combo", sql.NVarChar(sql.MAX), comboDetailsJSON)
        .query(`
          SELECT TOP 1 OrderDetailId
          FROM RestaurantOrderDetailCur
          WHERE OrderId = @orderId
            AND DishId = @dishId
            AND ISNULL(CAST(ModifiersJSON AS NVARCHAR(MAX)), '') =
                ISNULL(@mods, '')
                AND ISNULL(CAST(ComboDetailsJSON AS NVARCHAR(MAX)), '') = ISNULL(@combo, '')
            AND StatusCode NOT IN (2,3,4)
          ORDER BY CreatedOn DESC
        `);

        console.log("========== MATCH CHECK ==========");
console.log("Dish :", finalProdId);
console.log("Mods :", modsJSON);
console.log("Combo :", comboDetailsJSON);
console.log("Found :", matchCheck.recordset);

      if (matchCheck.recordset.length > 0) {
        lineItemId = matchCheck.recordset[0].OrderDetailId;
      } else {
        lineItemId = crypto.randomUUID();
      }
      }
    // const comboDetailsJSON = JSON.stringify(item.comboSelections || []).substring(0, 4000);

    console.log("MATCH LINEITEM:", lineItemId);
console.log("ITEM:", item.name);
console.log("COMBO:", comboDetailsJSON);
console.log("QTY:", item.qty);
console.log("LINE ITEM ID:", lineItemId);


    const detailCheck = await transaction.request().input("detailId", sql.UniqueIdentifier, lineItemId).query("SELECT OrderDetailId,StatusCode FROM RestaurantOrderDetailCur WHERE OrderDetailId = @detailId");
    console.log("DETAIL CHECK:", detailCheck.recordset);
    if (detailCheck.recordset.length > 0) {
      if (
        detailCheck.recordset[0].StatusCode !== 4 &&
        detailCheck.recordset[0].StatusCode !== 3 &&
        detailCheck.recordset[0].StatusCode !== 2
      ) {
        await transaction.request()
          .input("detailId", sql.UniqueIdentifier, lineItemId)
          .input("qty", sql.Int, item.qty || 1)
          .input("cost", sql.Decimal(18, 2), unitPrice)
          .input("statusCode", sql.Int, currentStatusCode)
          .input(
            "userId",
            sql.UniqueIdentifier,
            toGuidOrNull(finalUserId) || DEFAULT_GUID
          )
          .input("mods", sql.NVarChar(sql.MAX), modsJSON)
          .input("comboDetailsJSON", sql.NVarChar(sql.MAX), comboDetailsJSON)
          .input(
            "orderNo",
            sql.NVarChar(20),
            String(cleanOrderNo).substring(0, 20)
          )
          .input("dishName", sql.NVarChar(200), dishName)
          .input(
            "note",
            sql.NVarChar(100),
            String(noteInfo.value || "").substring(0, 100)
          )
          .input("isTakeaway", sql.Bit, takeawayInfo.value ? 1 : 0)
         .query(`
UPDATE RestaurantOrderDetailCur
SET
    Quantity = @qty,
    PricePerUnit = @cost,
    ActualAmount = @cost * @qty,
    TotalDetailLineAmount = @cost * @qty,
    StatusCode = 1,
    Description = @dishName,
    DishName = @dishName,
    ModifiedBy = @userId,
    ModifiedOn = GETDATE(),
    ModifiersJSON = @mods,
    ComboDetailsJSON = @comboDetailsJSON,
    OrderNumber = @orderNo,
    Remarks = @note,
    isTakeAway = @isTakeaway
WHERE OrderDetailId = @detailId
  AND StatusCode NOT IN (2,3,4)
`);
      }
    } else {
      await transaction.request()
        .input("detailId", sql.UniqueIdentifier, lineItemId)
        .input("orderId", sql.UniqueIdentifier, orderGuid)
        .input("dishId", sql.UniqueIdentifier, finalProdId)
        .input("qty", sql.Int, item.qty || 1)
        .input("cost", sql.Decimal(18, 2), unitPrice)
        .input("statusCode", sql.Int, currentStatusCode)
        .input(
          "userId",
          sql.UniqueIdentifier,
          toGuidOrNull(finalUserId) || DEFAULT_GUID
        )
        .input("mods", sql.NVarChar(sql.MAX), modsJSON)
        .input("comboDetailsJSON", sql.NVarChar(sql.MAX), comboDetailsJSON)
        .input(
          "orderNo",
          sql.NVarChar(20),
          String(cleanOrderNo).substring(0, 20)
        )
        .input("bizId", sql.UniqueIdentifier, bizId)
        .input("dishName", sql.NVarChar(200), dishName)
        .input(
          "note",
          sql.NVarChar(100),
          String(noteInfo.value || "").substring(0, 100)
        )
        .input("isTakeaway", sql.Bit, takeawayInfo.value ? 1 : 0)
        .input("isProcesse", sql.Bit, 0)
        .input("isReady", sql.Bit, 0)
        .input("isDelivered", sql.Bit, 0)
        .query(`
  INSERT INTO RestaurantOrderDetailCur
  (
    OrderDetailId,
    OrderId,
    DishId,
    Description,
    DishName,
    Quantity,
    PricePerUnit,
    ActualAmount,
    TotalDetailLineAmount,
    StatusCode,
    CreatedBy,
    CreatedOn,
    ModifiersJSON,
    OrderNumber,
    Remarks,
    isTakeAway,
    BusinessUnitId,
    OrderDateTime,
    isProcesse,
    isReady,
    isDelivered,
    ComboDetailsJSON,
    start_date
  )
  VALUES
  (
    @detailId,
    @orderId,
    @dishId,
    @dishName,
    @dishName,
    @qty,
    @cost,
    @cost * @qty,
    @cost * @qty,
    1, -- Always start as 1 (NEW) so KOT printing works reliably
    @userId,
    GETDATE(),
    @mods,
    @orderNo,
    @note,
    @isTakeaway,
    @bizId,
    GETDATE(),
    0,
    0,
    0,
    @comboDetailsJSON,
       (SELECT TOP 1 StartDate
     FROM DateEntry
     ORDER BY CreatedDate DESC)
  )
`);
    }

    // 🚀 Kitchen Compatibility
    await transaction.request().input("detailId", sql.UniqueIdentifier, lineItemId).query("DELETE FROM RestaurantmodifierdetailCur WHERE OrderDetailId = @detailId");
    const modifiers = Array.isArray(item.modifiers) ? item.modifiers : [];
    if (modifiers.length > 0 || noteInfo.value) {
      let modQuery = "INSERT INTO RestaurantmodifierdetailCur (OrderDetailId, OrderId, DishId, ModifierId, Quantity, Amount, ModifierName, CreatedBy, CreatedOn) VALUES ";
      const modReq = transaction.request();
      modReq.input("detailId", sql.UniqueIdentifier, lineItemId).input("orderId", sql.UniqueIdentifier, orderGuid).input("dishId", sql.UniqueIdentifier, finalProdId).input(
        "userId",
        sql.UniqueIdentifier,
        toGuidOrNull(finalUserId) || DEFAULT_GUID
      );
      const modItems = [...modifiers];
      if (noteInfo.value) modItems.push({ ModifierId: '00000000-0000-0000-0000-000000000001', ModifierName: "INSTR: " + noteInfo.value, Price: 0, qty: item.qty || 1 });
      modItems.forEach((mod, idx) => {
        modReq.input(`mId${idx}`, sql.UniqueIdentifier, mod.ModifierId || '00000000-0000-0000-0000-000000000001');
        modReq.input(`mQty${idx}`, sql.Int, mod.qty || 1);
        modReq.input(`mAmt${idx}`, sql.Decimal(18, 2), mod.Price || 0);
        modReq.input(`mName${idx}`, sql.NVarChar(800), (mod.ModifierName || "").substring(0, 800));
        modQuery += `(@detailId, @orderId, @dishId, @mId${idx}, @mQty${idx}, @mAmt${idx}, @mName${idx}, @userId, GETDATE())${idx === modItems.length - 1 ? "" : ","}`;
      });
      await modReq.query(modQuery);
    }
  }
  await transaction.request()
    .input("orderId", sql.UniqueIdentifier, orderGuid)
    .input("entry_Status", sql.NVarChar(20), "q")
    .query(`
  UPDATE RestaurantOrderCur
  SET 
      TotalAmount = (
          SELECT ISNULL(SUM(ActualAmount), 0)
          FROM RestaurantOrderDetailCur
          WHERE OrderId = @orderId
      ),
      entry_Status = 'q',
      isOrderClosed = 0,
      StatusCode = 1
  WHERE OrderId = @orderId
`);
}

async function syncTableStatus(req, tableId) {
  if (!tableId || tableId === "undefined" || tableId === "null") return null;
  const pool = await poolPromise;
  const cleanId = String(tableId)
    .replace(/^\{|\}$/g, "")
    .trim();
  const res = await pool.request().input("tid", sql.UniqueIdentifier, cleanId).query(`
    DECLARE @ActualOrderId UNIQUEIDENTIFIER, @ActualOrderNo NVARCHAR(50), @TableNo VARCHAR(20), @count INT, @total DECIMAL(18,2);
    
    SELECT TOP 1 @TableNo = LTRIM(RTRIM(TableNumber)) FROM TableMaster WHERE TableId = @tid;

    SELECT TOP 1 @ActualOrderId = OrderId, @ActualOrderNo = OrderNumber
    FROM RestaurantOrderCur 
    WHERE LTRIM(RTRIM(Tableno)) = @TableNo
    AND (isOrderClosed = 0 OR isOrderClosed IS NULL)
    ORDER BY CreatedOn DESC;

    -- Calculate Totals strictly
    SELECT @count = COUNT(*), @total = ISNULL(SUM(ActualAmount), 0) 
    FROM RestaurantOrderDetailCur 
    WHERE OrderId = @ActualOrderId AND StatusCode <> 0;

    -- 🛡️ SHIELD 1: ATOMIC SYNC - If no items, force close the order to prevent ghosts
    IF @count = 0 AND @ActualOrderId IS NOT NULL
    BEGIN
        UPDATE RestaurantOrderCur SET isOrderClosed = 1, ModifiedOn = GETDATE() WHERE OrderId = @ActualOrderId;
        SET @ActualOrderNo = NULL;
    END

    -- Update TableMaster with DEFINITIVE state
    UPDATE TableMaster 
    SET Status = CASE 
        WHEN Status = 2 THEN 2 
        WHEN Status = 3 THEN 3
        WHEN @count > 0 THEN 1 
        ELSE 0 
    END, 
       entry_status = 'q',
        TotalAmount = @total, 
        CurrentOrderId = @ActualOrderNo,
        StartTime = CASE WHEN @count > 0 AND (StartTime IS NULL OR StartTime < '2000-01-01') THEN GETDATE() 
                         WHEN @count = 0 THEN NULL 
                         ELSE StartTime END,
        ModifiedOn = GETDATE()
    WHERE TableId = @tid;

    SELECT 
      Status, TotalAmount, CONVERT(VARCHAR, StartTime, 126) AS StartTime, 
      CurrentOrderId, TableNumber as tableNo, DiningSection as section,
      CASE 
        WHEN Status IN (1, 2, 3) AND StartTime IS NOT NULL AND DATEDIFF(MINUTE, StartTime, GETDATE()) >= 60 THEN 1 
        ELSE 0 
      END AS isOvertime,
      CASE 
        WHEN Status = 3 AND ModifiedOn IS NOT NULL AND DATEDIFF(MINUTE, ModifiedOn, GETDATE()) >= ISNULL((SELECT TOP 1 HoldOvertimeMinutes FROM CompanySettings), 30) THEN 1 
        ELSE 0 
      END AS isHoldOvertime
    FROM TableMaster WHERE TableId = @tid;
  `);
  const updated = res.recordset[0];
  if (updated) {
    const sectionMap = { "1": "SECTION_1", "2": "SECTION_2", "3": "SECTION_3", "4": "TAKEAWAY" };
    const cleanOrderId = updated.CurrentOrderId || "EMPTY";

    req.app.get("io")?.emit("table_status_updated", {
      tableId: cleanId.toLowerCase(),
      status: Number(updated.Status),
      totalAmount: Number(updated.TotalAmount) || 0,
      startTime: updated.StartTime,
      currentOrderId: cleanOrderId,
      tableNo: updated.tableNo,
      section: sectionMap[String(updated.section)] || updated.section,
      isOvertime: updated.isOvertime || 0,
      isHoldOvertime: updated.isHoldOvertime || 0
    });
  }
  return updated;
}

// Routes
router.post("/save-cart", async (req, res) => {
  try {
    const { tableId, items, userId, orderId } = req.body;
    const pool = await poolPromise;
    const cleanId = String(tableId)
      .replace(/^\{|\}$/g, "")
      .trim();
    // 🚀 UNIFIED ID: Only generate a professional ID if we actually have items to save
    let currentOrderId = orderId;
    const hasItems = items && items.length > 0;

    if (hasItems && (!currentOrderId || currentOrderId === "NEW" || currentOrderId === "#NEW" || currentOrderId === "PENDING" || currentOrderId.length < 10)) {
      currentOrderId = await getOrGenerateOrderId(req, cleanId);
    } else if (!hasItems) {
      // If saving an empty cart, we should clear the TableMaster's CurrentOrderId
      currentOrderId = null;
    }

    // const transaction = new sql.Transaction(pool);
    // await transaction.begin();
    try {
      if (hasItems) {
        await syncToProfessionalTables(
          { request: () => pool.request() },
          cleanId,
          currentOrderId,
          items || [],
          userId
        );
      }

      // 🚀 CRITICAL: Update TableMaster INSIDE the same transaction 
      // await transaction.request()
      await pool.request()
        .input("tid", sql.UniqueIdentifier, cleanId)
        .input("oid", sql.NVarChar(50), currentOrderId)
        .query(`
          UPDATE TableMaster 
          SET Status = CASE WHEN @oid IS NOT NULL THEN 1 ELSE 0 END, 
              CurrentOrderId = @oid,
               entry_status = 'q',
              StartTime = CASE WHEN @oid IS NOT NULL AND (StartTime IS NULL OR StartTime < '2000-01-01') THEN GETDATE() 
                               WHEN @oid IS NULL THEN NULL 
                               ELSE StartTime END
          WHERE TableId = @tid
        `);

      // await transaction.commit();

      res.json({ success: true, orderId: currentOrderId });

      // 🔥 LIVE SYNC: Notify all other devices that this table's cart has changed
      const io = req.app.get("io");
      if (io) {
        io.to(`table:${cleanId.toLowerCase()}`).emit("cart_updated", { tableId: cleanId, orderId: currentOrderId });
      }

      syncTableStatus(req, cleanId).catch(() => { });
    } catch (e) {
      // if (transaction._isStarted) await transaction.rollback(); 
      console.error("❌ SaveCart SQL Error:", e.message);
      res.status(500).json({ error: "DB_ERROR: " + e.message });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/send", async (req, res) => {
  try {
    const { tableId, orderId, items, userId } = req.body;

    console.log(
      "SYNC ITEMS:",
      JSON.stringify(items, null, 2)
    );
    console.log("SEND ITEMS RECEIVED:", JSON.stringify(items, null, 2));
    const pool = await poolPromise;

    let actualTableId = tableId;

    const isGuid = /^[0-9a-fA-F-]{36}$/;

    if (!isGuid.test(String(tableId))) {

      const tableLookup = await pool.request()
        .input("tableNo", sql.VarChar(50), String(tableId))
        .query(`
      SELECT TOP 1 TableId
      FROM TableMaster
      WHERE TableNumber = @tableNo
    `);

      if (tableLookup.recordset.length === 0) {
        throw new Error("Table not found");
      }

      actualTableId = tableLookup.recordset[0].TableId;
    }

    const cleanId = String(actualTableId)
      .replace(/^\{|\}$/g, "")
      .trim();

    // const transaction = new sql.Transaction(pool);
    // await transaction.begin();
    try {
      // 1. 🚀 GENERATE PROFESSIONAL ID NOW (At the moment of sending)
      //   const finalOrderId = await getOrGenerateOrderId(req, cleanId);

      let finalOrderId = orderId;

      if (
        !finalOrderId ||
        finalOrderId === "NEW" ||
        finalOrderId === "#NEW" ||
        finalOrderId === "PENDING"
      ) {
        finalOrderId = await getOrGenerateOrderId(req, cleanId);
      }

      // 2. FORCE SENT STATUS — use items from client, or fall back to DB items
      let clientItems = items || [];
      if (clientItems.length === 0) {
        // 🔥 SAFETY NET: Frontend forgot to send items. Fetch from DB.
        console.warn("⚠️ [Send] No items received from client - fetching from DB as fallback");
        const dbItems = await pool.request()
          .input("tableNo", sql.UniqueIdentifier, cleanId)
          .query(`SELECT d.OrderDetailId as lineItemId, d.DishId as id, dish.Name as name,
            d.Quantity as qty, d.PricePerUnit as price, d.StatusCode, d.ModifiersJSON, d.Remarks as note, d.isTakeAway as isTakeaway
            FROM RestaurantOrderDetailCur d
            JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
            LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
            WHERE (LTRIM(RTRIM(h.Tableno)) = (SELECT LTRIM(RTRIM(TableNumber)) FROM TableMaster WHERE TableId = @tableNo)
              OR LTRIM(RTRIM(h.Tableno)) = LTRIM(RTRIM(@tableNo))) 
              AND (h.isOrderClosed = 0 OR h.isOrderClosed IS NULL) 
             AND d.StatusCode =1`);
        clientItems = dbItems.recordset;
      }
      const sentItems = clientItems.map(item => ({
        ...item,
        status: (item.status === 'VOIDED' || item.StatusCode === 0) ? 'VOIDED' : (item.status || 'SENT')
      }));

      const alreadySent = await pool.request()
        .input("tableId", sql.UniqueIdentifier, cleanId)
        .query(`
          SELECT COUNT(*) AS cnt
          FROM RestaurantOrderDetailCur d
          JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
          WHERE
            (LTRIM(RTRIM(h.Tableno)) =
                (SELECT LTRIM(RTRIM(TableNumber))
                FROM TableMaster
                WHERE TableId = @tableId))
            AND d.StatusCode NOT IN (2,3,4)
        `);

      if (alreadySent.recordset[0].cnt === 0) {
        return res.json({
          success: false,
          message: "Order already placed by another device."
        });
      }

      // 3. FORCE SYNC with the new Professional ID
      await syncToProfessionalTables(
        { request: () => pool.request() },
        cleanId,
        finalOrderId,
        sentItems,
        userId
      );

      // 4. Lock Table to the new ID
      await pool.request()
        .input("tid", sql.UniqueIdentifier, cleanId)
        .input("oid", sql.NVarChar(50), finalOrderId)
        .query(`
          UPDATE TableMaster 
          SET Status = 1, 
              entry_status ='q',
              CurrentOrderId = @oid,
              StartTime = CASE WHEN StartTime IS NULL OR StartTime < '2000-01-01' THEN GETDATE() ELSE StartTime END,
              ModifiedOn = GETDATE()
          WHERE TableId = @tid
        `);

      //   await transaction.commit();

      res.json({ success: true, orderId: finalOrderId });

      // 🔥 REAL-TIME BROADCAST: Notify KDS and all other Waiter devices
      const io = req.app.get("io");
      if (io) {
        io.emit("new_order", {
          orderId: finalOrderId,
          context: {
            orderType: "DINE_IN",
            tableId: cleanId,
            tableNo: (await pool.request().input("tid", sql.UniqueIdentifier, cleanId).query("SELECT TableNumber FROM TableMaster WHERE TableId = @tid")).recordset[0]?.TableNumber,
            section: "SECTION_1" // Fallback, will be refined by store
          },
          items: sentItems,
          createdAt: Date.now()
        });
        io.to(`table:${cleanId.toLowerCase()}`).emit("cart_updated", { tableId: cleanId, orderId: finalOrderId });
        io.emit("kot_printed", { tableId: cleanId, orderId: finalOrderId });
      }

      // 5. Refresh totals and notify instantly
      syncTableStatus(req, cleanId).catch(() => { });
    } catch (e) {
      //   await transaction.rollback(); 
      console.error("❌ FULL SEND ERROR:", e);
      res.status(500).json({ error: "SEND_ERROR: " + e.message });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/cart/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;
    if (!tableId || tableId === "undefined" || tableId === "null" || tableId.length < 5) {
      return res.json({ items: [], currentOrderId: null });
    }
    const pool = await poolPromise;
    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();

    // Get table info (TableNumber + CurrentOrderId)
    const tableInfo = await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .query("SELECT TableNumber, CurrentOrderId FROM TableMaster WHERE TableId = @tid");

    const tableRow = tableInfo.recordset[0];
    const tableNumber = tableRow?.TableNumber;
    const currentOrderId = tableRow?.CurrentOrderId;

    // Fetch items: prioritize by CurrentOrderId, fall back to open order by TableNumber
    // 💡 LIVE SYNC: Allow TEMP- IDs so other devices can see the draft cart items!
    const isRealOrderId = currentOrderId &&
      currentOrderId !== 'PENDING' &&
      currentOrderId !== 'NEW';

    const result = await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .input("tableNo", sql.VarChar(20), String(tableNumber || ""))
      .input("orderNo", sql.NVarChar(50), isRealOrderId ? currentOrderId : "__NONE__")
      .query(`
        SELECT 
  d.OrderDetailId as lineItemId,
  d.DishId as id,
  d.Quantity as qty,
  d.PricePerUnit as price,
  d.StatusCode as statusCode,
  ISNULL(dish.Name, d.DishName) as name,
   dish.isServiceCharge AS isServiceCharge,
  d.ModifiersJSON,
  d.ComboDetailsJSON,
  d.Remarks as note,
  d.isTakeAway as isTakeaway,
  CASE d.StatusCode
    WHEN 1 THEN 'NEW'
    WHEN 2 THEN 'SENT'
    WHEN 3 THEN 'READY'
    WHEN 4 THEN 'SERVED'
    WHEN 5 THEN 'HOLD'
    WHEN 0 THEN 'VOIDED'
    ELSE 'SENT'
  END as status
FROM RestaurantOrderDetailCur d
JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
WHERE
  h.isOrderClosed = 0
  AND d.StatusCode = 1
  AND (
    h.OrderNumber = @orderNo
    OR h.OrderId = (
      SELECT TOP 1 OrderId
      FROM RestaurantOrderCur
      WHERE Tableno = @tableNo
        AND isOrderClosed = 0
      ORDER BY CreatedOn DESC
    )
  )
ORDER BY d.CreatedOn ASC
      `);

    const items = result.recordset.map((i) => ({
      ...i,
      modifiers: i.ModifiersJSON ? (() => { try { return JSON.parse(i.ModifiersJSON); } catch { return []; } })() : []
    }));

    console.log("QR CART SQL RESULT COUNT:", items.length);
    items.forEach((item) => {
      console.log("QR CART ITEM DEBUG:", {
        dishName: item.name,
        statusCode: item.statusCode,
        status: item.status
      });
    });

    console.log("QR CART RESPONSE BEFORE SEND:", items.map((item) => ({
      dishName: item.name,
      statusCode: item.statusCode,
      status: item.status,
    })));

    res.json({ items, currentOrderId: isRealOrderId ? currentOrderId : null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/cancel", async (req, res) => {
  try {
    const { orderId, tableId, reason, userId, userName } = req.body;
    const pool = await poolPromise;
    const cleanTid = String(tableId).replace(/^\{|\}$/g, "").trim();

    // 1. Fetch Order Data for Reporting
    const orderData = await pool.request()
      .input("oid", sql.NVarChar(100), orderId)
      .query(`
        SELECT h.OrderId, h.OrderNumber, h.Tableno, h.BusinessUnitId, h.CreatedBy, h.MobileNo,
               tm.DiningSection, tm.TableId
        FROM RestaurantOrderCur h
        LEFT JOIN TableMaster tm ON LTRIM(RTRIM(h.Tableno)) = LTRIM(RTRIM(tm.TableNumber))
        WHERE h.OrderNumber = @oid AND (h.isOrderClosed = 0 OR h.isOrderClosed IS NULL)
      `);

    const header = orderData.recordset[0];
    if (!header) {
      return res.status(404).json({ error: "Order not found or already closed" });
    }

    const itemsData = await pool.request()
      .input("orderId", sql.UniqueIdentifier, header.OrderId)
      .query(`
        SELECT d.*, dish.DishGroupId, dg.CategoryId, cm.CategoryName, dg.DishGroupName
        FROM RestaurantOrderDetailCur d
        LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
        LEFT JOIN DishGroupMaster dg ON dish.DishGroupId = dg.DishGroupId
        LEFT JOIN CategoryMaster cm ON dg.CategoryId = cm.CategoryId
        WHERE d.OrderId = @orderId
      `);

    const items = itemsData.recordset;
    const subTotal = items.reduce((sum, item) => sum + (item.ActualAmount || 0), 0);
    const voidQty = items.reduce((sum, item) => sum + (item.Quantity || 0), 0);

    // const transaction = new sql.Transaction(pool);
    // await transaction.begin();
    try {

      let settlementId = crypto.randomUUID();

      // 2. Insert into SettlementHeader (Cancelled Status)
      await transaction.request()
        .input("sid", sql.UniqueIdentifier, settlementId)
        .input("oid", sql.NVarChar(50), orderId)
        .input("tableNo", sql.NVarChar(50), header.Tableno)
        .input("section", sql.NVarChar(100), header.DiningSection)
        .input("userId", sql.UniqueIdentifier, toGuidOrNull(userId))
        .input("userName", sql.NVarChar(255), userName || "User")
        .input("reason", sql.NVarChar(500), reason || "Manual Cancellation")
        .input("bizId", sql.UniqueIdentifier, header.BusinessUnitId || DEFAULT_GUID)
        .input("subTotal", sql.Money, subTotal)
        .input("voidQty", sql.Int, voidQty)
        .input("voidAmt", sql.Money, subTotal)
        .input("mobile", sql.NVarChar(50), header.MobileNo)
        .query(`
          INSERT INTO SettlementHeader (
            SettlementID, LastSettlementDate, BillNo, OrderType, TableNo, Section, 
            CashierID, BusinessUnitId, SysAmount, ManualAmount, CreatedBy, CreatedOn, 
            IsCancelled, CancellationReason, CancelledDate, CancelledByUserName, 
            SubTotal, TotalTax, DiscountAmount, MobileNo, VoidItemQty, VoidItemAmount
          ) VALUES (
            @sid, GETDATE(), @oid, 'DINE-IN', @tableNo, @section, 
            @userId, @bizId, 0, 0, @userId, GETDATE(), 
            1, @reason, GETDATE(), @userName, 
            @subTotal, 0, 0, @mobile, @voidQty, @voidAmt
          )
        `);

      // 3. Insert Items into SettlementItemDetail (Marked as VOIDED)
      for (const item of items) {
        await transaction.request()
          .input("sid", sql.UniqueIdentifier, settlementId)
          .input("dishId", sql.UniqueIdentifier, item.DishId)
          .input("dishName", sql.NVarChar(255), item.DishName)
          .input("qty", sql.Int, item.Quantity)
          .input("price", sql.Decimal(18, 2), item.PricePerUnit)
          .input("catId", sql.UniqueIdentifier, item.CategoryId)
          .input("catName", sql.NVarChar(255), item.CategoryName)
          .input("groupName", sql.NVarChar(255), item.DishGroupName)
          .query(`
            INSERT INTO SettlementItemDetail (
              SettlementID, DishId, DishName, Qty, Price, Status, OrderDateTime,
              CategoryId, CategoryName, SubCategoryName
            ) VALUES (
              @sid, @dishId, @dishName, @qty, @price, 'VOIDED', GETDATE(),
              @catId, @catName, @groupName
            )
          `);
      }

      // 4. Update Current Tables (StatusCode 4 = Cancelled)
      await transaction.request()
        .input("oid", sql.NVarChar(50), orderId)
        .query(`
          UPDATE RestaurantOrderCur SET StatusCode = 4, isOrderClosed = 1, ModifiedOn = GETDATE() WHERE OrderNumber = @oid;
          UPDATE RestaurantOrderDetailCur SET StatusCode = 0, ModifiedOn = GETDATE() WHERE OrderId IN (SELECT OrderId FROM RestaurantOrderCur WHERE OrderNumber = @oid);
        `);

      await transaction.request()
        .input("tid", sql.VarChar(50), cleanTid)
        .query("UPDATE TableMaster SET Status = 0, TotalAmount = 0, StartTime = NULL, CurrentOrderId = NULL, ModifiedOn = GETDATE() WHERE TableId = @tid");

      await transaction.commit();

      req.app.get("io")?.emit("table_status_updated", { tableId: cleanTid, status: 0, totalAmount: 0 });
      req.app.get("io")?.emit("order_closed", { tableId: cleanTid, orderId: orderId });

      res.json({ success: true });
    } catch (e) {
      await transaction.rollback();
      console.error("❌ Cancel Error:", e.message);
      res.status(500).json({ error: e.message });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/complete", async (req, res) => {
  try {
    const { tableId, userId } = req.body;
    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();
    const pool = await poolPromise;

    // Final atomic update: Close the professional order and release the table
    await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .query(`
        UPDATE RestaurantOrderCur SET isOrderClosed = 1, ModifiedOn = GETDATE() 
        WHERE LTRIM(RTRIM(Tableno)) = (SELECT TOP 1 LTRIM(RTRIM(TableNumber)) FROM TableMaster WHERE TableId = @tid) 
        AND (isOrderClosed = 0 OR isOrderClosed IS NULL);
        
        UPDATE TableMaster SET Status = 0, CurrentOrderId = NULL, StartTime = NULL, TotalAmount = 0, ModifiedOn = GETDATE() WHERE TableId = @tid;
      `);

    const updated = await syncTableStatus(req, cleanId);

    // 🔥 UNIFIED SIGNAL: Use order_status_update for consistency
    const io = req.app.get("io");
    if (io) {
      req.app.get("io")?.to(`table:${cleanId.toLowerCase()}`).emit("order_closed", { tableId: cleanId });
      req.app.get("io")?.emit("order_status_update", {
        tableId: cleanId,
        action: "CLOSE",
        orderId: updated?.CurrentOrderId
      });
    }
    res.json({ success: true, ...updated });
  } catch (err) {
    console.error("❌ Complete Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/hold", async (req, res) => {
  try {
    const { tableId } = req.body;
    const pool = await poolPromise;
    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();

    // Set status to 3 (Hold)
    await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .query(`
        UPDATE TableMaster 
        SET Status = 3, 
         entry_status = 'q',
            ModifiedOn = GETDATE() 
        WHERE TableId = @tid
      `);

    const updated = await syncTableStatus(req, cleanId);
    res.json({ success: true, ...updated });
  } catch (err) {
    console.error("❌ Hold Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/checkout", async (req, res) => {
  try {
    const { tableId } = req.body;
    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();
    const pool = await poolPromise;

    // Step 1: Move table to Payment Pending (Status 2) and mark items as SERVED (4)
    await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .query(`
        -- 1. Update Table Status to Checkout (2)
        UPDATE TableMaster SET Status = 2,  entry_status = 'q', ModifiedOn = GETDATE() WHERE TableId = @tid;

        -- 2. Mark all active items for this table as SERVED (4) so they leave KDS
        UPDATE d
        SET d.StatusCode = 4, d.ModifiedOn = GETDATE(), entry_status = 'q'
        FROM RestaurantOrderDetailCur d
        JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId
        JOIN TableMaster tm ON LTRIM(RTRIM(h.Tableno)) = LTRIM(RTRIM(tm.TableNumber))
        WHERE tm.TableId = @tid 
        AND (h.isOrderClosed = 0 OR h.isOrderClosed IS NULL)
        AND d.StatusCode IN (1, 2, 3, 5);
      `);

    const updated = await syncTableStatus(req, cleanId);

    // 🔥 KDS & GLOBAL SYNC: Harmonized signals
    const io = req.app.get("io");
    if (io) {
      req.app.get("io")?.to(`table:${cleanId.toLowerCase()}`).emit("order_closed", {
        tableId: cleanId,
        tableNo: updated?.tableNo,
        section: updated?.section
      });
      io.emit("order_status_update", {
        tableId: cleanId,
        action: "CLOSE",
        orderId: updated?.CurrentOrderId
      });
    }

    res.json({ success: true, ...updated });
  } catch (err) {
    console.error("❌ Checkout Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/remove-item", async (req, res) => {
  try {
    const { tableId, itemId, qtyToVoid, reason } = req.body;
    const userId = req.body.userId || DEFAULT_GUID;
    const pool = await poolPromise;
    // const transaction = new sql.Transaction(pool);
    // await transaction.begin();
    try {
      // Professional Voiding
      await transaction.request().input("itemId", sql.UniqueIdentifier, itemId).input("userId", sql.UniqueIdentifier, userId).input("reason", sql.NVarChar(255), reason || "").query(`
        UPDATE RestaurantOrderDetailCur 
        SET StatusCode = 0, ModifiedBy = @userId, ModifiedOn = GETDATE(), Remarks = ISNULL(Remarks, '') + ' (VOID: ' + @reason + ')'
        WHERE OrderDetailId = @itemId
      `);
      await transaction.commit();

      // 🚀 Refresh total immediately
      syncTableStatus(req, tableId).catch(() => { });

      req.app.get("io")?.emit("cart_updated", { tableId });
      res.json({ success: true });
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/update-item-status", async (req, res) => {
  try {
    const { lineItemId, status, tableId } = req.body;
    const pool = await poolPromise;
    const statusMap = { 'NEW': 1, 'SENT': 2, 'READY': 3, 'SERVED': 4, 'HOLD': 5, 'VOIDED': 0 };

    // Fetch orderNumber first so we can emit it
    const orderRes = await pool.request()
      .input("id", sql.UniqueIdentifier, lineItemId)
      .query("SELECT h.OrderNumber FROM RestaurantOrderDetailCur d JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId WHERE d.OrderDetailId = @id");

    const orderId = orderRes.recordset[0]?.OrderNumber;

    await pool.request()
      .input("id", sql.UniqueIdentifier, lineItemId)
      .input("code", sql.Int, statusMap[status] || 2)
      .query("UPDATE RestaurantOrderDetailCur SET StatusCode = @code, ModifiedOn = GETDATE() WHERE OrderDetailId = @id AND StatusCode <> 4 and StatusCode <> 3 and StatusCode <> 2");

    req.app.get("io")?.emit("item_status_updated", { lineItemId, status, tableId, orderId });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/active-kitchen", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        d.OrderDetailId as lineItemId, d.DishId as id, d.Quantity as qty, d.StatusCode, 
        h.OrderNumber as orderId, dish.Name as name, LTRIM(RTRIM(h.Tableno)) as tableNo, 
        d.Remarks as note, d.ModifiersJSON, d.isTakeAway, DATEDIFF(SECOND, d.CreatedOn, GETDATE()) as elapsedSeconds,
        ISNULL(ckt.KitchenTypeCode, '0') as KitchenTypeCode, 
        ISNULL(ISNULL(ckt.KitchenTypeName, cat.CategoryName), 'General') as KitchenTypeName,
        pm.PrinterName,
        pm.PrinterPath as PrinterIP,
        tm.TableId, tm.DiningSection
      FROM RestaurantOrderDetailCur d 
      JOIN RestaurantOrderCur h ON d.OrderId = h.OrderId 
      LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
      LEFT JOIN DishGroupMaster dgm ON dish.DishGroupId = dgm.DishGroupId
      LEFT JOIN CategoryMaster cat ON dgm.CategoryId = cat.CategoryId
      LEFT JOIN CategoryKitchenType ckt ON dgm.CategoryId = ckt.CategoryId
      LEFT JOIN PrintMaster pm ON CAST(ckt.KitchenTypeCode AS VARCHAR(50)) = CAST(pm.KitchenTypeValue AS VARCHAR(50))
      LEFT JOIN TableMaster tm ON LTRIM(RTRIM(h.Tableno)) = LTRIM(RTRIM(tm.TableNumber))
      WHERE (h.isOrderClosed = 0 OR h.isOrderClosed IS NULL)
      AND (d.StatusCode IN (2,3,5) OR (d.StatusCode = 0 AND DATEDIFF(MINUTE, d.ModifiedOn, GETDATE()) < 10))
      AND h.OrderNumber IS NOT NULL
      AND h.OrderNumber NOT LIKE 'TEMP-%'
      AND h.OrderNumber NOT IN ('PENDING', 'NEW', '#NEW', '')
      ORDER BY d.CreatedOn ASC
    `);
    const orders = {};
    result.recordset.forEach(row => {
      if (!orders[row.orderId]) {
        const isTakeaway = !row.tableNo || row.tableNo === 'TAKEAWAY' || String(row.tableNo).startsWith('TW');
        orders[row.orderId] = {
          orderId: row.orderId,
          context: {
            orderType: isTakeaway ? 'TAKEAWAY' : 'DINE_IN',
            tableId: row.TableId,
            tableNo: isTakeaway ? null : row.tableNo,
            section: row.DiningSection || "",
            takeawayNo: isTakeaway ? (row.tableNo === 'TAKEAWAY' ? row.orderId.slice(-4) : row.tableNo) : null
          },
          items: [],
          createdAt: Date.now() - (row.elapsedSeconds * 1000)
        };
      }
      const statusMap = { 1: 'NEW', 2: 'SENT', 3: 'READY', 4: 'SERVED', 5: 'HOLD' };
      orders[row.orderId].items.push({
        ...row,
        status: statusMap[row.StatusCode],
        modifiers: row.ModifiersJSON ? JSON.parse(row.ModifiersJSON) : []
      });
    });
    res.json({ serverTime: Date.now(), orders: Object.values(orders) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/log-print", async (req, res) => {
  try {
    const { orderId, orderNumber, printType } = req.body;
    const pool = await poolPromise;
    await pool.request().input("oid", sql.UniqueIdentifier, orderId && orderId.length > 30 ? orderId : null).input("ono", sql.VarChar(50), orderNumber).input("pt", sql.Int, printType || 1).query("INSERT INTO PrintReport (OrderId, Ordernumber, PrintType, orderDate) VALUES (@oid, @ono, @pt, GETDATE())");
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/delete-cart-item", async (req, res) => {

  try {

    const { lineItemId, tableId } = req.body;

    if (!lineItemId) {
      return res.status(400).json({
        success: false,
        error: "lineItemId missing"
      });
    }

    const pool = await poolPromise;

    // 1. Get the OrderId before deleting (needed for total recalc)
    const itemCheck = await pool.request()
      .input("detailId", sql.UniqueIdentifier, lineItemId)
      .query("SELECT OrderId FROM RestaurantOrderDetailCur WHERE OrderDetailId = @detailId");

    const orderId = itemCheck.recordset[0]?.OrderId;

    // 2. Delete modifiers for this line item first
    await pool.request()
      .input("detailId", sql.UniqueIdentifier, lineItemId)
      .query("DELETE FROM RestaurantmodifierdetailCur WHERE OrderDetailId = @detailId");

    // 3. Delete the line item itself
    await pool.request()
      .input("detailId", sql.UniqueIdentifier, lineItemId)
      .query("DELETE FROM RestaurantOrderDetailCur WHERE OrderDetailId = @detailId");

    // 4. Recalculate order total
    if (orderId) {
      await pool.request()
        .input("orderId", sql.UniqueIdentifier, orderId)
        .query(`
          UPDATE RestaurantOrderCur
          SET TotalAmount = (
            SELECT ISNULL(SUM(ActualAmount), 0)
            FROM RestaurantOrderDetailCur
            WHERE OrderId = @orderId AND StatusCode <> 0
          )
          WHERE OrderId = @orderId
        `);
    }

    res.json({ success: true });

    // 5. Sync table status and broadcast (fire-and-forget after response)
    if (tableId) {
      const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();
      syncTableStatus(req, cleanId).catch(() => { });
      const io = req.app.get("io");
      if (io) {
        req.app.get("io")?.to(`table:${cleanId.toLowerCase()}`).emit("cart_updated", { tableId: cleanId });
      }
    }

  } catch (err) {

    console.log("DELETE CART ITEM ERROR:", err);

    res.status(500).json({
      success: false,
      error: err.message
    });

  }

});

router.get("/order-details/:orderId", async (req, res) => {

  try {

    const { orderId } = req.params;

    const pool = await poolPromise;

    const result = await pool.request()
      .input("orderNo", sql.NVarChar(50), orderId)
      .query(`
        SELECT
            o.Tableno,
            o.OrderDateTime,
            o.OrderNumber,

            CASE
                WHEN d.StatusCode = '2' THEN 'PREPARING'
                WHEN d.StatusCode = '3' THEN 'READY'
                WHEN d.StatusCode = '1' THEN 'PREPARING'
                ELSE 'UNKNOWN'
            END AS StatusLabel,

            d.Description,
            d.DishName,
            d.Quantity,
            d.PricePerUnit AS Price,
             d.ComboDetailsJSON,
             d.ModifiersJSON


        FROM RestaurantOrderCur o

        INNER JOIN RestaurantOrderDetailCur d
            ON o.OrderId = d.OrderId

        WHERE ISNULL(d.isDelivered, 0) = 0
          AND d.StatusCode IN ('1','2', '3')
          AND o.entry_status = 'q'
          AND d.OrderNumber = @orderNo

        ORDER BY o.OrderDateTime ASC
      `);

    res.json(result.recordset);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      success: false,
      error: err.message
    });

  }

});

//online payment process
router.post("/payment-status", async (req, res) => {
  try {
    const { tableId, paymentStatus } = req.body;
    const pStatus = paymentStatus !== undefined ? paymentStatus : 1;
    const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();

    const pool = await poolPromise;

    await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .input("pStatus", sql.Int, pStatus)
      .query(`
        UPDATE TableMaster
       SET PAYMENT_STATUS = @pStatus,
            Status = 1,
            entry_status = 'q',
            ModifiedOn = GETDATE()
        WHERE TableId = @tid
      `);

    res.json({
      success: true
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      error: err.message
    });

  }

});

router.post("/mark-sent", async (req, res) => {
  try {
    const { orderId } = req.body;

    const pool = await poolPromise;

    const appSettings = await pool.request().query(`
      SELECT TOP 1 Enablekotqr
      FROM AppSettings
    `);

    const enableKotQr = Number(appSettings.recordset[0]?.Enablekotqr || 0);

    const finalStatusCode = enableKotQr === 1 ? 2 : 1;

    console.log("Enablekotqr =", enableKotQr);
    console.log("Final Status =", finalStatusCode);

    if (enableKotQr === 1) {
      try {
        await generateAndQueueKOTs(orderId);
      } catch (err) {
        console.error("Failed to queue KOT for mark-sent:", err);
      }
    }

    const result = await pool.request()
      .input("orderNo", sql.NVarChar(50), orderId)
      .input("statusCode", sql.Int, finalStatusCode)
      .query(`
        UPDATE RestaurantOrderDetailCur
        SET StatusCode = @statusCode
        WHERE OrderNumber = @orderNo
          AND StatusCode <> 0
          AND StatusCode <> 4
          AND StatusCode <> 3
          AND StatusCode <> 2
      `);

    console.log("Rows Updated:", result.rowsAffected);

    if (enableKotQr === 1 && req.io) {
      req.io.emit("qr-print-request", {
        orderId: orderId,
        source: "QR",
        paymentType: "cashier",
        printKOT: true,
        printBill: false
      });
    }

    res.json({
      success: true
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Unified complete-online-payment endpoint
// Performs: StatusCode=2 + SettlementHeader + SettlementItemDetail + table cleanup
// routes/order.js - FIXED complete-online-payment
router.post("/complete-online-payment", async (req, res) => {
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    const { orderId, tableNo, tableId, totalAmount, cart, paymentMethod } = req.body;

    console.log("🔍 [PAYMENT] complete-online-payment called", {
      orderId,
      tableNo,
      tableId,
      totalAmount,
      paymentMethod,
      cartLength: cart?.length || 0
    });

    if (!orderId) {
      return res.status(400).json({ success: false, error: "orderId is required" });
    }

    const cleanTableId = tableId ? String(tableId).replace(/^\{|\}$/g, "").trim() : null;
    const amount = parseFloat(totalAmount) || 0;
    const pMethod = (paymentMethod || "ONLINE").toUpperCase();
    const settlementId = crypto.randomUUID();

    // Generate and queue KOT for any newly added items (StatusCode = 1) before they are updated to 2
    try {
      await generateAndQueueKOTs(orderId);
    } catch (err) {
      console.error("Failed to queue KOT for online payment:", err);
    }

    await transaction.begin();

    // ── STEP 0: FETCH ACTIVE BUSINESS START DATE ──────────────────────────────
    const activeDateRes = await transaction.request().query(`
      SELECT TOP 1 start_date FROM RestaurantOrderCur WHERE start_date IS NOT NULL ORDER BY CreatedOn DESC
    `);
    const activeStartDate = activeDateRes.recordset[0]?.start_date || new Date();

    // ── STEP 1: GET OR CREATE ORDER ──────────────────────────────────────────
    let orderHeaderRes = await transaction.request()
      .input("orderNo", sql.NVarChar(50), orderId)
      .query(`
                SELECT TOP 1
                    h.OrderId, h.OrderNumber, h.Tableno, h.BusinessUnitId, h.MobileNo,
                    tm.DiningSection
                FROM RestaurantOrderCur h
                LEFT JOIN TableMaster tm ON LTRIM(RTRIM(h.Tableno)) = LTRIM(RTRIM(tm.TableNumber))
                WHERE h.OrderNumber = @orderNo
            `);

    let header = orderHeaderRes.recordset[0];
    let guidOrderId;
    let businessUnitId;

    if (!header) {
      console.log("⚠️ [PAYMENT] Order not found, creating new...");

      // Get BusinessUnitId
      const bizCheck = await transaction.request()
        .query("SELECT TOP 1 BusinessUnitId FROM RestaurantOrderCur WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'");
      businessUnitId = bizCheck.recordset[0]?.BusinessUnitId || DEFAULT_GUID;

      // Get TableNumber
      let tableNumber = tableNo || "TAKEAWAY";
      if (cleanTableId) {
        const tableInfo = await transaction.request()
          .input("tid", sql.UniqueIdentifier, cleanTableId)
          .query("SELECT TableNumber FROM TableMaster WHERE TableId = @tid");
        if (tableInfo.recordset.length > 0) {
          tableNumber = tableInfo.recordset[0].TableNumber;
        }
      }

      guidOrderId = crypto.randomUUID();
      await transaction.request()
        .input("orderId", sql.UniqueIdentifier, guidOrderId)
        .input("orderNo", sql.NVarChar(50), orderId)
        .input("tableNo", sql.VarChar(20), tableNumber)
        .input("bizId", sql.UniqueIdentifier, businessUnitId)
        .input("userId", sql.UniqueIdentifier, DEFAULT_GUID)
        .query(`
                    INSERT INTO RestaurantOrderCur (
                        OrderId, OrderNumber, OrderDateTime, Tableno, StatusCode, 
                        CreatedBy, CreatedOn, BusinessUnitId, isOrderClosed, entry_Status
                    ) VALUES (
                        @orderId, @orderNo, GETDATE(), @tableNo, 1, 
                        @userId, GETDATE(), @bizId, 0, 'q'
                    )
                `);
    } else {
      guidOrderId = header.OrderId;
      businessUnitId = header.BusinessUnitId || DEFAULT_GUID;
    }

    console.log(`🔍 [PAYMENT] Using OrderId: ${guidOrderId}`);

    // ── STEP 2: UPDATE ORDER STATUS ──────────────────────────────────────────
    await transaction.request()
      .input("orderNo", sql.NVarChar(50), orderId)
      .query(`
                UPDATE RestaurantOrderDetailCur
                SET StatusCode = 2, ModifiedOn = GETDATE()
                WHERE OrderNumber = @orderNo
                  AND StatusCode NOT IN (0,3,4)
            `);

    // ── STEP 3: GET OR CREATE ITEMS ──────────────────────────────────────────
    let itemsRes = await transaction.request()
      .input("orderId", sql.UniqueIdentifier, guidOrderId)
      .query(`
                SELECT
                    d.DishId, d.DishName, d.Quantity, d.PricePerUnit,
                    d.TotalDetailLineAmount, d.StatusCode,
                    dish.DishGroupId,
                    dg.CategoryId,
                    cm.CategoryName,
                    dg.DishGroupName
                FROM RestaurantOrderDetailCur d
                LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
                LEFT JOIN DishGroupMaster dg ON dish.DishGroupId = dg.DishGroupId
                LEFT JOIN CategoryMaster cm ON dg.CategoryId = cm.CategoryId
                WHERE d.OrderId = @orderId
                  AND d.StatusCode NOT IN (0)
            `);

    let dbItems = itemsRes.recordset;

    // If no items found, create from cart
    // if (dbItems.length === 0 && cart && cart.length > 0) {
    //   console.log(`⚠️ [PAYMENT] No items found, creating ${cart.length} items from cart`);

    //   for (const item of cart) {
    //     const itemId = crypto.randomUUID();
    //     const dishId = item.id || item.DishId || DEFAULT_GUID;
    //     const dishName = item.name || item.Name || "Unknown";
    //     const qty = item.qty || 1;
    //     const price = item.price || item.Price || 0;

    //     await transaction.request()
    //       .input("detailId", sql.UniqueIdentifier, itemId)
    //       .input("orderId", sql.UniqueIdentifier, guidOrderId)
    //       .input("dishId", sql.UniqueIdentifier, dishId)
    //       .input("dishName", sql.NVarChar(255), dishName)
    //       .input("qty", sql.Int, qty)
    //       .input("price", sql.Decimal(18, 2), price)
    //       .input("bizId", sql.UniqueIdentifier, businessUnitId)
    //       .input("orderNo", sql.NVarChar(50), orderId)
    //       .input("userId", sql.UniqueIdentifier, DEFAULT_GUID)
    //       .query(`
    //                     INSERT INTO RestaurantOrderDetailCur (
    //                         OrderDetailId, OrderId, DishId, DishName, Quantity, PricePerUnit,
    //                         ActualAmount, TotalDetailLineAmount, StatusCode, CreatedOn,
    //                         BusinessUnitId, OrderNumber, CreatedBy, Description
    //                     ) VALUES (
    //                         @detailId, @orderId, @dishId, @dishName, @qty, @price,
    //                         @price * @qty, @price * @qty, 2, GETDATE(),
    //                         @bizId, @orderNo, @userId, @dishName
    //                     )
    //                 `);
    //   }

    //   // Re-fetch items
    //   itemsRes = await transaction.request()
    //     .input("orderId", sql.UniqueIdentifier, guidOrderId)
    //     .query(`
    //                 SELECT
    //                     d.DishId, d.DishName, d.Quantity, d.PricePerUnit,
    //                     d.TotalDetailLineAmount, d.StatusCode,
    //                     dish.DishGroupId,
    //                     dg.CategoryId,
    //                     cm.CategoryName,
    //                     dg.DishGroupName
    //                 FROM RestaurantOrderDetailCur d
    //                 LEFT JOIN DishMaster dish ON d.DishId = dish.DishId
    //                 LEFT JOIN DishGroupMaster dg ON dish.DishGroupId = dg.DishGroupId
    //                 LEFT JOIN CategoryMaster cm ON dg.CategoryId = cm.CategoryId
    //                 WHERE d.OrderId = @orderId
    //                   AND d.StatusCode NOT IN (0)
    //             `);
    //   dbItems = itemsRes.recordset;
    // }

    const subTotal = dbItems.reduce((sum, i) => sum + (i.TotalDetailLineAmount || 0), 0);
    console.log(`🔍 [PAYMENT] Found ${dbItems.length} items, SubTotal: ${subTotal}`);

    // ── STEP 4: UPSERT SETTLEMENT HEADER ─────────────────────────────────────
    const tableNoValue = tableNo || header?.Tableno || null;
    const sectionValue = header?.DiningSection || null;

    const existingSettlement = await transaction.request()
      .input("oid", sql.NVarChar(50), orderId)
      .query("SELECT SettlementID FROM SettlementHeader WHERE BillNo = @oid");

    let isSettlementExists = false;
    if (existingSettlement.recordset.length > 0) {
      settlementId = existingSettlement.recordset[0].SettlementID;
      isSettlementExists = true;
    }

    if (isSettlementExists) {
      await transaction.request()
        .input("sid", sql.UniqueIdentifier, settlementId)
        .input("tableNo", sql.NVarChar(50), tableNoValue)
        .input("section", sql.NVarChar(100), sectionValue)
        .input("bizId", sql.UniqueIdentifier, businessUnitId)
        .input("subTotal", sql.Money, subTotal || amount)
        .input("sysAmount", sql.Money, amount)
        .input("mobile", sql.NVarChar(50), header?.MobileNo || null)
        .input("payMode", sql.NVarChar(50), pMethod)
        .input("userId", sql.UniqueIdentifier, DEFAULT_GUID)
        .query(`
                  UPDATE SettlementHeader
                  SET LastSettlementDate = GETDATE(), TableNo = @tableNo, Section = @section,
                      BusinessUnitId = @bizId, SysAmount = @sysAmount, ManualAmount = @sysAmount,
                      SubTotal = @subTotal, MobileNo = @mobile, PayMode = @payMode
                  WHERE SettlementID = @sid
              `);
      console.log(`✅ [PAYMENT] SettlementHeader updated: ${settlementId}`);
    } else {
      await transaction.request()
        .input("sid", sql.UniqueIdentifier, settlementId)
        .input("oid", sql.NVarChar(50), orderId)
        .input("tableNo", sql.NVarChar(50), tableNoValue)
        .input("section", sql.NVarChar(100), sectionValue)
        .input("bizId", sql.UniqueIdentifier, businessUnitId)
        .input("subTotal", sql.Money, subTotal || amount)
        .input("sysAmount", sql.Money, amount)
        .input("mobile", sql.NVarChar(50), header?.MobileNo || null)
        .input("payMode", sql.NVarChar(50), pMethod)
        .input("userId", sql.UniqueIdentifier, DEFAULT_GUID)
        .input("startDate", sql.DateTime, activeStartDate)
        .query(`
                  INSERT INTO SettlementHeader (
                      SettlementID, LastSettlementDate, BillNo, OrderType, TableNo, Section,
                      BusinessUnitId, SysAmount, ManualAmount, CreatedOn,
                      SubTotal, TotalTax, DiscountAmount, MobileNo, IsCancelled,
                      CreatedBy, start_date
                  ) VALUES (
                      @sid, GETDATE(), @oid, 'DINE-IN', @tableNo, @section,
                      @bizId, @sysAmount, @sysAmount, GETDATE(),
                      @subTotal, 0, 0, @mobile, 0,
                      @userId, @startDate
                  )
              `);
      console.log(`✅ [PAYMENT] SettlementHeader inserted: ${settlementId}`);
    }

    // ── STEP 5: UPSERT SETTLEMENT ITEM DETAILS ──────────────────────────────
    // ✅ FIXED: Removed TotalAmount column and clear existing details if update
    if (isSettlementExists) {
      await transaction.request()
        .input("sid", sql.UniqueIdentifier, settlementId)
        .query("DELETE FROM SettlementItemDetail WHERE SettlementID = @sid");
    }

    for (const item of dbItems) {
      await transaction.request()
        .input("sid", sql.UniqueIdentifier, settlementId)
        .input("dishId", sql.UniqueIdentifier, item.DishId || null)
        .input("dishName", sql.NVarChar(255), item.DishName || "Unknown")
        .input("qty", sql.Int, item.Quantity || 1)
        .input("price", sql.Decimal(18, 2), item.PricePerUnit || 0)
        .input("catId", sql.UniqueIdentifier, item.CategoryId || null)
        .input("catName", sql.NVarChar(255), item.CategoryName || "")
        .input("groupName", sql.NVarChar(255), item.DishGroupName || "")
        .input("startDate", sql.DateTime, activeStartDate)
        .query(`
                    INSERT INTO SettlementItemDetail (
                        SettlementID, DishId, DishName, Qty, Price, Status, OrderDateTime,
                        CategoryId, CategoryName, SubCategoryName, start_date
                    ) VALUES (
                        @sid, @dishId, @dishName, @qty, @price, 'NORMAL', GETDATE(),
                        @catId, @catName, @groupName, @startDate
                    )
                `);
    }
    console.log(`✅ [PAYMENT] ${dbItems.length} SettlementItemDetail(s) inserted`);

    // ── STEP 6: UPSERT PAYMENT DETAIL ────────────────────────────────────────
    const paymodeRes = await transaction.request()
      .input("payMode", sql.NVarChar(50), 'Online')
      .query(`SELECT TOP 1 Position FROM Paymode WHERE UPPER(LTRIM(RTRIM(PayMode))) = UPPER(LTRIM(RTRIM(@payMode)))`);
    const paymodePosition = paymodeRes.recordset[0]?.Position || 3;

    const existingPayment = await transaction.request()
      .input("orderId", sql.UniqueIdentifier, guidOrderId)
      .query("SELECT PaymentId FROM PaymentDetailCur WHERE OrderId = @orderId");

    if (existingPayment.recordset.length > 0) {
      await transaction.request()
        .input("orderId", sql.UniqueIdentifier, guidOrderId)
        .input("paymode", sql.Int, paymodePosition)
        .input("amount", sql.Decimal(18, 2), amount)
        .input("userId", sql.UniqueIdentifier, DEFAULT_GUID)
        .input("startDate", sql.DateTime, activeStartDate)
        .query(`
                  UPDATE PaymentDetailCur
                  SET PaymentCollectedOn = GETDATE(), Paymode = @paymode, Amount = @amount, ModifiedBy = @userId, ModifiedOn = GETDATE(), start_date = @startDate
                  WHERE OrderId = @orderId
              `);
      console.log(`✅ [PAYMENT] PaymentDetailCur updated`);
    } else {
      await transaction.request()
        .input("paymentId", sql.UniqueIdentifier, settlementId)
        .input("restaurantBillId", sql.UniqueIdentifier, settlementId)
        .input("orderId", sql.UniqueIdentifier, guidOrderId)
        .input("paymode", sql.Int, paymodePosition)
        .input("amount", sql.Decimal(18, 2), amount)
        .input("bizId", sql.UniqueIdentifier, businessUnitId)
        .input("userId", sql.UniqueIdentifier, DEFAULT_GUID)
        .input("startDate", sql.DateTime, activeStartDate)
        .query(`
                  INSERT INTO PaymentDetailCur (
                      PaymentId, RestaurantBillId, OrderId, BilledFor, 
                      PaymentCollectedOn, PaymentType, Paymode, Amount,
                      BusinessUnitId, CreatedBy, CreatedOn, ModifiedBy, ModifiedOn, start_date
                  ) VALUES (
                      @paymentId, @restaurantBillId, @orderId, 1,
                      GETDATE(), 1, @paymode, @amount,
                      @bizId, @userId, GETDATE(), @userId, GETDATE(), @startDate
                  ) 
              `);
      console.log(`✅ [PAYMENT] PaymentDetailCur inserted`);
    }

    // ── STEP 6.5: UPSERT SETTLEMENT TOTAL SALES ────────────────────────────
    const existingSts = await transaction.request()
      .input("sid", sql.UniqueIdentifier, settlementId)
      .query("SELECT SettlementID FROM SettlementTotalSales WHERE SettlementID = @sid");

    if (existingSts.recordset.length > 0) {
      await transaction.request()
        .input("sid", sql.UniqueIdentifier, settlementId)
        .input("amount", sql.Money, amount)
        .input("paymode", sql.NVarChar(50), pMethod)
        .query(`
          UPDATE SettlementTotalSales 
          SET PayMode = @paymode, SysAmount = @amount, ManualAmount = @amount
          WHERE SettlementID = @sid
        `);
    } else {
      await transaction.request()
        .input("sid", sql.UniqueIdentifier, settlementId)
        .input("amount", sql.Money, amount)
        .input("paymode", sql.NVarChar(50), pMethod)
        .query(`
          INSERT INTO SettlementTotalSales (SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff, ReceiptCount)
          VALUES (@sid, @paymode, @amount, @amount, 0, 1)
        `);
    }
    console.log(`✅ [PAYMENT] SettlementTotalSales inserted/updated`);

    // ── STEP 7: UPDATE TABLE MASTER (VACANT / CLOSED) ───────────────────────
    if (cleanTableId) {
      await transaction.request()
        .input("tid", sql.UniqueIdentifier, cleanTableId)
        .query(`
                    UPDATE TableMaster
                    SET PAYMENT_STATUS = 1,
                        Status = 0,
                        entry_status = 'q',
                        ModifiedOn = GETDATE()
                    WHERE TableId = @tid
                `);
      console.log(`✅ [PAYMENT] TableMaster updated (Status=0 Vacant)`);
    }

    // ── STEP 8: ARCHIVE ORDER ────────────────────────────────────────────────
    // ✅ FIXED: Check if TotalAmount column exists in RestaurantOrder
    await transaction.request()
      .input("orderNo", sql.NVarChar(50), orderId)
      .input("totalAmt", sql.Decimal(18, 2), amount)
      .query(`
                -- Update RestaurantOrderCur TotalAmount
                UPDATE RestaurantOrderCur SET TotalAmount = @totalAmt, ModifiedOn = GETDATE() 
                WHERE OrderNumber = @orderNo;

                -- Archive to RestaurantOrder (if not exists)
                IF NOT EXISTS (SELECT 1 FROM RestaurantOrder WHERE OrderNumber = @orderNo)
                BEGIN
                    -- ✅ Check if TotalAmount column exists in RestaurantOrder
                    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('RestaurantOrder') AND name = 'TotalAmount')
                    BEGIN
                        INSERT INTO RestaurantOrder (
                            OrderId, OrderNumber, OrderDateTime, Tableno, StatusCode, 
                            CreatedBy, CreatedOn, BusinessUnitId, isOrderClosed, TotalAmount
                        )
                        SELECT 
                            OrderId, OrderNumber, OrderDateTime, Tableno, 3, 
                            CreatedBy, CreatedOn, BusinessUnitId, 1, TotalAmount
                        FROM RestaurantOrderCur WHERE OrderNumber = @orderNo;
                    END
                    ELSE
                    BEGIN
                        INSERT INTO RestaurantOrder (
                            OrderId, OrderNumber, OrderDateTime, Tableno, StatusCode, 
                            CreatedBy, CreatedOn, BusinessUnitId, isOrderClosed
                        )
                        SELECT 
                            OrderId, OrderNumber, OrderDateTime, Tableno, 3, 
                            CreatedBy, CreatedOn, BusinessUnitId, 1
                        FROM RestaurantOrderCur WHERE OrderNumber = @orderNo;
                    END
                END

                -- Archive details (only rows not already archived)
                INSERT INTO RestaurantOrderDetail (
                    OrderDetailId, OrderId, DishId, Description, DishName, Quantity, 
                    PricePerUnit, ActualAmount, TotalDetailLineAmount, StatusCode, 
                    CreatedBy, CreatedOn, BusinessUnitId, OrderDateTime
                )
                SELECT 
                    d.OrderDetailId, d.OrderId, d.DishId, d.Description, d.DishName, d.Quantity, 
                    d.PricePerUnit, d.ActualAmount, d.TotalDetailLineAmount, 3, 
                    d.CreatedBy, d.CreatedOn, d.BusinessUnitId, d.OrderDateTime
                FROM RestaurantOrderDetailCur d
                WHERE d.OrderId = (SELECT OrderId FROM RestaurantOrderCur WHERE OrderNumber = @orderNo)
                  AND NOT EXISTS (
                      SELECT 1 FROM RestaurantOrderDetail rd WHERE rd.OrderDetailId = d.OrderDetailId
                  );
            `);
    console.log(`✅ [PAYMENT] Order archived`);

    await transaction.commit();
    console.log(`✅ [PAYMENT] ✅✅✅ ALL COMPLETE for order ${orderId}`);

    // KOT already generated before transaction began to ensure only new items print

    try {
      // Also print checkout receipt for online payments
      await generateAndQueueReceipt(orderId, "ONLINE");
    } catch (err) {
      console.error("Failed to queue receipt:", err);
    }

    if (req.io) {
      if (cleanTableId) {
        req.io.emit("order_closed", { tableId: cleanTableId, orderId: orderId });
        req.io.emit("table_status_updated", { tableId: cleanTableId, status: 0 });
      }
      req.io.emit("qr-print-request", {
        orderId: orderId,
        source: "QR",
        paymentType: "online",
        printKOT: true,
        printBill: true
      });
    }

    res.json({
      success: true,
      transactionId: settlementId,
      orderId: orderId,
      message: "Payment completed successfully"
    });

  } catch (err) {
    try { await transaction.rollback(); } catch (_) { }
    console.error("❌ [PAYMENT] ERROR:", err.message);
    console.error("❌ [PAYMENT] Stack:", err.stack);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

module.exports = router;





