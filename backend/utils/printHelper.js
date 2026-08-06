/**
 * printHelper.js
 * Backend utility to format ESC/POS thermal text for KOT and KDS prints.
 * Mirrors the formatKOTThermalText logic in the frontend UniversalPrinter.ts
 * so the backend can queue print jobs directly without relying on the frontend.
 */

/**
 * Format KOT or KDS thermal ESC/POS text.
 * @param {object} data - { orderId, orderNo, tableNo, waiterName, items, kitchenName }
 * @param {string} type - 'NEW' | 'ADDITIONAL' | 'REPRINT' | 'KDS_PRINT'
 * @returns {string} ESC/POS formatted text
 */
function formatKOTThermalText(data, type = 'NEW') {
  // ── Type title ──────────────────────────────────────────────────────
  const title =
    type === 'KDS_PRINT'    ? 'KDS PRINT'
    : type === 'REPRINT'    ? 'REPRINT'
    : type === 'ADDITIONAL' ? 'ADDITIONAL ORDER'
    : 'NEW ORDER';

  const items       = (data.items || []).filter(i => (i.status || i.Status || '').toUpperCase() !== 'VOIDED');
  const tableNo     = data.tableNo     || 'N/A';
  const waiter      = data.waiterName  || 'Staff';
  const orderNo     = data.orderNo     || data.orderId || '';
  const kitchenName = data.kitchenName || '';

  // ── Timestamp ───────────────────────────────────────────────────────
  const now = new Date();
  const sg  = { timeZone: 'Asia/Singapore' };
  const dateStr = new Intl.DateTimeFormat('en-GB', { ...sg, day:'2-digit', month:'2-digit', year:'2-digit' }).format(now);
  const timeStr = now.toLocaleTimeString('en-GB', { ...sg, hour:'2-digit', minute:'2-digit', hour12:false });

  const DIV = '[L]------------------------------------------------\n';

  // ── HEADER ──────────────────────────────────────────────────────────
  let text = '\n\n';
  text += `[C]<B>${title}</B>\n`;
  text += `[C]${dateStr}  ${timeStr}\n`;
  text += DIV;

  if (type !== 'KDS_PRINT') {
    // KOT: TABLE visible at top
    text += `[C]<font size='big'><B>TABLE : ${tableNo}</B></font>\n`;
    text += DIV;
  }

  text += '[L]QTY  ITEM\n';
  text += DIV;

  // ── ITEMS ───────────────────────────────────────────────────────────
  if (type === 'KDS_PRINT') {
    // KDS: group by kitchen section
    const groups = {};
    items.forEach(item => {
      const k = (item.KitchenTypeName || item.kitchenTypeName || item.dishGroupName || item.categoryName || 'KITCHEN').toUpperCase().trim();
      if (!groups[k]) groups[k] = [];
      groups[k].push(item);
    });

    for (const [kName, groupItems] of Object.entries(groups)) {
      text += `[C]<B>${kName}</B>\n`;
      text += DIV;
      groupItems.forEach((item, idx) => {
        text += _formatItem(item);
        if (idx < groupItems.length - 1) text += '[L]\n';
      });
      text += DIV;
    }
  } else {
    // KOT: flat list
    items.forEach((item, idx) => {
      text += _formatItem(item);
      if (idx < items.length - 1) text += '[L]\n';
    });
    text += DIV;
  }

  // ── FOOTER ──────────────────────────────────────────────────────────
  text += `[L]Order By : ${waiter}\n`;
  text += `[L]Order No : ${orderNo}\n`;

  if (type === 'KDS_PRINT') {
    // KDS: TABLE big at the bottom
    text += DIV;
    text += `[C]<font size='big'><B>TABLE NO : ${tableNo}</B></font>\n`;
    text += DIV;
  } else {
    // KOT: Kitchen Name + Table Number always at the very bottom
    const kotLabel = kitchenName && kitchenName !== 'KDS'
      ? (tableNo && tableNo !== 'N/A'
          ? `${kitchenName.toUpperCase()}  /  T.NO : ${tableNo}`
          : kitchenName.toUpperCase())
      : (tableNo && tableNo !== 'N/A'
          ? `T.NO : ${tableNo}`
          : '');
    if (kotLabel) {
      text += DIV;
      text += `[C]<font size='big'><B>${kotLabel}</B></font>\n`;
      text += DIV;
    }
  }

  text += '\n\n';
  return text;
}

/**
 * Word-wrap a string to fit within `maxChars` per line.
 * Returns an array of lines. Only wraps when truly needed.
 */
