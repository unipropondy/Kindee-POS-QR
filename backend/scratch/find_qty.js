const fs = require("fs");
const file = "c:/Users/UNIPRO/Desktop/POS + QR/frontend/app/summary.tsx";
const content = fs.readFileSync(file, "utf8");
const lines = content.split("\n");
let count = 0;
lines.forEach((line, idx) => {
  if (line.includes("finalItems")) {
    console.log(`${idx + 1}: ${line.trim()}`);
    count++;
  }
});
console.log("Total matches:", count);
