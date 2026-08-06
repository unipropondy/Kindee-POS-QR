// src/components/BillPDFGenerator.js
// Web-compatible version of BillPDFGenerator.ts
// React Native, Expo, and AsyncStorage imports have been removed.

import { BASE_URL } from "../Configs/api";
import {
  formatToSingaporeDate,
  formatToSingaporeTime,
  parseDatabaseDate,
} from "../utils/timezoneHelper";

const API_URL = BASE_URL;
const API_BASE = `${BASE_URL}/api`;

class BillPDFGenerator {
  static settingsCache = {};

  static async uploadImage(fileUriOrBlob) {
    try {
      const formData = new FormData();

      // On the web, we expect fileUriOrBlob to either be a Blob/File, or a URL we can fetch to get a Blob.
      let blob = fileUriOrBlob;
      if (typeof fileUriOrBlob === "string") {
        const response = await fetch(fileUriOrBlob);
        blob = await response.blob();
      }

      formData.append("image", blob, "logo.png");

      const response = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data && data.success) {
        return data.imageUrl;
      }
      return null;
    } catch (error) {
      console.log("Upload error:", error.message);
      return null;
    }
  }

  static async loadSettings(userId) {
    try {
      if (!userId) return this.getDefaultSettings();

      const targetId = "1";

      // Check cache (valid for 30 seconds)
      const now = Date.now();
      const cached = this.settingsCache[targetId];
      if (cached && now - cached.time < 30000) {
        console.log(`📥 USING CACHED SETTINGS for target: ${targetId}`);
        return cached.data;
      }

      const timestamp = Date.now();
      console.log(`📥 LOADING SETTINGS for target: ${targetId}`);

      let response = await fetch(
        `${API_BASE}/company-settings/${targetId}?_t=${timestamp}`
      );
      let responseData = await response.json();

      // CRITICAL FALLBACK: If we got a record but it has no name, try loading Master Settings (ID 1)
      if (
        targetId !== "1" &&
        (!responseData?.settings?.CompanyName ||
          responseData.settings.CompanyName.trim() === "")
      ) {
        console.log(
          "⚠️ Got empty settings for GUID, falling back to Master Settings (ID 1)"
        );
        const masterResponse = await fetch(
          `${API_BASE}/company-settings/1?_t=${timestamp}`
        );
        const masterData = await masterResponse.json();
        if (masterData?.success && masterData.settings?.CompanyName) {
          responseData = masterData;
        }
      }

      if (responseData && responseData.success) {
        const settings = responseData.settings;

        const showCompanyLogo =
          settings.ShowCompanyLogo === 1 || settings.ShowCompanyLogo === true;
        const showHalalLogo =
          settings.ShowHalalLogo === 1 || settings.ShowHalalLogo === true;

        const gstPercentage =
          settings.GSTPercentage !== undefined && settings.GSTPercentage !== null
            ? settings.GSTPercentage
            : 9;

        const formatUrl = (url) => {
          if (!url) return "";
          if (url.startsWith("data:image")) return url;
          if (url.startsWith("http")) return url;
          return `${API_URL}${url.startsWith("/") ? "" : "/"}${url}`;
        };

        const result = {
          name: settings.CompanyName || "Komban",
          address: settings.Address || "",
          gstNo: settings.GSTNo || "",
          gstPercentage: gstPercentage,
          serviceChargePercentage:
            parseFloat(settings.ServiceChargePercentage) || 0,
          phone: settings.Phone || "",
          email: settings.Email || "",
          cashierName: settings.CashierName || "",
          currency: settings.Currency || "SGD",
          currencySymbol: settings.CurrencySymbol || "$",
          companyLogo: formatUrl(settings.CompanyLogoUrl),
          halalLogo: formatUrl(settings.HalalLogoUrl),
          printerIp: settings.PrinterIP || "",
          showCompanyLogo: showCompanyLogo === true,
          showHalalLogo: showHalalLogo === true,
        };

        this.settingsCache[targetId] = {
          data: result,
          time: now,
        };

        return result;
      }
      return this.getDefaultSettings();
    } catch (error) {
      console.log("❌ Error loading settings:", error);
      return this.getDefaultSettings();
    }
  }

  static getDefaultSettings() {
    return {
      name: "",
      address: "",
      gstNo: "",
      gstPercentage: 0,
      phone: "",
      email: "",
      cashierName: "",
      currency: "SGD",
      currencySymbol: "$",
    };
  }

  static async saveSettings(settings, userId) {
    try {
      if (!userId) return false;

      const targetId = "1";

      const dbSettings = {
        CompanyName: settings.name,
        Address: settings.address,
        GSTNo: settings.gstNo,
        GSTPercentage: settings.gstPercentage,
        Phone: settings.phone,
        Email: settings.email,
        CashierName: settings.cashierName,
        Currency: settings.currency,
        CurrencySymbol: settings.currencySymbol,
        CompanyLogoUrl: settings.companyLogo || "",
        HalalLogoUrl: settings.halalLogo || "",
        PrinterIP: settings.printerIp || "",
        ShowCompanyLogo: settings.showCompanyLogo ? 1 : 0,
        ShowHalalLogo: settings.showHalalLogo ? 1 : 0,
        ServiceChargePercentage: settings.serviceChargePercentage || 0,
      };

      const timestamp = Date.now();

      const response = await fetch(
        `${API_BASE}/company-settings/${targetId}?_t=${timestamp}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dbSettings),
        }
      );
      const data = await response.json();

      if (data && data.success) {
        delete this.settingsCache[targetId];
        return true;
      }
      return false;
    } catch (error) {
      console.log("❌ Error saving settings:", error.message);
      return false;
    }
  }

  static escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  static async generateHTML(
    saleData,
    userId,
    discountInfo,
    companyOverride
  ) {
    const company = companyOverride || (await this.loadSettings(userId));

    let finalDiscountInfo = discountInfo;

    if (!finalDiscountInfo && saleData.discount) {
      finalDiscountInfo = {
        applied: true,
        type: saleData.discount.type || "percentage",
        value: saleData.discount.value || 0,
        amount: saleData.discount.amount || 0,
      };
    }

    if (
      !finalDiscountInfo &&
      saleData.discountAmount &&
      saleData.discountAmount > 0
    ) {
      finalDiscountInfo = {
        applied: true,
        type: saleData.discountType || "percentage",
        value: saleData.discountValue || 0,
        amount: saleData.discountAmount,
      };
    }

    const saleDate = saleData.originalDate
      ? parseDatabaseDate(saleData.originalDate)
      : saleData.date
      ? parseDatabaseDate(saleData.date)
      : new Date();

    const isReprint = saleData.isReprint === true;
    const billNo =
      saleData.invoiceNumber ||
      saleData.orderId ||
      saleData.id ||
      `ORD-${saleDate.getFullYear()}${(saleDate.getMonth() + 1)
        .toString()
        .padStart(2, "0")}${saleDate.getDate().toString().padStart(2, "0")}-${Math.floor(
        1000 + Math.random() * 9000
      )}`;

    const hasGST = company.gstPercentage > 0;
    const gstRate =
      company.gstPercentage !== undefined && company.gstPercentage !== null
        ? company.gstPercentage
        : 9;
    let finalTotal = saleData.total || saleData.totalAmount || 0;
    const currencySymbol = company.currencySymbol || "$";

    let grossTotal = 0;
    let totalItemDiscount = 0;
    (saleData.items || []).forEach((item) => {
      if (item.status === "VOIDED") return;
      const qtyNum = parseInt(String(item.qty || item.quantity || 1)) || 1;
      const baseTotal = (item.price || 0) * qtyNum;
      let itemDiscount = 0;
      const discAmt = Number(item.discountAmount ?? item.discount ?? 0);
      const discType = item.discountType || "percentage";
      if (discAmt > 0) {
        if (discType === "percentage") {
          itemDiscount = baseTotal * (discAmt / 100);
        } else {
          itemDiscount = discAmt * qtyNum;
        }
      }
      grossTotal += baseTotal;
      totalItemDiscount += itemDiscount;
    });

    const orderDiscount = finalDiscountInfo?.amount || 0;
    const currentSubtotal = grossTotal - totalItemDiscount - orderDiscount;
    const hasOrderDiscount =
      finalDiscountInfo?.applied && finalDiscountInfo.amount > 0;
    const hasAnyDiscount = totalItemDiscount > 0 || hasOrderDiscount;
    const originalSubTotal = grossTotal;

    const activeItems = (saleData.items || []).filter(
      (i) => i.status !== "VOIDED" && i.statusCode !== 0
    );
    const allItemsHaveSC =
      activeItems.length > 0 &&
      activeItems.every(
        (item) =>
          Number(item.isServiceCharge) === 1 || item.isServiceCharge === true
      );

    const scPercentage = company.serviceChargePercentage || 0;
    const savedServiceCharge =
      saleData.serviceCharge != null
        ? parseFloat(String(saleData.serviceCharge))
        : null;

    let serviceChargeAmount = 0;
    if (savedServiceCharge !== null) {
      serviceChargeAmount = savedServiceCharge;
    } else {
      let scEligibleSubtotal = 0;
      (saleData.items || []).forEach((item) => {
        if (item.status === "VOIDED") return;
        const qtyNum = parseInt(String(item.qty || item.quantity || 1)) || 1;
        const baseTotal = (item.price || 0) * qtyNum;
        let itemDiscount = 0;
        const discAmt = Number(item.discountAmount ?? item.discount ?? 0);
        const discType = item.discountType || "percentage";
        if (discAmt > 0) {
          if (discType === "percentage") {
            itemDiscount = baseTotal * (discAmt / 100);
          } else {
            itemDiscount = discAmt * qtyNum;
          }
        }
        const itemSubtotal = baseTotal - itemDiscount;
        const isSC =
          Number(item.isServiceCharge) === 1 || item.isServiceCharge === true;
        if (isSC) {
          scEligibleSubtotal += itemSubtotal;
        }
      });
      let scEligibleNet = scEligibleSubtotal;
      if (grossTotal > 0 && orderDiscount > 0) {
        const subtotalPostItemDisc = grossTotal - totalItemDiscount;
        if (subtotalPostItemDisc > 0) {
          const proportion = scEligibleSubtotal / subtotalPostItemDisc;
          scEligibleNet = Math.max(
            0,
            scEligibleSubtotal - proportion * orderDiscount
          );
        }
      }
      serviceChargeAmount = scEligibleNet * (scPercentage / 100);
    }

    const taxableAmount = currentSubtotal + serviceChargeAmount;
    const hasSC = serviceChargeAmount > 0;
    const gstAmountRaw = hasGST ? taxableAmount * (gstRate / 100) : 0;
    const gstAmount = Math.round(gstAmountRaw * 100) / 100;
    const amountWithoutGST = currentSubtotal;

    if (finalTotal === 0) {
      finalTotal = taxableAmount + gstAmount;
    }

    const printedRoundOff =
      saleData.roundOff && saleData.roundOff !== 0
        ? parseFloat((finalTotal - (taxableAmount + gstAmount)).toFixed(2))
        : 0;

    const companyLogoUrl = company.companyLogo || "";
    const halalLogoUrl = company.halalLogo || "";

    const showCompanyLogo = company.showCompanyLogo === true && !!companyLogoUrl;
    const showHalalLogo = company.showHalalLogo === true && !!halalLogoUrl;

    const itemsHTML = (saleData.items || [])
      .filter((item) => item.status !== "VOIDED")
      .map((item) => {
        const qtyNum = item.qty || item.quantity || 1;
        const modifiersHTML =
          item.modifiers && Array.isArray(item.modifiers)
            ? item.modifiers
                .filter((m) => {
                  const mAmt =
                    parseFloat(
                      String(m.Amount ?? m.Price ?? m.amount ?? m.price ?? 0)
                    ) || 0;
                  return mAmt > 0;
                })
                .map((m) => {
                  const mName = (m.ModifierName || m.name || "").trim();
                  const mAmt =
                    parseFloat(
                      String(m.Amount ?? m.Price ?? m.amount ?? m.price ?? 0)
                    ) || 0;
                  return `<div class="item-modifiers">+ ${mName}: ${currencySymbol}${(
                    mAmt * qtyNum
                  ).toFixed(2)}</div>`;
                })
                .join("")
            : "";

        const comboSelectionsHTML =
          item.isCombo &&
          item.comboSelections &&
          Array.isArray(item.comboSelections)
            ? item.comboSelections
                .map((group) => {
                  return (
                    group.items
                      ?.map((opt) => {
                        const effectiveAdd =
                          parseFloat(opt.surcharge || 0) +
                          parseFloat(opt.dishPrice || 0);
                        return `<div class="item-modifiers">↳ ${opt.name}${
                          effectiveAdd > 0
                            ? ` (+${currencySymbol}${effectiveAdd.toFixed(2)})`
                            : ""
                        }</div>`;
                      })
                      .join("") || ""
                  );
                })
                .join("")
            : "";

        return `
          <tr>
              <td class="item-name">
                  ${item.name || item.Name || item.DishName || item.ProductName || ""}
                  ${
                    item.songName || item.SongName
                      ? `<div style="font-size: 8.5px; color: #555; font-style: italic; margin-top: 0.5mm;">🎵 ${
                          item.songName || item.SongName
                        }</div>`
                      : ""
                  }
                  ${
                    (Number(item.isServiceCharge) === 1 ||
                      item.isServiceCharge === true) &&
                    !allItemsHaveSC
                      ? `<div style="font-size: 8.5px; color: #555; font-style: italic; margin-top: 0.5mm;">[Service Charge ${company.serviceChargePercentage}%]</div>`
                      : ""
                  }
                  ${modifiersHTML}
                  ${comboSelectionsHTML}
                  ${(() => {
                    const discAmt = Number(
                      item.discountAmount ?? item.discount ?? 0
                    );
                    if (discAmt > 0) {
                      const discType = item.discountType || "percentage";
                      const discStr =
                        discType === "percentage"
                          ? `-${discAmt}%`
                          : `-${currencySymbol}${discAmt.toFixed(2)}`;
                      return `<div style="font-size: 8.5px; color: #555; font-style: italic; margin-top: 0.5mm;">Discount: ${discStr}</div>`;
                    }
                    return "";
                  })()}
              </td>
              <td class="item-qty">${item.qty || item.quantity}</td>
              <td class="item-price">${currencySymbol}${item.price.toFixed(
          2
        )}</td>
              <td class="item-total">${currencySymbol}${(
          item.price * (item.qty || item.quantity)
        ).toFixed(2)}</td>
          </tr>
        `;
      })
      .join("");

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Invoice_${saleData.invoiceNumber || saleData.id}</title>
        <style>
          body { font-family: 'Courier New', Courier, monospace; background: #fff; margin: 0; padding: 0; }
          .print-wrapper { display: flex; justify-content: center; align-items: flex-start; width: 100%; min-height: 100vh; }
          @media print {
            @page { margin: 0; }
            body { background: white; }
            .print-wrapper { display: flex !important; justify-content: center !important; }
            .receipt { margin: 0 !important; box-shadow: none !important; width: 72mm !important; }
          }
          .receipt { width: 72mm; max-width: 72mm; background: white; padding: 4mm; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          .logo-header { display: flex; flex-direction: row; justify-content: space-between; align-items: center; margin-bottom: 3mm; border-bottom: 2.5px solid #000; padding-bottom: 3mm; }
          .company-logo { width: 45px; height: 45px; object-fit: contain; }
          .halal-logo { width: 45px; height: 45px; object-fit: contain; }
          .shop-info { text-align: center; flex: 1; padding: 0 1mm; }
          .shop-name { font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 4px; line-height: 1.2; margin-bottom: 1.5mm; display: block; font-family: monospace; }
          .shop-address { font-size: 8.5px; font-weight: 600; line-height: 1.3; font-family: monospace; white-space: pre-line; }
          .gst-no { font-size: 9px; font-weight: 700; background: #eee; font-family: monospace; padding: 0.5mm; margin: 1mm 0; display: inline-block; }
          .contact { font-size: 9px; font-weight: 700; font-family: monospace; margin-top: 1.5mm; line-height: 1.3; }
          .reprint-indicator { text-align: center; margin: 1mm 0; padding: 0.5mm; background: #eee; border: 1px dashed #000; }
          .reprint-text { font-size: 9px; font-weight: bold; }
          .bill-details { margin-bottom: 3mm; font-size: 11px; font-weight: 700; }
          .bill-box { border: 1px solid #000; padding: 1.5mm; margin-bottom: 2mm; background: #f9f9f9; }
          .detail-row { display: flex; justify-content: space-between; margin-bottom: 1px; font-weight: 700; }
          .detail-label { font-weight: 800; font-family: monospace; font-size: 10px; }
          .detail-value { font-weight: 800; font-family: monospace; font-size: 10px; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 3mm; font-size: 11px; font-family: monospace; font-weight: 800; }
          .items-table th { font-weight: 800; font-family: monospace; text-align: center; padding: 1.5mm 0.5mm; border-bottom: 1.5px solid #000; border-top: 1.5px solid #000; text-transform: uppercase; }
          .items-table th:first-child { text-align: left; }
          .items-table th:last-child { text-align: right; }
          .items-table td { padding: 1mm 0.5mm; border-bottom: 1px dashed #ddd; font-weight: 800; font-family: monospace; }
          .item-name { text-align: left; font-weight: 900; max-width: 38mm; }
          .item-modifiers { font-size: 8px; font-weight: normal; color: #444; margin-top: 0.5mm; padding-left: 1mm; }
          .item-qty { text-align: center; font-weight: 900; }
          .item-price { text-align: right; font-weight: 900; }
          .item-total { text-align: right; font-weight: 900; }
          .discount-section { margin-bottom: 3mm; padding: 1.5mm; border: 1px solid #000; background: #f9f9f9; font-family: monospace; }
          .discount-title { font-size: 10px; font-weight: 800; text-align: center; margin-bottom: 1mm; }
          .discount-row, .original-row { display: flex; justify-content: space-between; font-size: 10px; font-weight: 800; }
          .totals { margin-bottom: 3mm; font-weight: 900; font-family: monospace; }
          .total-row { display: flex; justify-content: space-between; margin-bottom: 1.5px; font-size: 11px; font-weight: 900; }
          .grand-total { display: flex; justify-content: space-between; margin-top: 1.5mm; padding-top: 1.5mm; border-top: 1.5px solid #000; font-weight: 900; font-size: 13px; }
          .payment-info { margin-bottom: 3mm; font-weight: 700; font-family: monospace; }
          .payment-row { display: flex; justify-content: space-between; margin-bottom: 1px; font-size: 10px; font-weight: 700; }
          .payment-label { font-weight: 700; }
          .payment-value { font-weight: 700; }
          .footer { text-align: center; padding-top: 2mm; border-top: 1.5px solid #000; font-family: monospace; }
          .thankyou { font-size: 13px; font-weight: 800; margin-bottom: 1mm; }
          .copyright { font-size: 11px; font-weight: 900; color: #000; }
        </style>
      </head>
      <body>
        <div class="print-wrapper">
          <div class="receipt">
          
          ${
            saleData.isCheckout
              ? `
            <div style="text-align: center; border: 2.5px solid #000; padding: 1.5mm; margin-bottom: 4mm; font-weight: 900; font-size: 18px; letter-spacing: 2px;">
              CHECKOUT BILL
            </div>
          `
              : ""
          }

          <!-- Logo Header -->
          <div class="logo-header">
            ${
              showCompanyLogo && companyLogoUrl
                ? `<img src="${companyLogoUrl}" class="company-logo" />`
                : '<div style="width:45px"></div>'
            }
            <div class="shop-info">
              <div class="shop-name">${
                saleData.shopName || company.name || "POS SYSTEM"
              }</div>
              <div class="shop-address">${(
                saleData.shopAddress ||
                company.address ||
                ""
              ).replace(/\n/g, "<br/>")}</div>
              ${
                saleData.shopGst || company.gstNo
                  ? `<div class="gst-no">GST: ${
                      saleData.shopGst || company.gstNo
                    }</div>`
                  : ""
              }
              <div class="contact">
                ${
                  saleData.shopPhone || company.phone
                    ? `<div>Ph: ${saleData.shopPhone || company.phone}</div>`
                    : ""
                } 
                ${
                  saleData.shopEmail || company.email
                    ? `<div>Email: ${saleData.shopEmail || company.email}</div>`
                    : ""
                }
              </div>
            </div>
            ${
              showHalalLogo && halalLogoUrl
                ? `<img src="${halalLogoUrl}" class="halal-logo" />`
                : '<div style="width:45px"></div>'
            }
          </div>
          
          <!-- Bill Details -->
          <div class="bill-details">
            <div class="bill-box">
              <div class="detail-row">
                <span class="detail-label">INVOICE NO:</span>
                <span class="detail-value">${billNo}</span>
              </div>
              ${
                saleData.tableNo
                  ? `
                <div class="detail-row" style="margin-top: 1.5mm; padding-top: 1mm; border-top: 1px dashed #ccc;">
                  <span class="detail-label" style="font-size: 14px; font-weight: 900;">TABLE NO:</span>
                  <span class="detail-value" style="font-size: 14px; font-weight: 900;">${saleData.tableNo}</span>
                </div>
              `
                  : ""
              }
              ${
                saleData.waiterName && saleData.waiterName !== "Staff"
                  ? `
                <div class="detail-row" style="margin-top: 1mm;">
                  <span class="detail-label" style="font-size: 9px; color: #666;">WAITER:</span>
                  <span class="detail-value" style="font-size: 9px; color: #666;">${saleData.waiterName}</span>
                </div>
              `
                  : ""
              }
            </div>
            
            <div class="detail-row">
              <span class="detail-label">DATE:</span>
              <span class="detail-value">
                ${formatToSingaporeDate(saleDate, {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })} ${formatToSingaporeTime(saleDate)}
              </span>
            </div>
            
            ${
              company.cashierName
                ? `
            <div class="detail-row">
              <span class="detail-label">CASHIER:</span>
              <span class="detail-value">${company.cashierName}</span>
            </div>
            `
                : ""
            }
          </div>
          
          <!-- Items Table -->
          <table class="items-table">
            <thead>
              <tr>
                <th style="text-align: left;">ITEM</th>
                <th style="text-align: center;">QTY</th>
                <th style="text-align: right;">PRICE</th>
                <th style="text-align: right;">TOTAL</th>
              </tr>
            </thead>
            <tbody>${itemsHTML}</tbody>
           </table>
          
          <!-- Totals -->
          <div class="totals">
            ${
              hasAnyDiscount
                ? `
            <div class="total-row">
              <span>Sub Total:</span>
              <span>${currencySymbol}${originalSubTotal.toFixed(2)}</span>
            </div>
            ${
              totalItemDiscount > 0
                ? `
            <div class="total-row">
              <span>Item Discounts:</span>
              <span>-${currencySymbol}${totalItemDiscount.toFixed(2)}</span>
            </div>
            `
                : ""
            }
            ${
              hasOrderDiscount
                ? `
            <div class="total-row">
              <span>Discount${
                finalDiscountInfo?.type === "percentage"
                  ? ` (${finalDiscountInfo?.value}%)`
                  : ""
              }:</span>
              <span>-${currencySymbol}${finalDiscountInfo?.amount.toFixed(
                    2
                  )}</span>
            </div>
            `
                : ""
            }
            <div class="total-row" style="margin-top: 1.5mm; border-top: 1px dashed #ccc; padding-top: 1.5mm;">
              <span>Net Amount:</span>
              <span>${currencySymbol}${amountWithoutGST.toFixed(2)}</span>
            </div>
            `
                : `
            <div class="total-row">
              <span>Sub Total:</span>
              <span>${currencySymbol}${amountWithoutGST.toFixed(2)}</span>
            </div>
            `
            }
            
             ${
               hasSC
                 ? `
             <div class="total-row">
               <span>${
                 allItemsHaveSC ? "Service Charge" : "Item Service Charge"
               }:</span>
               <span>${currencySymbol}${serviceChargeAmount.toFixed(2)}</span>
             </div>
             `
                 : ""
             }
             ${
               hasGST && gstAmount > 0
                 ? `
             <div class="total-row">
               <span>GST (${gstRate}%):</span>
               <span>${currencySymbol}${gstAmount.toFixed(2)}</span>
             </div>
             `
                 : ""
             }
             ${
               printedRoundOff && printedRoundOff !== 0
                 ? `
             <div class="total-row">
               <span>Round Off:</span>
               <span>${
                 printedRoundOff > 0 ? "+" : ""
               }${currencySymbol}${printedRoundOff.toFixed(2)}</span>
             </div>
             `
                 : ""
             }
            <div class="grand-total">
              <span>${
                hasGST ? "GRAND TOTAL (incl GST):" : "GRAND TOTAL:"
              }</span>
              <span>${currencySymbol}${finalTotal.toFixed(2)}</span>
            </div>
          </div>
          
          <!-- Payment Info -->
          <div class="payment-info">
            ${
              saleData.isCheckout
                ? `
              <div class="payment-row" style="margin-top: 5mm; border: 2px solid #000; padding: 2mm; text-align: center; justify-content: center;">
                <span class="payment-label" style="font-size: 14px;">PAYMENT STATUS: PENDING</span>
              </div>
            `
                : `
              ${
                saleData.payments &&
                Array.isArray(saleData.payments) &&
                saleData.payments.length > 0
                  ? `
                <div style="font-weight: bold; border-top: 1px dashed #ccc; margin-top: 2mm; padding-top: 2mm; font-size: 10px; text-align: left; text-transform: uppercase; margin-bottom: 1.5mm;">PAYMENT DETAILS</div>
                ${saleData.payments
                  .map(
                    (p) => `
                  <div class="payment-row" style="font-size: 10px; font-weight: 700; display: flex; justify-content: space-between;">
                    <span>${String(
                      p.payMode || p.payModeName || p.Remarks || "Payment"
                    ).toUpperCase()}</span>
                    <span>${currencySymbol}${parseFloat(p.amount).toFixed(
                      2
                    )}</span>
                  </div>
                `
                  )
                  .join("")}
              `
                  : `
                <div class="payment-row">
                  <span>PAYMENT:</span>
                  <span>${saleData.paymentMethod || "Cash"}</span>
                </div>
                ${
                  saleData.cashPaid
                    ? `
                <div class="payment-row">
                  <span>PAID:</span>
                  <span>${currencySymbol}${saleData.cashPaid.toFixed(2)}</span>
                </div>
                <div class="payment-row">
                  <span>CHANGE:</span>
                  <span>${currencySymbol}${(saleData.change || 0).toFixed(
                        2
                      )}</span>
                </div>
                `
                    : ""
                }
              `
              }
            `
            }
          </div>
          
          <!-- Footer -->
          <div class="footer">
            ${
              saleData.isCheckout
                ? `
              <div class="thankyou">PLEASE PAY AT THE COUNTER</div>
            `
                : `
              <div class="thankyou">THANK YOU! COME AGAIN!</div>
            `
            }
            <div class="copyright">SMART-POS BY UNIPROSG</div>
          </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Web-compatible: Triggers standard browser print dialog for "Save as PDF" functionality.
  static async generatePDF(saleData, userId, discountInfo) {
    const html = await this.generateHTML(saleData, userId, discountInfo);

    let frame = document.getElementById("pdf-print-iframe");
    if (!frame) {
      frame = document.createElement("iframe");
      frame.id = "pdf-print-iframe";
      frame.style.display = "none";
      document.body.appendChild(frame);
    }
    
    const doc = frame.contentWindow?.document || frame.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      
      const trigger = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      };
      
      frame.contentWindow?.addEventListener("load", trigger);
      setTimeout(trigger, 500); // fallback if load doesn't trigger
    }
    return "Browser print dialog triggered";
  }

  static async downloadPDF(saleData, userId, discountInfo) {
    try {
      // On the web, generating a silent PDF and sharing isn't directly possible without heavy libs.
      // Easiest is to trigger the print dialog which has a "Save as PDF" option.
      alert("Please select 'Save as PDF' in the print dialog.");
      await this.generatePDF(saleData, userId, discountInfo);
    } catch (error) {
      alert("Error: Failed to open receipt.");
    }
  }
}

export default BillPDFGenerator;
