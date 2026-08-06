import { useState } from "react";
import { BASE_URL } from "./Configs/api";
import "./LoginPage.css";

const API = `${BASE_URL}/api`;

/* ══════════════════════════════════════════════════
   SVG Icons
══════════════════════════════════════════════════ */
const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const PhoneIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);



const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

const AlertIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const CheckIcon = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
    stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ForkIcon = () => (
  <svg width="34" height="34" viewBox="0 0 24 24" fill="none"
    stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
    <path d="M7 2v20" />
    <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
  </svg>
);

/* ══════════════════════════════════════════════════
   LoginPage Component
══════════════════════════════════════════════════ */
export default function LoginPage({ onLoginSuccess }) {
  const [tab, setTab] = useState("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successUser, setSuccessUser] = useState("");
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [signedUpUser, setSignedUpUser] = useState(null);

  // Sign In fields
  const [siUsername, setSiUsername] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [siPromoCode, setSiPromoCode] = useState("");

  // Sign Up fields

  const [suUsername, setSuUsername] = useState("");
  const [suCountryCode, setSuCountryCode] = useState("+65");
  const [suPhone, setSuPhone] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [suPromoCode, setSuPromoCode] = useState("");

  const switchTab = (t) => {
    setTab(t);
    setError("");
    setShowPass(false);
    setShowConfirmPass(false);
  };

  /* ── Sign In ─────────────────────────────────── */
  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    if (!siUsername.trim() || !siPassword.trim()) {
      setError("Please enter your username and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: siUsername.trim(),
          password: siPassword,
          promoCode: siPromoCode.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        const params = new URLSearchParams(window.location.search);

        const tableId = params.get("tableId");
        const table = params.get("table");

        localStorage.setItem("tableId", tableId);
        localStorage.setItem("tableNo", table);

        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("qr_pos_user", JSON.stringify(data.user));

        if (data.user?.Promocode) {
          localStorage.setItem("promoCode", data.user.Promocode);
          localStorage.setItem("promoAmount", data.user.Promoamount || 0);
          localStorage.setItem(
            "availableCredit",
            data.user.AvailableCredit || 0
          );
        } else {
          localStorage.removeItem("promoCode");
          localStorage.removeItem("promoAmount");
          localStorage.removeItem("availableCredit");
        }
        setSuccessUser(data.user.FullName || data.user.UserName);
        setShowSuccess(true);
        setTimeout(() => {
          if (onLoginSuccess) onLoginSuccess(data.user);
        }, 1400);
      } else {
        setError(data.message || "Login failed. Please try again.");
      }
    } catch (err) {
      setError("Cannot connect to server. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  /* ── Sign Up ─────────────────────────────────── */
  const handleSignUp = async (e) => {
    e.preventDefault();
    setError("");
    if (!suUsername.trim() || !suPassword.trim()) {
      setError("Username and password are required.");
      return;
    }
    if (!suPhone.trim()) {
      setError("Phone number is required.");
      return;
    }
    if (suPassword !== suConfirm) {
      setError("Passwords do not match.");
      return;
    }
    if (suPassword.length < 4) {
      setError("Password must be at least 4 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: suUsername.trim(),
          username: suUsername.trim(),
          email: suEmail.trim(),
          password: suPassword,
          phone: suCountryCode + suPhone.trim(),
          promoCode: suPromoCode.trim(),
        }),
      });
      const data = await res.json();
      console.log("LOGIN RESPONSE:", data);
      if (data.success) {
        localStorage.setItem("qr_pos_user", JSON.stringify(data.user));

        if (data.user?.Promocode && data.user.Promocode.trim() !== "") {

          localStorage.setItem("promoCode", data.user.Promocode);
          localStorage.setItem("promoAmount", data.user.Promoamount || 0);
          localStorage.setItem("availableCredit", data.user.AvailableCredit || 0);

        } else {

          localStorage.removeItem("promoCode");
          localStorage.removeItem("promoAmount");
          localStorage.removeItem("availableCredit");

        }

        setSuccessUser(data.user.FullName || data.user.UserName || suUsername.trim());
        setSignedUpUser(data.user);
        setShowGiftModal(true);
      } else {
        setError(data.message || "Registration failed. Please try again.");
      }
    } catch (err) {
      setError("Cannot connect to server. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="login-root">
      {/* Floating particles */}
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="qr-particle"
          style={{
            left: `${10 + i * 15}%`,
            width: `${4 + i * 2}px`,
            height: `${4 + i * 2}px`,
            animationDuration: `${8 + i * 3}s`,
            animationDelay: `${i * 1.5}s`,
          }}
        />
      ))}

      <div className="login-card">

        {/* Brand */}
        <div className="login-brand">
          <div className="login-logo-ring">
            <ForkIcon />
          </div>
          <div className="login-brand-name">QR POS</div>
          <div className="login-brand-sub">Restaurant Ordering System</div>
        </div>


        {/* Tab Switcher */}
        <div className="login-tabs" role="tablist">
          <button
            id="tab-signin"
            className={`login-tab ${tab === "signin" ? "active" : ""}`}
            onClick={() => switchTab("signin")}
            role="tab"
            aria-selected={tab === "signin"}
          >
            Sign In
          </button>
          <button
            id="tab-signup"
            className={`login-tab ${tab === "signup" ? "active" : ""}`}
            onClick={() => switchTab("signup")}
            role="tab"
            aria-selected={tab === "signup"}
          >
            Sign Up
          </button>
        </div>

        {/* ── SIGN IN FORM ────────────────────────── */}
        {tab === "signin" && (
          <form className="login-form" onSubmit={handleSignIn} key="signin">
            <div className="login-field">
              <label className="login-label" htmlFor="si-username">User Name</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><UserIcon /></span>
                <input
                  id="si-username"
                  className="login-input"
                  type="text"
                  placeholder="Enter your username"
                  value={siUsername}
                  onChange={(e) => setSiUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="si-password">Password</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><LockIcon /></span>
                <input
                  id="si-password"
                  className="login-input"
                  type={showPass ? "text" : "password"}
                  placeholder="Enter your password"
                  value={siPassword}
                  onChange={(e) => setSiPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {error && (
              <div className="login-error" role="alert">
                <AlertIcon /> {error}
              </div>
            )}

            <button
              id="btn-signin"
              type="submit"
              className={`login-submit-btn ${loading ? "loading" : ""}`}
              disabled={loading}
            >
              {loading && <span className="login-spinner" />}
              Sign In
            </button>

            <div className="login-switch">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams(window.location.search);

                  const tableId = params.get("tableId");
                  const table = params.get("table");

                  localStorage.setItem("tableId", tableId);
                  localStorage.setItem("tableNo", table);
                  const guestUser = { FullName: "Guest", UserId: "guest", UserName: "guest" };
                  localStorage.setItem("isLoggedIn", "true");
                  localStorage.setItem("qr_pos_user", JSON.stringify(guestUser));
                  if (onLoginSuccess) {
                    onLoginSuccess(guestUser);
                  } else {
                    window.location.reload();
                  }
                }}
              >
                Continue as Guest
              </button>
            </div>
          </form>
        )}

        {/* ── SIGN UP FORM ────────────────────────── */}
        {tab === "signup" && (
          <form className="login-form" onSubmit={handleSignUp} key="signup">
            {/* Full Name field removed as requested */}

            <div className="login-field">
              <label className="login-label" htmlFor="su-username">User Name</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><UserIcon /></span>
                <input
                  id="su-username"
                  className="login-input"
                  type="text"
                  placeholder="Enter your name"
                  value={suUsername}
                  onChange={(e) => setSuUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="su-phone">Phone Number *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div className="login-input-wrap" style={{ width: '85px', flexShrink: 0 }}>
                  <span className="login-input-icon"><PhoneIcon /></span>
                  <select
                    value={suCountryCode}
                    onChange={(e) => setSuCountryCode(e.target.value)}
                    className="login-input"
                    style={{
                      padding: '13px 8px 13px 36px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      appearance: 'none'
                    }}
                  >
                    <option value="+65">Singapore (+65)</option>
                    <option value="+60">Malaysia (+60)</option>
                    <option value="+91">India (+91)</option>
                    <option value="+62">Indonesia (+62)</option>
                    <option value="+1">USA (+1)</option>
                  </select>
                </div>
                <div className="login-input-wrap" style={{ flex: 1 }}>
                  <input
                    id="su-phone"
                    className="login-input"
                    type="tel"
                    placeholder="Enter phone number"
                    value={suPhone}
                    onChange={(e) => setSuPhone(e.target.value.replace(/[^0-9]/g, ''))}
                    autoComplete="tel"
                    style={{ paddingLeft: '14px' }}
                  />
                </div>
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="su-email">Email</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><MailIcon /></span>
                <input
                  id="su-email"
                  className="login-input"
                  type="email"
                  placeholder="Enter email address (optional)"
                  value={suEmail}
                  onChange={(e) => setSuEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="su-password">Password *</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><LockIcon /></span>
                <input
                  id="su-password"
                  className="login-input"
                  type={showPass ? "text" : "password"}
                  placeholder="Create a password"
                  value={suPassword}
                  onChange={(e) => setSuPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Hide password" : "Show password"}
                >
                  {showPass ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="login-field">
              <label className="login-label" htmlFor="su-confirm">Confirm Password *</label>
              <div className="login-input-wrap">
                <span className="login-input-icon"><LockIcon /></span>
                <input
                  id="su-confirm"
                  className="login-input"
                  type={showConfirmPass ? "text" : "password"}
                  placeholder="Re-enter your password"
                  value={suConfirm}
                  onChange={(e) => setSuConfirm(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowConfirmPass((v) => !v)}
                  aria-label={showConfirmPass ? "Hide password" : "Show password"}
                >
                  {showConfirmPass ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {/* Promo Code */}
            <div className="login-field">
              <label className="login-label" htmlFor="su-promo">
                Promo Code
              </label>

              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <UserIcon />
                </span>

                <input
                  id="su-promo"
                  className="login-input"
                  type="text"
                  placeholder="Enter promo code"
                  value={suPromoCode}
                  onChange={(e) => setSuPromoCode(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="login-error" role="alert">
                <AlertIcon /> {error}
              </div>
            )}

            <button
              id="btn-signup"
              type="submit"
              className={`login-submit-btn ${loading ? "loading" : ""}`}
              disabled={loading}
            >
              {loading && <span className="login-spinner" />}
              Create Account
            </button>

            <div className="login-switch">
              Already have an account?{" "}
              <button type="button" onClick={() => switchTab("signin")}>
                Sign In
              </button>
            </div>
          </form>
        )}

      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="login-loading-overlay" role="status" aria-live="polite">
          <div className="login-large-spinner" />
          <div className="login-loading-text">Processing...</div>
        </div>
      )}

      {/* Gift Modal */}
      {showGiftModal && (
        <div className="login-success-overlay" role="dialog" aria-modal="true">
          <div className="login-success-box" style={{ background: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 25px 50px rgba(0,0,0,0.1)' }}>
            <div className="login-success-icon" style={{ background: 'linear-gradient(135deg, #f97316, #ea6b0e)', boxShadow: '0 0 0 12px rgba(249, 115, 22, 0.15)' }}>
              <CheckIcon />
            </div>
            <div className="login-success-title" style={{ color: '#1f2937' }}>Welcome!</div>
            <div className="login-success-sub" style={{ color: '#6b7280', fontSize: '15px', marginBottom: '16px' }}>
              As a new customer, you can receive a gift at the counter.
            </div>
            <button
              className="login-submit-btn"
              onClick={() => {
                console.log("SIGNUP USER:", signedUpUser);
                // Login session create
                localStorage.setItem("isLoggedIn", "true");
                localStorage.setItem("qr_pos_user", JSON.stringify(signedUpUser));

                if (signedUpUser?.Promocode) {
                  localStorage.setItem("promoCode", signedUpUser.Promocode);
                  localStorage.setItem("promoAmount", signedUpUser.Promoamount || 0);
                } else {
                  localStorage.removeItem("promoCode");
                  localStorage.removeItem("promoAmount");
                }

                // QR table details save
                const params = new URLSearchParams(window.location.search);
                localStorage.setItem("tableId", params.get("tableId"));
                localStorage.setItem("tableNo", params.get("table"));

                // Gift popup close
                setShowGiftModal(false);

                // Success popup
                setShowSuccess(true);

                setTimeout(() => {
                  if (onLoginSuccess) {
                    onLoginSuccess(signedUpUser);
                  }
                }, 1400);
              }}
            >
              Awesome!
            </button>
          </div>
        </div>
      )}

      {/* Success Overlay */}
      {showSuccess && (
        <div className="login-success-overlay" role="status" aria-live="polite">
          <div className="login-success-box">
            <div className="login-success-icon">
              <CheckIcon />
            </div>
            <div className="login-success-title">Welcome, {successUser}!</div>
            <div className="login-success-sub">Redirecting to menu…</div>
          </div>
        </div>
      )}
    </div>
  );
}