function _wrapText(str, maxChars) {
  const words = String(str || '').split(' ');
  const result = [];
  let current = '';
  for (const word of words) {
    if (!word) continue;
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      result.push(current);
      current = word;
    }
  }
  if (current) result.push(current);
  return result.length ? result : [''];
}

/**
 * Format a single item row for ESC/POS output.
 *
 * Width reference (80mm paper):
 *   Normal font : 48 chars/line
 *   Big font    : 24 chars/line
 *   Item prefix : "[qty] " = 5 chars  → 19 chars for name (big font)
 *   Mod prefix  : "  + "  = 4 chars  → 44 chars for mod  (normal font)
 */
function _formatItem(item) {
  let text = '';
  const qtyNum   = item.quantity || item.qty || 1;
  const itemName = item.name     || item.DishName || '';

  // ── Item name: big + bold, wrap at 19 chars (big-font width minus prefix) ──
  const BIG_NAME = 19;   // big-font chars available after "[qty] "
  const BIG_CONT = 20;   // big-font chars available on continuation lines (4-space indent)
  const MOD_WRAP = 44;   // normal-font chars available for modifiers

  _wrapText(itemName.replace(/\n/g, ' '), BIG_NAME).forEach((chunk, idx) => {
    if (idx === 0) {
      text += `[L]<font size='big'><B>[${qtyNum}] ${chunk}</B></font>\n`;
    } else {
      text += `[L]<font size='big'><B>    ${chunk}</B></font>\n`;
    }
  });

  // ── Song name ──────────────────────────────────────────────────────────────
  const songName = item.songName || item.SongName || '';
  if (songName) text += `[L]    ♪ ${songName}\n`;

  // ── Takeaway flag ──────────────────────────────────────────────────────────
  const isTakeaway = !!(item.isTakeaway || item.IsTakeaway || item.isTakeAway || item.IsTakeAway);
  if (isTakeaway) text += `[L]    >> TAKEAWAY <<\n`;

  // ── Modifiers (normal font, no big) — wrap at 44 chars ────────────────────
  if (item.modifiers && item.modifiers.length > 0) {
    item.modifiers.forEach(m => {
      const modName = m.ModifierName || m.modifierName || m.name || m.ModifierNameEn || '';
      if (modName) {
        _wrapText(modName, MOD_WRAP).forEach((chunk, idx) => {
          text += idx === 0
            ? `[L]    + ${chunk}\n`
            : `[L]      ${chunk}\n`;
        });
      }
    });
  }

  // ── Combo selections (normal font) — wrap at 44 chars ─────────────────────
  if (item.comboSelections && item.comboSelections.length > 0) {
    item.comboSelections.forEach(g => {
      if (Array.isArray(g.items)) {
        g.items.forEach(opt => {
          _wrapText(opt.name || '', MOD_WRAP).forEach((chunk, idx) => {
            text += idx === 0
              ? `[L]    - ${chunk}\n`
              : `[L]      ${chunk}\n`;
          });
        });
      }
    });
  }

  // ── Remarks / Note ─────────────────────────────────────────────────────────
  const noteText = item.note || item.notes || item.Remarks || item.remarks;
  if (noteText) {
    _wrapText(noteText, 44).forEach((chunk, idx) => {
      text += idx === 0 ? `[L]    * ${chunk}\n` : `[L]      ${chunk}\n`;
    });
  }

  return text;
}

/**
 * Queue KOT and KDS print jobs directly into PrintJobQueue for a QR order.
 * Called by the backend /send route after the order transaction commits.
 * This avoids the duplicate-print risk that comes from frontend-socket-triggered printing.
 *
 * @param {object} pool  - mssql connection pool
 * @param {object} sql   - mssql sql object
 * @param {object} opts  - { orderId, tableNo, sentItems, isAdditional }
 */
