// src/components/BillPrompt.js
// Web-compatible version of BillPrompt.tsx (converted from React Native to React JS)

import React from "react";

const BillPrompt = ({
  visible,
  onClose,
  onPrintBill,
  onSkip,
  theme = {},
  t = {},
  total,
  formatPrice,
}) => {
  if (!visible) return null;

  const displayTotal = formatPrice
    ? formatPrice(parseFloat(total) || 0)
    : `$${(parseFloat(total) || 0).toFixed(2)}`;

  const primaryColor = theme.primary || "#000";
  const bgCard = theme.card || theme.bgCard || "#fff";
  const textColor = theme.text || theme.textPrimary || "#000";
  const textSecondary = theme.textSecondary || "#666";
  const borderColor = theme.border || "#ccc";

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={{ ...styles.modalContent, backgroundColor: bgCard }}
        onClick={(e) => e.stopPropagation()} // Prevent clicks inside modal from closing it
      >
        {/* Icon */}
        <div style={{ ...styles.iconContainer, backgroundColor: `${primaryColor}20` }}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="40"
            height="40"
            viewBox="0 0 512 512"
            fill="none"
            stroke={primaryColor}
            strokeWidth="32"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M160 336V48l32 16 32-16 31.94 16 32.37-16L320 16l31.79 16 31.93-16L416 32l-1 304" />
            <path d="M96 112h272" />
            <path d="M96 176h272" />
            <path d="M96 240h272" />
            <path d="M304 384H96a64 64 0 01-64-64V432a48 48 0 0048 48h224a48 48 0 0048-48V336H304z" />
          </svg>
        </div>

        {/* Title */}
        <div>
          <h2 style={{ ...styles.title, color: textColor }}>
            {t.printBillReceipt || "Print Receipt?"}
          </h2>
        </div>

        {/* Amount */}
        <div style={{ ...styles.amount, color: primaryColor }}>
          {t.totalAmount || "Total"}: {displayTotal}
        </div>

        {/* Message */}
        <p style={{ ...styles.message, color: textSecondary }}>
          {t.printBillMessage || "Do you want to print a bill for this transaction?"}
        </p>

        {/* Buttons */}
        <div style={styles.buttonContainer}>
          <button
            style={{
              ...styles.button,
              ...styles.skipButton,
              borderColor: borderColor,
              color: textColor,
            }}
            onClick={onSkip}
            onMouseOver={(e) => (e.target.style.opacity = 0.8)}
            onMouseOut={(e) => (e.target.style.opacity = 1)}
          >
            {t.skipBill || "No, Skip"}
          </button>

          <button
            style={{
              ...styles.button,
              ...styles.printButton,
              backgroundColor: primaryColor,
              color: "#fff",
            }}
            onClick={onPrintBill}
            onMouseOver={(e) => (e.target.style.opacity = 0.9)}
            onMouseOut={(e) => (e.target.style.opacity = 1)}
          >
            {t.printBill || "Yes, Print Bill"}
          </button>
        </div>

        {/* Note */}
        <div style={{ ...styles.note, color: textSecondary }}>
          {t.billNote || "You can also view bill in Sales Report"}
        </div>
      </div>
    </div>
  );
};

const styles = {
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
    zIndex: 9999, // Ensure it sits on top of everything
  },
  modalContent: {
    width: "90%",
    maxWidth: "350px",
    borderRadius: "20px",
    padding: "25px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
  },
  iconContainer: {
    width: "80px",
    height: "80px",
    borderRadius: "40px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: "15px",
  },
  title: {
    fontSize: "20px",
    fontWeight: "700",
    marginBottom: "10px",
    textAlign: "center",
    margin: 0,
  },
  amount: {
    fontSize: "24px",
    fontWeight: "800",
    marginBottom: "15px",
    textAlign: "center",
  },
  message: {
    fontSize: "14px",
    textAlign: "center",
    marginBottom: "25px",
    lineHeight: "20px",
    margin: "0 0 25px 0",
  },
  buttonContainer: {
    display: "flex",
    flexDirection: "row",
    gap: "12px",
    width: "100%",
    marginBottom: "15px",
  },
  button: {
    flex: 1,
    padding: "14px 0",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600",
    transition: "opacity 0.2s",
    border: "none",
    background: "transparent",
    outline: "none",
  },
  skipButton: {
    borderWidth: "1px",
    borderStyle: "solid",
  },
  printButton: {
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  },
  note: {
    fontSize: "11px",
    textAlign: "center",
  },
};

export default BillPrompt;
