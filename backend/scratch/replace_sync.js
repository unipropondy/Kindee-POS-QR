const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../routes/orders.js");
let content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");

const startToken = "  // 🚀 OPTIMIZATION 2: Batch Item Processing";
const endToken = `  if (batchSql || items.length === 0) {
    if (items.length === 0)
      console.log(\`[DB] CLEARING ALL UNSENT for Order \${cleanOrderNo}\`);
    await itemRequest.query(batchSql);
  }`;

const startIndex = content.indexOf(startToken);
const endIndex = content.indexOf(endToken);

if (startIndex === -1 || endIndex === -1) {
  console.error("❌ Start or End token not found!");
  console.log("Start Index:", startIndex);
  console.log("End Index:", endIndex);
  process.exit(1);
}

const replacement = `  // 🚀 OPTIMIZATION 2: Batch Item Processing (Chunked to avoid SQL Server 2100 parameter limit)
  const statusCodes = {
    NEW: 1,
    SENT: 2,
    READY: 3,
    SERVED: 4,
    HOLD: 5,
    VOIDED: 0,
  };

  const batchSize = 50;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const itemRequest = transaction.request();
    itemRequest.input("orderId", sql.UniqueIdentifier, orderGuid);
    itemRequest.input("userId", sql.UniqueIdentifier, finalUserId);
    itemRequest.input("bizId", sql.UniqueIdentifier, bizId);
    itemRequest.input("orderNo", sql.NVarChar(100), cleanOrderNo);
    itemRequest.input("startDate", sql.Date, startDate);

    let batchSql = "";

    chunk.forEach((item, idx) => {
      const cleanProdId = String(item.id || item.ProductId || DEFAULT_GUID)
        .replace(/^\\{|\\}$/g, "")
        .trim();
      const finalProdId = toGuidOrNull(cleanProdId) || DEFAULT_GUID;
      const lineItemId =
        item.lineItemId && item.lineItemId.length > 10
          ? item.lineItemId
          : require("crypto").randomUUID();
      const itemStatus = item.status || item.Status;
      const currentStatusCode = statusCodes[itemStatus] || 2;
      console.log(\`[syncToProfessionalTables] Item: \${item.name || 'Dish'} | Incoming Status: \${itemStatus} | Computed StatusCode: \${currentStatusCode}\`);
      const dishName = (item.name || item.ProductName || "Dish").substring(0, 200);
      const songName = (item.songName || item.SongName || "").substring(0, 200);
      const unitPrice = item.price || item.Cost || 0;
      const basePrice = item.basePrice !== undefined ? item.basePrice : unitPrice;
      const isCombo = item.isCombo === true || item.IsCombo === true || !!item.ComboDetailsJSON;

      let resolvedUnitPrice = unitPrice;
      let comboDetailsJSON = null;

      if (isCombo) {
        resolvedUnitPrice = basePrice;
        let selections = item.comboSelections || item.ComboSelections || [];
        if (typeof selections === 'string' && selections) {
          try { selections = JSON.parse(selections); } catch { selections = []; }
        }
        if (selections && !Array.isArray(selections) && typeof selections === 'object') {
          if (Array.isArray(selections.groups)) {
            selections = selections.groups;
          }
        }
        const comboObj = {
          basePrice: basePrice,
          groups: Array.isArray(selections) ? selections : []
        };
        comboDetailsJSON = JSON.stringify(comboObj);
      }

      const noteInfo = { value: item.note || item.Note || item.notes || item.Notes || item.Remarks || item.remarks || "" };
      const takeawayInfo = { value: item.isTakeaway || item.IsTakeaway || item.isTakeAway || item.IsTakeAway || false };
      
      const modifiers = Array.isArray(item.modifiers || item.Modifiers) ? (item.modifiers || item.Modifiers) : [];
      let modsJSON = null;
      if (modifiers.length > 0) {
        modsJSON = JSON.stringify(modifiers);
      }

      const p_id = \`id\${idx}\`,
        p_dish = \`dish\${idx}\`,
        p_qty = \`qty\${idx}\`,
        p_cost = \`cost\${idx}\`,
        p_status = \`status\${idx}\`,
        p_name = \`name\${idx}\`,
        p_song = \`song\${idx}\`,
        p_note = \`note\${idx}\`,
        p_mods = \`mods\${idx}\`,
        p_tw = \`tw\${idx}\`,
        p_disc = \`disc\${idx}\`,
        p_disctype = \`disctype\${idx}\`,
        p_created = \`created\${idx}\`,
        p_sc = \`sc\${idx}\`,
        p_combo = \`combo\${idx}\`;

      itemRequest.input(p_id, sql.UniqueIdentifier, lineItemId);
      itemRequest.input(p_dish, sql.UniqueIdentifier, finalProdId);
      itemRequest.input(p_qty, sql.Decimal(18, 3), item.qty || 1);
      itemRequest.input(p_cost, sql.Decimal(18, 2), resolvedUnitPrice);
      itemRequest.input(p_status, sql.Int, currentStatusCode);
      itemRequest.input(p_name, sql.NVarChar(200), dishName);
      itemRequest.input(p_song, sql.NVarChar(200), songName);
      itemRequest.input(p_note, sql.NVarChar(sql.MAX), noteInfo.value);
      itemRequest.input(p_mods, sql.NVarChar(sql.MAX), modsJSON);
      itemRequest.input(p_tw, sql.Bit, takeawayInfo.value ? 1 : 0);
      itemRequest.input(p_combo, sql.NVarChar(sql.MAX), comboDetailsJSON);
      itemRequest.input(p_disc, sql.Decimal(18, 2), item.discount || 0);

      const resolvedDiscountType =
        item.discountType || item.DiscountType
          ? item.discountType || item.DiscountType
          : (item.discount || 0) > 0
            ? "percentage"
            : "fixed";
      itemRequest.input(p_disctype, sql.NVarChar(50), resolvedDiscountType);

      const isTWItem =
        item.isTakeaway === true ||
        item.IsTakeaway === true ||
        item.isTakeAway === true ||
        item.IsTakeAway === true ||
        String(item.isTakeaway) === "1" ||
        String(item.IsTakeaway) === "1" ||
        String(item.isTakeAway) === "1" ||
        String(item.IsTakeAway) === "1" ||
        String(item.isTakeaway).toLowerCase() === "true" ||
        String(item.IsTakeaway).toLowerCase() === "true" ||
        String(item.isTakeAway).toLowerCase() === "true" ||
        String(item.IsTakeAway).toLowerCase() === "true";

      const isSC = !isTWItem && (Number(item.isServiceCharge) === 1 || item.isServiceCharge === true || Number(item.IsServiceCharge) === 1 || item.IsServiceCharge === true);
      let itemSC = null;
      if (isSC) {
        const qtyVal = Number(item.qty || 1);
        const priceVal = Number(unitPrice || 0);
        const discVal = Number(item.discount || 0);
        let itemDiscount = 0;
        if (discVal > 0) {
          const discountBasis = isCombo ? Number(item.basePrice || priceVal) : priceVal;
          if (resolvedDiscountType === "percentage") {
            itemDiscount = discountBasis * qtyVal * (discVal / 100);
          } else {
            itemDiscount = Math.min(discVal, discountBasis) * qtyVal;
          }
        }
        const itemSubtotal = priceVal * qtyVal - itemDiscount;
        itemSC = itemSubtotal * (serviceChargePercentage / 100);
      }
      itemRequest.input(p_sc, sql.Decimal(18, 2), itemSC);

      let itemDate = null;
      const rawCreated = item.DateCreated || item.dateCreated || item.CreatedOn;
      if (rawCreated) {
        itemDate = new Date(rawCreated);
        if (isNaN(itemDate.getTime())) {
          itemDate = new Date(Date.now() + idx);
        }
      } else {
        itemDate = new Date(Date.now() + idx);
      }
      itemRequest.input(p_created, sql.DateTime, itemDate);

      batchSql += \`
        -- Process Item \${idx}
        IF EXISTS (SELECT 1 FROM RestaurantOrderDetailCur WHERE OrderDetailId = @\${p_id})
        BEGIN
          UPDATE RestaurantOrderDetailCur SET 
            OrderId = @orderId,
            Quantity = @\${p_qty}, PricePerUnit = @\${p_cost},
            ActualAmount = @\${p_cost} * @\${p_qty},
            TotalDetailLineAmount = @\${p_cost} * @\${p_qty},
            BaseAmount = @\${p_cost} * @\${p_qty},
            StatusCode = CASE WHEN @\${p_status} = 0 THEN 0 ELSE (CASE WHEN @\${p_status} > StatusCode THEN @\${p_status} ELSE StatusCode END) END, 
            Description = @\${p_name}, DishName = @\${p_name},SongName = @\${p_song}, ModifiedBy = @userId, ModifiedOn = GETDATE(), 
            ModifiersJSON = @\${p_mods}, ComboDetailsJSON = @\${p_combo}, OrderNumber = @orderNo, Remarks = @\${p_note}, isTakeAway = @\${p_tw},
            DiscountAmount = @\${p_disc}, DiscountType = @\${p_disctype}, ServiceCharge = @\${p_sc},
            CreatedOn = CASE WHEN StatusCode = 1 AND @\${p_status} = 2 THEN GETDATE() ELSE ISNULL(CreatedOn, @\${p_created}) END
          WHERE OrderDetailId = @\${p_id};
        END
        ELSE
        BEGIN
          DECLARE @existingVoidedId\${idx} UNIQUEIDENTIFIER = NULL;
          SELECT TOP 1 @existingVoidedId\${idx} = OrderDetailId
          FROM RestaurantOrderDetailCur
          WHERE OrderId = @orderId AND DishId = @\${p_dish} AND StatusCode = 0
          ORDER BY ModifiedOn DESC;

          IF @existingVoidedId\${idx} IS NOT NULL
          BEGIN
            UPDATE RestaurantOrderDetailCur SET
              OrderDetailId = @\${p_id},
              Quantity = @\${p_qty}, PricePerUnit = @\${p_cost},
              ActualAmount = @\${p_cost} * @\${p_qty},
              TotalDetailLineAmount = @\${p_cost} * @\${p_qty},
              BaseAmount = @\${p_cost} * @\${p_qty},
              StatusCode = @\${p_status},
              Description = @\${p_name}, DishName = @\${p_name}, SongName = @\${p_song},
              ModifiedBy = @userId, ModifiedOn = GETDATE(),
              ModifiersJSON = @\${p_mods}, ComboDetailsJSON = @\${p_combo},
              OrderNumber = @orderNo, Remarks = @\${p_note}, isTakeAway = @\${p_tw},
              DiscountAmount = @\${p_disc}, DiscountType = @\${p_disctype}, ServiceCharge = @\${p_sc},
              CreatedOn = GETDATE()
            WHERE OrderDetailId = @existingVoidedId\${idx};
          END
          ELSE
          BEGIN
            INSERT INTO RestaurantOrderDetailCur (OrderDetailId, OrderId, DishId, Description, DishName,SongName, Quantity, PricePerUnit, ActualAmount, TotalDetailLineAmount, BaseAmount, StatusCode, CreatedBy, CreatedOn, ModifiersJSON, ComboDetailsJSON, OrderNumber, Remarks, isTakeAway, BusinessUnitId, OrderDateTime, DiscountAmount, DiscountType, ServiceCharge, start_date)
            VALUES (@\${p_id}, @orderId, @\${p_dish}, @\${p_name}, @\${p_name}, @\${p_song}, @\${p_qty}, @\${p_cost}, @\${p_cost} * @\${p_qty}, @\${p_cost} * @\${p_qty}, @\${p_cost} * @\${p_qty}, @\${p_status}, @userId, CASE WHEN @\${p_status} = 2 THEN GETDATE() ELSE @\${p_created} END, @\${p_mods}, @\${p_combo}, @orderNo, @\${p_note}, @\${p_tw}, @bizId, GETDATE(), @\${p_disc}, @\${p_disctype}, @\${p_sc}, @startDate);
          END
        END

        DELETE FROM RestaurantmodifierdetailCur WHERE OrderDetailId = @\${p_id};
      \`;

      const modItems = [...modifiers];
      if (noteInfo.value)
        modItems.push({
          ModifierId: "00000000-0000-0000-0000-000000000001",
          ModifierName: "INSTR: " + noteInfo.value,
          Price: 0,
          qty: item.qty || 1,
        });

      if (modItems.length > 0) {
        batchSql += \`INSERT INTO RestaurantmodifierdetailCur (OrderDetailId, OrderId, DishId, ModifierId, Quantity, Amount, ModifierName, CreatedBy, CreatedOn, start_date) VALUES \`;
        modItems.forEach((mod, midx) => {
          const pm_id = \`mId\${idx}_\${midx}\`,
            pm_qty = \`mQty\${idx}_\${midx}\`,
            pm_amt = \`mAmt\${idx}_\${midx}\`,
            pm_name = \`mName\${idx}_\${midx}\`;

          const safeModId =
            mod.ModifierId && mod.ModifierId.length > 30
              ? mod.ModifierId
              : "00000000-0000-0000-0000-000000000001";

          itemRequest.input(pm_id, sql.UniqueIdentifier, safeModId);
          itemRequest.input(pm_qty, sql.Int, mod.qty || 1);
          itemRequest.input(pm_amt, sql.Decimal(18, 2), mod.Price || 0);
          itemRequest.input(
            pm_name,
            sql.NVarChar(800),
            (mod.ModifierName || "").substring(0, 800),
          );
          batchSql += \`(@\${p_id}, @orderId, @\${p_dish}, @\${pm_id}, @\${pm_qty}, @\${pm_amt}, @\${pm_name}, @userId, GETDATE(), @startDate)\${midx === modItems.length - 1 ? ";" : ","}\`;
        });
      }
    });

    if (batchSql) {
      await itemRequest.query(batchSql);
    }
  }

  // 🚀 OPTIMIZATION 3: Smart Removal & Cleanup Request
  const incomingIds = items
    .map((i) => i.lineItemId)
    .filter((id) => !!id && id.length > 5);
  const notInClause =
    incomingIds.length > 0
      ? \`AND OrderDetailId NOT IN (\${incomingIds.map((id) => \`'\${id}'\`).join(",")})\`
      : "";

  console.log(
    \`[DB] Syncing Order \${cleanOrderNo} (\${orderGuid}): Processing \${items.length} items, keeping \${incomingIds.length} IDs.\`,
  );

  const cleanupRequest = transaction.request();
  cleanupRequest.input("orderId", sql.UniqueIdentifier, orderGuid);

  let cleanupSql = \`
    -- Smart Removal: Delete unsent items that are no longer in the cart
    DELETE FROM RestaurantmodifierdetailCur WHERE OrderDetailId IN (SELECT OrderDetailId FROM RestaurantOrderDetailCur WHERE OrderId = @orderId AND StatusCode = 1 \${notInClause});
    DELETE FROM RestaurantOrderDetailCur WHERE OrderId = @orderId AND StatusCode = 1 \${notInClause};
    
    -- Final Header Total Update
    UPDATE RestaurantOrderCur SET TotalAmount = (SELECT ISNULL(SUM(ActualAmount), 0) FROM RestaurantOrderDetailCur WHERE OrderId = @orderId AND StatusCode <> 0) WHERE OrderId = @orderId;
  \`;

  if (items.length === 0) {
    console.log(\`[DB] CLEARING ALL UNSENT for Order \${cleanOrderNo}\`);
  }
  await cleanupRequest.query(cleanupSql);`;

const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex + endToken.length);
fs.writeFileSync(filePath, newContent, "utf8");
console.log("✅ orders.js successfully updated via programmatic script!");
