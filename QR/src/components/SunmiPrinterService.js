// src/components/SunmiPrinterService.js
// Web-compatible stub for Sunmi Printer Service.
// Note: Pure React web applications (browsers) cannot interface with Sunmi native Android SDKs.
// This stub ensures that any imports do not break the app and correctly reports that Sunmi printing is unavailable on the web.
// UniversalPrinter.js will gracefully fall back to Print Bridge or iframe web printing.

class SunmiPrinterService {
  /**
   * Initializes the Sunmi printer service.
   * Always returns false on the web platform since native SDKs are unavailable.
   */
  static async init() {
    console.log("[SunmiPrinterService] Not Android - cannot use Sunmi native printer on web platform.");
    return false;
  }

  /**
   * Attempts to print a receipt natively.
   * Always returns false on the web platform.
   */
  static async printReceipt(saleData, companySettings) {
    console.log("[SunmiPrinterService] printReceipt called on web platform. Falling back to alternative print methods.");
    return false;
  }

  /**
   * Attempts to print a KOT (Kitchen Order Ticket) natively.
   * Always returns false on the web platform.
   */
  static async printKOT(data, type = "NEW") {
    console.log("[SunmiPrinterService] printKOT called on web platform. Falling back to alternative print methods.");
    return false;
  }
}

export default SunmiPrinterService;
