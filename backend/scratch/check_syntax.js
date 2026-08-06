try {
  console.log("Checking syntax of backend/routes/orders.js...");
  require("../routes/orders.js");
  console.log("✅ Syntax check passed!");
} catch (err) {
  console.error("❌ Syntax check failed:");
  console.error(err);
  process.exit(1);
}
process.exit(0);