async function queueQRPrintJobs(pool, sql, opts) {
  const { orderId, tableNo, sentItems = [], isAdditional = false } = opts;
  const type = isAdditional ? 'ADDITIONAL' : 'NEW';
  const STORE_ID = 'STORE_001';

  // 1. Group items by KitchenTypeCode → one KOT job per kitchen
  const kitchenGroups = {};
  sentItems.forEach(item => {
    const kCode = String(item.KitchenTypeCode || item.kitchenTypeCode || '0');
    if (!kitchenGroups[kCode]) {
      kitchenGroups[kCode] = {
        items: [],
        kitchenName: item.KitchenTypeName || item.kitchenTypeName || 'KITCHEN',
        kitchenTypeValue: kCode,
      };
    }
    kitchenGroups[kCode].items.push(item);
  });

  for (const [kCode, group] of Object.entries(kitchenGroups)) {
    const kotData = {
      orderId,
      orderNo: orderId,
      tableNo,
      waiterName: 'QR Order',
      items: group.items,
      kitchenName: group.kitchenName,
    };
    const thermalText = formatKOTThermalText(kotData, type);

    // Resolve kitchen printer IP from PrintMaster
    let printerIp = '';
    let printerName = '';
    try {
      const printerRes = await pool.request()
        .input('KTN', sql.NVarChar(100), group.kitchenName || '')
        .query(`
          SELECT TOP 1 ISNULL(NULLIF(PrinterIP, ''), NULLIF(PrinterPath, '')) as PrinterIP, PrinterName
          FROM PrintMaster
          WHERE PrinterType = 2
            AND LOWER(TRIM(KitchenTypeName)) = LOWER(TRIM(@KTN))
            AND IsActive = 1 AND IsEnabled = 1
            AND (PrinterIP IS NOT NULL AND PrinterIP <> '' OR PrinterPath IS NOT NULL AND PrinterPath <> '')
        `);
      if (printerRes.recordset.length > 0) {
        printerIp   = printerRes.recordset[0].PrinterIP;
        printerName = printerRes.recordset[0].PrinterName;
      }
    } catch (err) {
      console.warn(`[PrintHelper] Could not resolve kitchen printer for name=${group.kitchenName}:`, err.message);
    }

    if (!printerIp) {
      console.warn(`[PrintHelper] No kitchen printer IP for KTV=${kCode} — skipping KOT`);
      continue;
    }

    const jobId = require('crypto').randomUUID();
    await pool.request()
      .input('JobId',       sql.UniqueIdentifier, jobId)
      .input('StoreId',     sql.NVarChar(50),     STORE_ID)
      .input('PrinterName', sql.NVarChar(100),    printerName)
      .input('PrinterIp',   sql.NVarChar(100),    printerIp)
      .input('PrinterPort', sql.Int,              9100)
      .input('Content',     sql.NVarChar(sql.MAX), thermalText)
      .query(`
        INSERT INTO PrintJobQueue
          (JobId, StoreId, PrinterName, PrinterIp, PrinterPort, Content, Status, CreatedOn)
        VALUES
          (@JobId, @StoreId, @PrinterName, @PrinterIp, @PrinterPort, @Content, 'PENDING', GETDATE())
      `);
    console.log(`[PrintHelper] ✅ KOT queued for kitchen "${group.kitchenName}" → ${printerIp} [job: ${jobId}]`);
  }

  // 2. Queue KDS print (printerType = 4) — one job with ALL items grouped by kitchen
  try {
    const kdsRes = await pool.request()
      .query(`
        SELECT TOP 1 ISNULL(NULLIF(PrinterIP, ''), NULLIF(PrinterPath, '')) as PrinterIP, PrinterName
        FROM PrintMaster
        WHERE PrinterType = 4 AND IsActive = 1
          AND (PrinterIP IS NOT NULL AND PrinterIP <> '' OR PrinterPath IS NOT NULL AND PrinterPath <> '')
      `);

    if (kdsRes.recordset.length > 0) {
      const { PrinterIP, PrinterName } = kdsRes.recordset[0];
      const kdsData = {
        orderId,
        orderNo: orderId,
        tableNo,
        waiterName: 'QR Order',
        items: sentItems,
        kitchenName: 'KDS',
      };
      const kdsText = formatKOTThermalText(kdsData, 'KDS_PRINT');
      const kdsJobId = require('crypto').randomUUID();
      await pool.request()
        .input('JobId',       sql.UniqueIdentifier, kdsJobId)
        .input('StoreId',     sql.NVarChar(50),     STORE_ID)
        .input('PrinterName', sql.NVarChar(100),    PrinterName)
        .input('PrinterIp',   sql.NVarChar(100),    PrinterIP)
        .input('PrinterPort', sql.Int,              9100)
        .input('Content',     sql.NVarChar(sql.MAX), kdsText)
        .query(`
          INSERT INTO PrintJobQueue
            (JobId, StoreId, PrinterName, PrinterIp, PrinterPort, Content, Status, CreatedOn)
          VALUES
            (@JobId, @StoreId, @PrinterName, @PrinterIp, @PrinterPort, @Content, 'PENDING', GETDATE())
        `);
      console.log(`[PrintHelper] ✅ KDS queued → ${PrinterIP} [job: ${kdsJobId}]`);
    }
  } catch (kdsErr) {
    console.warn('[PrintHelper] KDS print queue failed:', kdsErr.message);
  }
}

module.exports = { formatKOTThermalText, queueQRPrintJobs };
