// src/components/PrinterDetector.js
// Web-compatible stub for PrinterDetector.
// On the web, we don't have access to native Android SDKs or React Native's Platform module.
// Therefore, we always fall back to web-based printing ('pdf' / iframe).

export class PrinterDetector {
  /**
   * Detects the available printer.
   * On the web platform, this always returns 'pdf' (fallback to standard web printing).
   * @returns {Promise<'sunmi' | 'pdf'>}
   */
  static async detectPrinter() {
    console.log("[PrinterDetector] Web platform detected, defaulting to PDF/iframe print fallback.");
    return "pdf";
  }

  /**
   * Checks if a Sunmi printer is natively available.
   * Always false on the web.
   * @returns {Promise<boolean>}
   */
  static async checkSunmiPrinter() {
    return false;
  }

  /**
   * Checks if a native print service (like Android Print Service) is available.
   * Always false on the web.
   * @returns {Promise<boolean>}
   */
  static async checkPrintService() {
    return false;
  }
}
