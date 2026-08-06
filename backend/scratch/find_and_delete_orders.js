const { poolPromise } = require("../config/db");

async function safeDelete(pool, query, inputName, inputValue) {
  try {
    const res = await pool.request().input(inputName, inputValue).query(query);
    console.log(`✅ Success: ${query.substring(0, 60)}... (Rows affected: ${res.rowsAffected[0]})`);
  } catch (err) {
    console.log(`⚠️ Skipped/Failed: ${query.substring(0, 60)}... Error: ${err.message}`);
  }
}

async function run() {
  const orderNumbers = ['20260806-0025', '20260806-0023', '20260806-0024'];
  try {
    const pool = await poolPromise;
    console.log("🔍 Searching for settlements by BillNo / OrderNumber in the database...");

    for (const num of orderNumbers) {
      console.log(`\n================== Settlement check: ${num} ==================`);
      
      const settlements = await pool.request()
        .input("num", num)
        .query("SELECT SettlementID, BillNo, SysAmount, CreatedOn FROM SettlementHeader WHERE BillNo = @num OR BillNo = '#' + @num");
      
      if (settlements.recordset.length > 0) {
        console.log(`📍 Found ${settlements.recordset.length} settlement(s) in SettlementHeader:`);
        console.table(settlements.recordset);
        
        for (const row of settlements.recordset) {
          const sid = row.SettlementID;
          console.log(`Deleting all components linked to SettlementID: ${sid}`);
          
          await safeDelete(pool, "DELETE FROM CustomerCreditAllocations WHERE PaymentTransactionId IN (SELECT TransactionId FROM CustomerCreditTransactions WHERE SettlementId = @sid) OR InvoiceTransactionId IN (SELECT TransactionId FROM CustomerCreditTransactions WHERE SettlementId = @sid)", "sid", sid);
          await safeDelete(pool, "DELETE FROM CustomerCreditTransactions WHERE SettlementId = @sid", "sid", sid);
          await safeDelete(pool, "DELETE FROM SettlementItemDetail WHERE SettlementID = @sid", "sid", sid);
          await safeDelete(pool, "DELETE FROM SettlementTotalSales WHERE SettlementID = @sid", "sid", sid);
          await safeDelete(pool, "DELETE FROM SettlementDetail WHERE SettlementId = @sid", "sid", sid);
          await safeDelete(pool, "DELETE FROM SettlementTranDetail WHERE SettlementID = @sid", "sid", sid);
          await safeDelete(pool, "DELETE FROM SettlementCreditSales WHERE SettlementID = @sid", "sid", sid);
          await safeDelete(pool, "DELETE FROM SettlementDiscountDetail WHERE SettlementID = @sid", "sid", sid);
          await safeDelete(pool, "DELETE FROM PaymentTransactionDetails WHERE ReferenceId = @sid", "sid", sid);
          await safeDelete(pool, "DELETE FROM PaymentDetailCur WHERE RestaurantBillId = @sid", "sid", sid);
          await safeDelete(pool, "DELETE FROM PaymentDetail WHERE RestaurantBillId = @sid", "sid", sid);
          await safeDelete(pool, "DELETE FROM RestaurantInvoice WHERE RestaurantBillId = @sid", "sid", sid);
          await safeDelete(pool, "DELETE FROM SettlementHeader WHERE SettlementID = @sid", "sid", sid);
        }
      } else {
        console.log("❌ No matching settlement found in SettlementHeader.");
      }
    }

    console.log("\n✅ Deletion finished.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error running script:", err);
    process.exit(1);
  }
}

run();
