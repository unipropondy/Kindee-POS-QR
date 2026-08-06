const { poolPromise } = require("../config/db");
const http = require("http");

function postRequest(path, payloadObj) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(payloadObj);
    const req = http.request({
      hostname: "localhost",
      port: 3000,
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  try {
    const pool = await poolPromise;
    console.log("Connected to DB.");

    // Query Italian dish (KCode = 8798) and Beverages dish (KCode = 4)
    const dishesRes = await pool.request().query(`
      SELECT DishId, Name 
      FROM DishMaster 
      WHERE Name IN ('apple juice ', 'Kickapoo joy juice')
    `);
    const dishes = dishesRes.recordset;
    if (dishes.length < 2) {
      console.error("Missing test dishes in database! Need 'apple juice ' and 'Kickapoo joy juice'.");
      process.exit(1);
    }
    console.log("Found test dishes in DB:", dishes);

    // Let's place a QR order on Table 3 with multiple kitchens and quantities
    const payload = {
      tableId: "3",
      orderType: "DINE_IN",
      entryStatus: "q",
      items: [
        {
          id: dishes.find(d => d.Name.includes("apple")).DishId,
          lineItemId: dishes.find(d => d.Name.includes("apple")).DishId,
          name: "apple juice ",
          qty: 3, // Multiple quantity 3
          price: 5.50,
          status: "SENT"
        },
        {
          id: dishes.find(d => d.Name.includes("Kickapoo")).DishId,
          lineItemId: dishes.find(d => d.Name.includes("Kickapoo")).DishId,
          name: "Kickapoo joy juice",
          qty: 5, // Multiple quantity 5
          price: 4.50,
          status: "SENT"
        }
      ]
    };

    console.log("\nSending QR order request with multiple kitchens & quantities...");
    const res = await postRequest("/api/orders/send", payload);
    console.log("Response Status:", res.statusCode);
    console.log("Response Data:", res.data);

    if (res.statusCode === 200) {
      console.log("\nWaiting 2 seconds for print queue to process...");
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log("\nChecking PrintJobQueue for latest created print jobs...");
      const queueRes = await pool.request().query(`
        SELECT TOP 6 JobId, StoreId, PrinterName, PrinterIp, Status, Content, CreatedOn 
        FROM PrintJobQueue 
        ORDER BY CreatedOn DESC
      `);
      console.log("Latest PrintJobQueue entries:");
      queueRes.recordset.forEach(job => {
        console.log("--------------------------------------------------");
        console.log(`JobId: ${job.JobId}`);
        console.log(`Printer: ${job.PrinterName} | IP: ${job.PrinterIp} | Status: ${job.Status}`);
        console.log("Content Preview:");
        console.log(job.Content.split("\n").slice(0, 8).join("\n")); // Show first few lines
      });
    }

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

run();
