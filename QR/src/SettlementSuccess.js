import React, { useEffect, useState } from "react";
import { BASE_URL } from "./Configs/api";
import "./SettlementSuccess.css";
import { Home } from "lucide-react";
import { useNavigate } from "react-router-dom";


function SettlementSuccess() {

  const API = `${BASE_URL}/api`;

  const navigate = useNavigate();
const [tableId, setTableId] = useState("");
  const [orders, setOrders] = useState([]);

  const [orderNumber, setOrderNumber] = useState("");

  const [tableNo, setTableNo] = useState("");

useEffect(() => {
  loadOrderDetails();

  const interval = setInterval(() => {
    loadOrderDetails();
  }, 5000); // 5 seconds

  return () => clearInterval(interval);
}, []);

  const loadOrderDetails = async () => {

    try {

      const params = new URLSearchParams(window.location.search);

      const orderId = params.get("orderId");

          setTableId(params.get("tableId") || "");

      const res = await fetch(
        `${API}/order/order-details/${orderId}`
      );

      const data = await res.json();

     console.log("ORDER DETAILS:", JSON.stringify(data, null, 2));

      setOrders(Array.isArray(data) ? data : []);

      if (data.length > 0) {

        setOrderNumber(data[0].OrderNumber);

        setTableNo(data[0].Tableno || "2");

      }

    } catch (err) {

      console.log(err);

    }
  };

const total = (Array.isArray(orders) ? orders : []).reduce(
  (sum, item) => sum + Number(item.amount || 0),
  0
);

const totalQty = (Array.isArray(orders) ? orders : []).reduce(
  (sum, item) => sum + Number(item.Quantity || 0),
  0
);
  return (

    <div className="settlement-success-page">

      <div className="settlement-success-card">

        {/* TOP GREEN LINE */}
        <div className="settlement-top-line"></div>

        {/* HEADER */}
       <div className="settlement-header-section">

            <div>

              <h1 className="settlement-table-title">
                 Table {tableNo}
              </h1>

              <div className="settlement-order-number">
                #{orderNumber}
              </div>

            </div>

          <div className="settlement-header-actions">

            <button
              className="settlement-home-btn"
             onClick={() => {
              window.location.href = `/?tableId=${tableId}&table=${tableNo}`;
            }}
            >
              🏠
            </button>

            {/* <button
              className="settlement-refresh-btn"
              onClick={() => {
                loadOrderDetails();
              }}
            >
              ↻ Refresh
            </button> */}

          </div>

       </div>

        {/* BADGES */}
        <div className="settlement-badge-row">

          <div className="settlement-info-badge green">

            <span>🍽</span>

            <span>{totalQty} items</span>

          </div>

          <div className="settlement-info-badge gray">

            <span>🍴</span>

            <span>{Array.isArray(orders) ? orders.length : 0} dishes</span>

          </div>

        </div>

        {/* DIVIDER */}
        <div className="settlement-divider"></div>

        {/* KITCHEN TITLE */}
        <div className="settlement-kitchen-title">
          KITCHEN
        </div>

        {/* ORDER ITEMS */}
        <div className="settlement-items-list">

          {(Array.isArray(orders) ? orders : []).map((item, index) => (

            <div
              className="settlement-order-item"
              key={index}
            >

              <div className="settlement-qty-box">
                {item.Quantity}x
              </div>

             <div className="settlement-item-content">

                    {/* Dish Name + Price */}
                    <div className="settlement-dish-top">

                      <div className="settlement-dish-name">
                        {item.DishName}
                      </div>

                      <div className="settlement-item-price">
                        ${Number(item.Price || 0).toFixed(2)}
                      </div>

                    </div>

                    {/* Combo Selections */}
                  {item.ComboDetailsJSON &&
                      (() => {
                        let comboDetails = [];

                        try {
                          comboDetails = JSON.parse(item.ComboDetailsJSON);
                        } catch (e) {
                          console.log("Invalid ComboDetailsJSON:", item.ComboDetailsJSON);
                          return null;
                        }

                        return (
                          <div className="settlement-mods">
                            {comboDetails.map((group, index) => (
                              <div key={index} style={{ marginTop: "4px" }}>
                                <div
                                  style={{
                                    color: "#f97316",
                                    fontWeight: 600,
                                    fontSize: "14px",
                                  }}
                                >
                                  {group.groupName}
                                </div>

                                {group.items?.map((option, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      marginLeft: "14px",
                                      color: "#666",
                                      fontSize: "13px",
                                    }}
                                  >
                                    ↳ {option.name}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        );
                      })()}

                    {/* Normal Modifiers */}
                    {item.ModifierNames && (
                      <div className="settlement-mods">
                        {item.ModifierNames}
                      </div>
                    )}

                    {/* Status */}
                    <div className="settlement-status-row">
                      <div
                        className={`settlement-status ${
                          item.StatusLabel === "READY"
                            ? "ready"
                            : "preparing"
                        }`}
                      >
                        {item.StatusLabel}
                      </div>
                    </div>

                  </div>

            </div>

          ))}

        </div>

      </div>

    </div>

  );
}

export default SettlementSuccess;