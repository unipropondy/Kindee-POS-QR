import React, { useState, useEffect, useRef } from "react";
// import axios from "axios";
import { io } from "socket.io-client";
import LoginPage from "./LoginPage";
import "./App.css";
import { BASE_URL } from "./Configs/api";
import { QRCodeSVG } from "qrcode.react";
import {
  Routes,
  Route
} from "react-router-dom";
import PullToRefresh from 'react-simple-pull-to-refresh';

import SettlementSuccess from "./SettlementSuccess";
import UniversalPrinter from "./components/UniversalPrinter";

function App() {

  const skipSaveRef = useRef(false);
  const deleteInProgressRef = useRef(false);
  const actionRef = useRef(""); // "INSERT", "UPDATE", "DELETE"
  const pendingSaveRef = useRef(null); // tracks in-flight saveCartToBackend promise
  const currentOrderIdRef = useRef(null); // always holds the latest orderId synchronously
  const isLoggedIn = localStorage.getItem("isLoggedIn");

  const API = `${BASE_URL}/api`;
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [serviceChargePercent, setServiceChargePercent] = useState(0);
  const [gstPercent, setGstPercent] = useState(0);
  const [isCartLoading, setIsCartLoading] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [showCartPage, setShowCartPage] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enableLogin, setEnableLogin] = useState(false);

  // Navigation states
  const [categories, setCategories] = useState([]);
  const [groups, setGroups] = useState([]);
  const [dishes, setDishes] = useState([]);

  const [activeCategory, setActiveCategory] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [tableNo, setTableNo] = useState("");
  const [tableId, setTableId] = useState("");

  const [currentOrderId, setCurrentOrderId] = useState(null);

  const [showPaymentPopup, setShowPaymentPopup] = useState(false);
  const [showOnlinePayment, setShowOnlinePayment] = useState(false);
  const [showPayNowModal, setShowPayNowModal] = useState(false);
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [enableKotQr, setEnableKotQr] = useState(0);
  const [enableCombo, setEnableCombo] = useState(0);
  const [enableOnlinePayment, setEnableOnlinePayment] = useState(true);

  const [showComboCustomizer, setShowComboCustomizer] = useState(false);
  const [comboConfig, setComboConfig] = useState(null);
  const [comboSelections, setComboSelections] = useState({});
  const [comboError, setComboError] = useState(null);
  const [comboLoading, setComboLoading] = useState(false);
  const [comboDishModifiers, setComboDishModifiers] = useState([]);
  const [selectedComboModifierIds, setSelectedComboModifierIds] = useState([]);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [paynowUpiId, setPaynowUpiId] = useState('');
  const [upiUpiId, setUpiUpiId] = useState('');
  const [tempPaynowUpiId, setTempPaynowUpiId] = useState('');
  const [tempUpiUpiId, setTempUpiUpiId] = useState('');

  const [onlinePromoCode, setOnlinePromoCode] = useState("");
  const [appliedOnlinePromo, setAppliedOnlinePromo] = useState(null);
  const [validatingOnlinePromo, setValidatingOnlinePromo] = useState(false);
  const [onlinePromoError, setOnlinePromoError] = useState("");

  const handleApplyOnlinePromo = async () => {
    const code = onlinePromoCode.trim().toUpperCase();
    if (!code) return;
    setValidatingOnlinePromo(true);
    setOnlinePromoError("");
    try {
      const res = await fetch(`${API}/members/promocode/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (res.ok && data.Promocode) {
        const amt = Number(data.Promoamount || data.DiscountValue || 0);
        if (amt <= 0) {
          setOnlinePromoError("Promo code has no remaining balance.");
          return;
        }
        setAppliedOnlinePromo({
          code: data.Promocode,
          amount: amt,
          discountType: (data.DiscountType || "AMOUNT").toUpperCase()
        });
        localStorage.setItem("promoCode", data.Promocode);
        localStorage.setItem("promoAmount", amt);
        setOnlinePromoCode("");
      } else {
        setOnlinePromoError(data.error || "Invalid promo code.");
      }
    } catch (err) {
      console.error(err);
      setOnlinePromoError("Failed to verify promo code.");
    } finally {
      setValidatingOnlinePromo(false);
    }
  };

  const handlePaymentSuccess = (msg) => {
    setCart((prev) => prev.map((item) => ({ ...item, status: "SENT" })));
    setShowPaymentPopup(false);
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };


  // Modal states
  const [showModifier, setShowModifier] = useState(false);
  const [selectedDish, setSelectedDish] = useState(null);
  const [modifiers, setModifiers] = useState([]);
  const [selectedModifierIds, setSelectedModifierIds] = useState([]);

  // Custom Mod states
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [customMods, setCustomMods] = useState([]);

  useEffect(() => {

    const fetchQRs = async () => {
      try {
        const res = await fetch(`${API}/paymodes/qrs`);
        const data = await res.json();

        if (data.paynow) {
          setPaynowUpiId(data.paynow);
          setTempPaynowUpiId(data.paynow);
        }
        if (data.upi) { setUpiUpiId(data.upi); setTempUpiUpiId(data.upi); }
      } catch (err) {
        console.log("FETCH QRS ERROR:", err);
      }
    };
    fetchQRs();

    const loadAppSettings = async () => {
      try {
        const res = await fetch(`${API}/app-settings`);
        const data = await res.json();

        if (data.success) {
          setEnableLogin(Number(data.enableLogin) === 1);
        }
      } catch (err) {
        console.log(err);
      } finally {
        setLoading(false);
      }
    };

    loadAppSettings();

    const loadCompanySettings = async () => {
      try {
        const res = await fetch(`${API}/company/settings`);
        const data = await res.json();

        setServiceChargePercent(
          Number(data.ServiceChargePercentage || 0)
        );
        setGstPercent(
          Number(data.GSTPercentage || 0)
        );
        setEnableKotQr(
          Number(data.Enablekotqr || 0)
        );
        setEnableCombo(
          Number(data.EnableCombo || 0)
        );

        // Fetch General Settings (EnableOnlinePayment)
        try {
          const genRes = await fetch(`${API}/settings`);
          const genData = await genRes.json();
          if (genData) {
            setEnableOnlinePayment(genData.EnableOnlinePayment !== 0 && genData.enableOnlinePayment !== false);
          }
        } catch (e) {}
      } catch (err) {
        console.log(err);
      }
    };

    loadCompanySettings();

    loadKitchens();

    const params = new URLSearchParams(window.location.search);

    const table = params.get("table");
    const tid = params.get("tableId");

    const oldTableId = localStorage.getItem("tableId");

if (oldTableId && oldTableId !== tid) {
  localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("qr_pos_user");
  localStorage.removeItem("promoCode");
  localStorage.removeItem("promoAmount");
  localStorage.removeItem("availableCredit");
}

    if (table) {
      setTableNo(table);
    }

    if (tid) {
      localStorage.setItem("tableId", tid);
      setTableId(tid);
      loadCart(tid);
    }

  }, []);

  useEffect(() => {

    if (!tableNo) return;

    // ✅ FIX: Do not save cart after payment is completed
    if (paymentDone) return;

    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }

    // Track the in-flight save so Refresh can wait for it
    const savePromise = saveCartToBackend();
    pendingSaveRef.current = savePromise;
    savePromise.finally(() => {
      if (pendingSaveRef.current === savePromise) {
        pendingSaveRef.current = null;
      }
    });

  }, [cart, paymentDone]);

  const activeGroupRef = useRef(activeGroup);
  useEffect(() => {
    activeGroupRef.current = activeGroup;
  }, [activeGroup]);

  // Real-time Sync Effect
  useEffect(() => {
    if (!tableId) return;

    // Connect to the base URL (not /api)
    const socket = io(BASE_URL);

    socket.on("connect", () => {
      console.log("Connected to real-time sync server");
      socket.emit("join_table", { tableId });
    });

    socket.on("cart_updated", async (data) => {
      if (data && data.tableId && String(data.tableId).toLowerCase() === String(tableId).toLowerCase()) {
        console.log("Real-time sync: cart updated on another device");
        // Wait for any in-flight local saves to finish first to avoid race conditions
        if (pendingSaveRef.current) {
          try { await pendingSaveRef.current; } catch (_) { }
        }
        await loadCart(tableId);
      }
    });

    socket.on("order_closed", (data) => {
      if (data && data.tableId && String(data.tableId).toLowerCase() === String(tableId).toLowerCase()) {
        console.log("Real-time sync: order closed on another device");
        window.location.reload();
      }
    });

    socket.on("menu_updated", async () => {
      console.log("Real-time sync: menu updated in database");
      await loadKitchens();
      if (activeGroupRef.current) {
        await loadDishes(activeGroupRef.current);
      }
    });

    return () => {
      socket.emit("leave_table", { tableId });
      socket.disconnect();
    };
  }, [tableId]);

  const loadKitchens = async () => {
    try {
      const res = await fetch(`${API}/kitchens`);
      const data = await res.json();

      const safeData = Array.isArray(data) ? data : [];
      setCategories(safeData);

      if (safeData.length > 0) {
        setActiveCategory(safeData[0].CategoryId);
        loadGroups(safeData[0].CategoryId);
      }
    } catch (err) {
      console.log(err);
    }
  };

  const loadGroups = async (categoryId) => {
    try {
      const res = await fetch(`${API}/dishgroups/${categoryId}`);
      const data = await res.json();

      setGroups(data);

      if (data.length > 0) {
        setActiveGroup(data[0].DishGroupId);
        loadDishes(data[0].DishGroupId);
      }
    } catch (err) {
      console.log(err);
    }
  };

  const loadDishes = async (groupId) => {
    try {
      const res = await fetch(`${API}/dishes/group/${groupId}`);
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
      setDishes(data);
    } catch (err) {
      console.log(err);
    }
  };

  const filteredItems = dishes.filter((dish) =>
    dish.Name?.toLowerCase().includes(search.toLowerCase())
  );

  // const openModifiers = async (dish) => {
  //   console.log("Clicked");

  //   if (Number(enableCombo) === 1 && Number(dish.IsCombo) === 1) {
  //     openComboCustomizer(dish);
  //     return;
  //   }

  //   try {
  //     const res = await fetch(`${API}/modifiers/${dish.DishId}`);
  //     const mods = await res.json();

  //     if (mods && mods.length > 0) {
  //       setSelectedDish(dish);
  //       setModifiers(mods);
  //       setSelectedModifierIds([]);
  //       setCustomMods([]);
  //       setShowModifier(true);
  //     } else {
  //       addToCartSimple(dish);
  //     }
  //   } catch (err) {
  //     console.log(err);
  //     addToCartSimple(dish);
  //   }
  // };

  const openModifiers = async (dish) => {
    // Combo
    if (Number(enableCombo) === 1 && Number(dish.IsCombo) === 1) {
      openComboCustomizer(dish);
      return;
    }

    try {
      const res = await fetch(`${API}/modifiers/${dish.DishId}`);

      if (!res.ok) {
        addToCartSimple(dish);
        return;
      }

      const mods = await res.json();
      console.log("Modifiers:", mods);

      if (Array.isArray(mods) && mods.length > 0) {
        setSelectedDish(dish);
        setModifiers(mods);
        setSelectedModifierIds([]);
        setCustomMods([]);
        setShowModifier(true);
      } else {
        addToCartSimple(dish);
      }
    } catch (err) {
      console.log(err);
      addToCartSimple(dish);
    }
  };

  const openComboCustomizer = async (dish) => {
    console.log("Inside Combo");
    setSelectedDish(dish);
    setComboLoading(true);
    setComboError(null);
    setComboSelections({});
    setComboDishModifiers([]);
    setSelectedComboModifierIds([]);
    setShowComboCustomizer(true);
    console.log("Modal opened");
    try {
      const [res, modRes] = await Promise.all([
        fetch(`${API}/combo/config/${dish.DishId}`),
        fetch(`${API}/modifiers/${dish.DishId}`).catch(() => null)
      ]);

      if (modRes && modRes.ok) {
        const modData = await modRes.json();
        if (Array.isArray(modData)) {
          setComboDishModifiers(modData);
        }
      }

      if (!res.ok) throw new Error("Failed to load combo options.");
      const payload = await res.json();
      if (payload.success && payload.data) {
        const config = payload.data;
        setComboConfig(config);

        // Auto-select defaults
        const initialSelections = {};
        (config.groups || []).forEach((group) => {
          let defaults = (group.options || []).filter(o => o.isDefault).map(o => o.dishId);
          if (!group.isMultiSelect || group.maxSelection === 1) {
            defaults = defaults.slice(0, 1);
          }
          if (defaults.length === 0 && group.minSelection > 0 && group.options && group.options.length > 0) {
            defaults = [group.options[0].dishId];
          }
          initialSelections[group.comboGroupId] = defaults;
        });
        setComboSelections(initialSelections);
      } else {
        throw new Error(payload.error || "Failed to load combo config.");
      }
    } catch (err) {
      console.error("Combo config fetch error:", err);
      setComboError(err.message || "Something went wrong.");
    } finally {
      setComboLoading(false);
    }
  };

  const handleSelectComboOption = (groupId, option, isMulti, maxSelect) => {
    setComboError(null);
    setComboSelections((prev) => {
      const current = prev[groupId] || [];
      if (current.includes(option.dishId)) {
        return {
          ...prev,
          [groupId]: current.filter((id) => id !== option.dishId)
        };
      } else {
        if (isMulti) {
          if (current.length >= maxSelect) {
            return prev;
          }
          return {
            ...prev,
            [groupId]: [...current, option.dishId]
          };
        } else {
          return {
            ...prev,
            [groupId]: [option.dishId]
          };
        }
      }
    });
  };

  const handleToggleComboModifier = (modId) => {
    setSelectedComboModifierIds((prev) =>
      prev.includes(modId)
        ? prev.filter((id) => id !== modId)
        : [...prev, modId]
    );
  };

  const calculateComboTotal = () => {
    if (!comboConfig) return 0;

    let totalSurcharge = 0;
    (comboConfig.groups || []).forEach(group => {
      const selectedIds = comboSelections[group.comboGroupId] || [];
      const selectedOptions = (group.options || []).filter(o => selectedIds.includes(o.dishId));
      selectedOptions.forEach(opt => {
        totalSurcharge += (Number(opt.surcharge) || 0) + (Number(opt.dishPrice) || 0);
      });
    });

    const chosenModifiers = comboDishModifiers
      .filter(m => selectedComboModifierIds.includes(String(m.ModifierID || m.ModifierId || "")));
    const modifierPriceTotal = chosenModifiers.reduce((sum, m) => sum + (Number(m.Price) || 0), 0);

    return (Number(comboConfig.basePrice) || 0) + totalSurcharge + modifierPriceTotal;
  };

  const handleAddComboToCart = () => {
    if (!comboConfig || !selectedDish) return;

    // Validate minimum selections
    for (const group of comboConfig.groups) {
      const selectedIds = comboSelections[group.comboGroupId] || [];
      const effectiveMin = group.options && group.options.length > 0 ? Math.min(group.minSelection, group.options.length) : 0;
      if (selectedIds.length < effectiveMin) {
        setComboError(`Please pick at least ${effectiveMin} choice(s) for "${group.groupName}"`);
        return;
      }
    }

    // Build selected modifiers list
    const chosenModifiers = comboDishModifiers
      .filter(m => selectedComboModifierIds.includes(String(m.ModifierID || m.ModifierId || "")))
      .map(m => ({
        ModifierID: String(m.ModifierID || m.ModifierId || ""),
        ModifierName: m.ModifierName,
        Price: Number(m.Price || 0),
        qty: 1,
      }));

    // Build the selection details payload
    const chosenSelections = comboConfig.groups.map(group => {
      const selectedIds = comboSelections[group.comboGroupId] || [];
      const selectedOptions = group.options.filter(o => selectedIds.includes(o.dishId));
      return {
        groupId: group.comboGroupId,
        groupName: group.groupName,
        items: selectedOptions.map(o => ({
          dishId: o.dishId,
          name: o.name,
          surcharge: o.surcharge,
          dishPrice: o.dishPrice || 0,
          KitchenTypeCode: o.KitchenTypeCode,
          KitchenTypeName: o.KitchenTypeName,
          PrinterIP: o.PrinterIP,
        }))
      };
    });

    // Sum surcharges and dish prices
    let totalSurcharge = 0;
    chosenSelections.forEach(grp => {
      grp.items.forEach(opt => {
        totalSurcharge += (Number(opt.surcharge) || 0) + (Number(opt.dishPrice) || 0);
      });
    });

    const modifierPriceTotal = chosenModifiers.reduce((sum, m) => sum + (Number(m.Price) || 0), 0);
    const finalPrice = (Number(comboConfig.basePrice) || 0) + totalSurcharge + modifierPriceTotal;
    console.log("chosenModifiers:", chosenModifiers);
    const newCartItem = {
      ...selectedDish,
      cartId: crypto.randomUUID(),
      qty: 1,
      isCombo: true,
      price: finalPrice,
      Price: finalPrice,
      basePrice: comboConfig.basePrice,
      comboSelections: chosenSelections,
      selectedMods: chosenModifiers,
      modifiers: chosenModifiers,
      status: "NEW"
    };

    // actionRef.current = "INSERT";
    // setCart(prev => [...prev, newCartItem]);
    // setShowComboCustomizer(false);
    actionRef.current = "INSERT";

setCart(prev => {
    const existing = prev.find(item =>
        (item.DishId || item.id) === (selectedDish.DishId || selectedDish.id) &&
        (item.comboSelections || []).length === 0 &&
        JSON.stringify(item.selectedMods || []) === JSON.stringify(chosenModifiers) &&
        item.status !== "SENT"
    );

  if (existing) {
    return prev.map(item =>
      item === existing
        ? {
            ...item,
            qty: (item.qty || 1) + 1,
            status: "NEW"
          }
        : item
    );
  }

  return [...prev, newCartItem];
});

setShowComboCustomizer(false);
  };

  const handleAddBaseComboDirectly = () => {
    if (!selectedDish) return;

    const chosenModifiers = comboDishModifiers
      .filter(m => selectedComboModifierIds.includes(String(m.ModifierID || m.ModifierId || "")))
      .map(m => ({
        ModifierID: String(m.ModifierID || m.ModifierId || ""),
        ModifierName: m.ModifierName,
        Price: Number(m.Price || 0),
        qty: 1,
      }));

    const modifierPriceTotal = chosenModifiers.reduce((sum, m) => sum + (Number(m.Price) || 0), 0);
    const finalPrice = Number(selectedDish.Price || selectedDish.price || 0) + modifierPriceTotal;
    console.log("chosenModifiers:", chosenModifiers);
    const newCartItem = {
      ...selectedDish,
      cartId: crypto.randomUUID(),
      qty: 1,
      isCombo: true,
      price: finalPrice,
      Price: finalPrice,
      selectedMods: chosenModifiers,
      modifiers: chosenModifiers,
      comboSelections: [],
      status: "NEW"
    };

    // actionRef.current = "INSERT";
    // setCart(prev => [...prev, newCartItem]);
    // setShowComboCustomizer(false);
    actionRef.current = "INSERT";

setCart(prev => {
const existing = prev.find(item =>
  (item.DishId || item.id) === (selectedDish.DishId || selectedDish.id) &&
  (item.comboSelections || []).length === 0 &&
  JSON.stringify(item.selectedMods || []) === JSON.stringify(chosenModifiers) &&
  item.status !== "SENT"
);

  if (existing) {
    return prev.map(item =>
      item === existing
        ? {
            ...item,
            qty: (item.qty || 1) + 1,
            status: "NEW"
          }
        : item
    );
  }

  return [...prev, newCartItem];
});

setShowComboCustomizer(false);
  };

  const loadModifiers = async (dishId) => {
    try {
      const res = await fetch(`${API}/modifiers/${dishId}`);
      const data = await res.json();

      const hasOpen = data.some(
        (m) =>
          m.ModifierName?.toUpperCase() === "OPEN"
      );

      if (!hasOpen) {
        data.push({
          ModifierID: "open",
          ModifierName: "OPEN",
          Price: 0,
        });
      }

      setModifiers(data);
    } catch (err) {
      console.log(err);
    }
  };
  const addToCartSimple = async (dish) => {
    actionRef.current = "INSERT";
    setCart((prev) => {

      // const existing = prev.find(
      //   (item) =>
      //     (item.DishId || item.id) === dish.DishId
      // );

    console.log("Clicked DishId:", dish.DishId);

prev.forEach((x) => {
  console.log(
    "Cart DishId:", x.DishId,
    "id:", x.id,
    "status:", x.status
  );
});

const existing = prev.find(
  (item) =>
    (item.DishId || item.id) === dish.DishId &&
    item.status !== "SENT"
);

      // already exists
      if (existing) {
        return prev.map((item) =>
          (item.DishId || item.id) === dish.DishId
            ? {
              ...item,
              qty: (item.qty || 1) + 1,
              status: "NEW",
            }
            : item
        );
      }

      // new item
      return [
        ...prev,
        {
          ...dish,
          cartId: crypto.randomUUID(),

          qty: 1,

          selectedMods: [],

          finalPrice: Number(dish.Price || 0),
          status: "NEW",
        }
      ];
    });

  };

  const increaseQty = (index) => {
    actionRef.current = "UPDATE";
    setCart((prev) =>

      prev.map((item, i) =>

        i === index
          ? {
            ...item,
            qty: Number(item.qty || 1) + 1,
          }
          : item
      )
    );
  };

  const decreaseQty = async (index) => {
    const item = cart[index];
    if (!item) return;

    let currentQty = Number(item.qty);
    if (isNaN(currentQty)) currentQty = 1;

    // qty = 1 → delete from DB
    if (currentQty <= 1) {

      // ✅ Set skipSaveRef BEFORE setCart so the useEffect does NOT fire
      // saveCartToBackend automatically — preventing a race with the delete API
      skipSaveRef.current = true;
      deleteInProgressRef.current = true;
      actionRef.current = "DELETE";

      // Optimistic UI update: reliably remove by exact index
      if (cart.length === 1) {
        setCurrentOrderId(null);
        currentOrderIdRef.current = null;
      }
      setCart((prev) => {
        const newCart = [...prev];
        newCart.splice(index, 1);
        return newCart;
      });

      try {
        let actualLineItemId = item.lineItemId || item.OrderDetailId;

        // If no DB ID in state, fetch once from DB to find it
        if (!actualLineItemId && tableId) {
          try {
            const cartRes = await fetch(`${API}/order/cart/${tableId}`);
            const cartData = await cartRes.json();
            const match = cartData?.items?.find(b =>
              String(b.id || b.DishId || b.dishId) === String(item.DishId || item.id)
            );
            if (match) {
              actualLineItemId = match.lineItemId || match.OrderDetailId;
            }
          } catch (e) {
            console.log("Fetch lineItemId error:", e);
          }
        }

        if (actualLineItemId) {
          await fetch(`${API}/order/delete-cart-item`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId: tableId,
              lineItemId: actualLineItemId,
            }),
          });
          console.log("DELETE ITEM: sent delete for", actualLineItemId);
        } else {
          console.warn("DELETE ITEM: no lineItemId found, skipping DB delete");
        }

      } catch (err) {
        console.log("DELETE ITEM ERROR:", err);
      } finally {
        deleteInProgressRef.current = false;
      }

      return;
    }

    // decrease qty
    actionRef.current = "UPDATE";
    setCart((prev) => {
      const newCart = [...prev];
      newCart[index] = { ...newCart[index], qty: currentQty - 1 };
      return newCart;
    });

  };

  // Online payment flow using YeahPay demo

  const handlePayOnline = async () => {
    // Calculate total amount inside the function/

    //OLD PROCESS---------------------------
    // const totalAmount = cart.reduce((s, i) =>
    //   s + (Number(i.Price || i.price || 0) * Number(i.qty || 1)), 0
    // ).toFixed(2);

    // console.log("Opening payment for amount:", totalAmount);
    // console.log("POS Order ID:", currentOrderId);

    //NEW PROCESS---------------------------

    const eligibleAmount = cart.reduce(
      (sum, item) =>
        item.IsServiceCharge
          ? sum +
          Number(item.Price || item.price || 0) *
          Number(item.qty || 1)
          : sum,
      0
    );

    // Service Charge
    const serviceCharge =
      eligibleAmount * (serviceChargePercent / 100);

    // Cart Subtotal
    const subTotal = cart.reduce(
      (sum, item) =>
        sum +
        Number(item.Price || item.price || 0) *
        Number(item.qty || 1),
      0
    );

    const promoAmount = Number(localStorage.getItem("promoAmount") || 0);

    // GST & Final Total Calculation
    const netSubTotal = Math.max(0, subTotal - promoAmount);
    const beforeGST = netSubTotal + serviceCharge;

    const gstAmount = beforeGST * (gstPercent / 100);

    // Final Total
    const totalAmount = (beforeGST + gstAmount).toFixed(2);

    console.log("Subtotal:", subTotal);
    console.log("Eligible:", eligibleAmount);
    console.log("Service Charge:", serviceCharge);
    console.log("Grand Total:", totalAmount);

    // 👇 Continue with your existing payment logic
    console.log("Opening payment for amount:", totalAmount);
    console.log("POS Order ID:", currentOrderId);
    // Pass the real POS orderId as posOrderId so we can use it on success
    // (YeahPay generates its own orderId which does NOT match our DB OrderNumber)
    const demoUrl = `https://yeahpay-demo-production.up.railway.app?amount=${totalAmount}&orderId=${currentOrderId}&posOrderId=${encodeURIComponent(currentOrderId)}&from=pos`;

    const paymentWindow = window.open(demoUrl, '_blank', 'width=500,height=700');

    if (!paymentWindow) {
      alert("Popup blocked! Please allow popups for this site.");
      return;
    }

    // Capture the POS orderId at time of opening (closure)
    const posOrderIdAtOpen = currentOrderId;

    // Listen for payment success message
    const handleMessage = (event) => {
      if (event.data.type === 'YEAHPAY_PAYMENT_SUCCESS') {
        console.log("Payment success message received:", event.data);

        // Remove event listener
        window.removeEventListener('message', handleMessage);

        // Use the real POS orderId (posOrderId from event, or fallback to captured one)
        // The YeahPay demo may send back posOrderId if it forwards it; otherwise use our captured value
        const realPosOrderId = event.data.posOrderId || posOrderIdAtOpen;
        console.log("Using POS OrderId for DB update:", realPosOrderId);

        // Complete the order using the real POS orderId
        completeOrder(realPosOrderId, totalAmount);

        // Close the payment window
        if (paymentWindow) paymentWindow.close();
      }
    };

    window.addEventListener('message', handleMessage);
  };

  // const completeOrder = async (orderId, amount) => {
  //     try {
  //         const res = await fetch(`${API}/sales/save`, {
  //             method: "POST",
  //             headers: { "Content-Type": "application/json" },
  //             body: JSON.stringify({
  //                 orderId: orderId,
  //                 tableNo: tableNo,
  //                 tableId: tableId,
  //                 subTotal: parseFloat(amount),
  //                 totalAmount: parseFloat(amount),
  //                 paymentMethod: "ONLINE",
  //                 items: cart.map((item) => ({
  //                     id: item.DishId || item.id,
  //                     name: item.Name || item.name,
  //                     qty: Number(item.qty || 1),
  //                     price: Number(item.Price || item.price || 0)
  //                 }))
  //             })
  //         });

  //         const data = await res.json();
  //         if (data.success) {
  //             // Clear cart
  //             setCart([]);
  //             // Show success message
  //             handlePaymentSuccess(`Payment Successful! Amount: S$${amount}`);
  //             // Redirect to settlement success
  //             setTimeout(() => {
  //                 window.location.href = `/settlement-success?tableId=${tableId}&table=${tableNo}&orderId=${orderId}`;
  //             }, 1500);
  //         } else {
  //             alert(data.error || "Payment Failed");
  //         }
  //     } catch (err) {
  //         console.log("COMPLETE ORDER ERROR:", err);
  //         alert("Server Error: " + err.message);
  //     }
  // };

  const completeOrder = async (posOrderId, amount) => {
    try {
      console.log("[completeOrder] Using POS orderId:", posOrderId, "Amount:", amount);
      const promoAmount = Number(localStorage.getItem("promoAmount") || 0);
      // CALL UNIFIED BACKEND ROUTE
      const res = await fetch(`${API}/order/complete-online-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          orderId: posOrderId,
          tableNo: tableNo,
          tableId: tableId,
          totalAmount: parseFloat(amount),
          paymentMethod: "YEAHPAY PAYNOW",
          promoAmount,
          cart: cart
        })
      });


      const data = await res.json();
      console.log("UNIFIED COMPLETE PAYMENT RESPONSE:", data);

      if (!data.success) {
        alert(data.error || "Settlement Failed");
        return;
      }

      // 4. SUCCESS MESSAGE
      setPaymentDone(true);
      handlePaymentSuccess(`Payment Successful! Amount: S$${amount}`);

      // 5. OPEN SETTLEMENT PAGE
      setTimeout(() => {
        window.location.href =
          `/settlement-success?tableId=${tableId}&table=${tableNo}&orderId=${posOrderId}`;
      }, 1000);

    } catch (err) {

      console.log("COMPLETE ORDER ERROR:", err);
      alert("Server Error: " + err.message);
    }
  };

  const saveCartToBackend = async () => {
    console.log("SAVE CART CALLED");
    // ✅ FIX: Prevent inserting new records into RestaurantOrderDetailCur after payment
    if (paymentDone) {
      console.log("[saveCart] Skipped — payment already done.");
      setIsCartLoading(false);
      return;
    }
    setIsCartLoading(true);
    try {

      const payload = {

        tableId: tableId,

        orderId: currentOrderId,

        userId: "00000000-0000-0000-0000-000000000000",

        items: cart.map((item) => ({

          id: item.DishId || item.id,

          name: item.Name || item.name,

          qty: item.qty || 1,

          price: item.Price || item.price || 0,

          modifiers: (item.selectedMods || [])
            .filter((m) =>
              /^[0-9a-fA-F-]{36}$/.test(m.ModifierID || m.ModifierId)
            )
            .map((m) => ({
              ModifierId: m.ModifierID || m.ModifierId,
              ModifierName: m.ModifierName,
              Price: m.Price || 0,
              qty: 1,
            })),

          comboSelections: item.comboSelections || [],
          // lineItemId: item.lineItemId || item.OrderDetailId || null,
          lineItemId:
  item.status === "NEW"
    ? null
    : (item.lineItemId || item.OrderDetailId || null),

          note: item.note || "",

          status: "NEW",
        })),
      };

      console.log("SAVE PAYLOAD:", JSON.stringify(payload, null, 2));

      const res = await fetch(`${API}/order/save-cart`, {

        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(payload),
      });

      const data = await res.json();

      console.log("SAVE CART:", data);

      if (data.orderId) {
        setCurrentOrderId(data.orderId);
        currentOrderIdRef.current = data.orderId;
      }

      if (tableId && !deleteInProgressRef.current) {
        if (actionRef.current === "UPDATE") {
          // Selectively sync qty + lineItemId from backend WITHOUT overwriting
          // selectedMods, finalPrice, or other local state (fixes modifier reset bug)
          try {
            await new Promise(r => setTimeout(r, 600));
            const cartRes = await fetch(`${API}/order/cart/${tableId}`);
            const cartData = await cartRes.json();

            if (cartData && cartData.items) {
                  skipSaveRef.current = true;
              setCart(prev => {
                let changed = false;
                const updatedCart = prev.map(item => {
                  const match = cartData.items.find(b =>
                    (b.OrderDetailId || b.lineItemId) &&
                    (b.OrderDetailId || b.lineItemId) === (item.OrderDetailId || item.lineItemId)
                  );
                  if (match) {
                    const newQty = match.qty || match.Quantity || item.qty;
                    if (
                      newQty !== item.qty ||
                      match.OrderDetailId !== item.OrderDetailId
                    ) {
                      changed = true;
                      return {
                        ...item,
                        qty: newQty,
                        OrderDetailId: match.OrderDetailId || item.OrderDetailId,
                        lineItemId: match.OrderDetailId || match.lineItemId || item.lineItemId,
                      };
                    }
                  }
                  return item;
                });
                if (changed) {
                  skipSaveRef.current = true;
                  return updatedCart;
                }
                return prev;
              });
            }
          } catch (syncErr) {
            console.log("Refresh GET error:", syncErr);
          }
        } else if (actionRef.current === "INSERT") {
          // Silently sync real OrderDetailIds for new items without overwriting optimistic quantities
          try {
            const cartRes = await fetch(`${API}/order/cart/${tableId}`);
            const cartData = await cartRes.json();

            if (cartData && cartData.items) {
              setCart(prev => {
                let changed = false;
                const updatedCart = prev.map(item => {
                  if (!item.OrderDetailId && !item.lineItemId) {
                    // const match = cartData.items.find(b =>
                    //   (b.id || b.DishId || b.dishId) == (item.DishId || item.id)
                    // );

                    const match = cartData.items.find((b) => {
                      const dbModKey = (b.modifiers || [])
                        .map((m) => m.ModifierId || m.ModifierID)
                        .sort()
                        .join("-");

                      const itemModKey = (item.selectedMods || [])
                        .map((m) => m.ModifierID || m.ModifierId)
                        .sort()
                        .join("-");

                      return (
                        (b.id || b.DishId || b.dishId) === (item.DishId || item.id) &&
                        dbModKey === itemModKey
                      );
                    });
                    if (match && (match.OrderDetailId || match.lineItemId)) {
                      changed = true;
                      return {
                        ...item,
                        OrderDetailId: match.OrderDetailId || match.lineItemId,
                        lineItemId: match.OrderDetailId || match.lineItemId
                      };
                    }
                  }
                  return item;
                });

                if (changed) {
                  skipSaveRef.current = true;
                  return updatedCart;
                }
                return prev;
              });
            }
          } catch (syncErr) {
            console.log("Silent ID sync error:", syncErr);
          }
        }
      }

    } catch (err) {

      console.log("SAVE CART ERROR:", err);
    } finally {
      setIsCartLoading(false);
    }
  };

  const placeOrder = async () => {
    setIsCartLoading(true);
    try {

      const promoCodeUsed = localStorage.getItem("promoCode") || "";
      const promoAmountUsed = Number(localStorage.getItem("promoAmount") || 0);

      const payload = {

        tableId: tableId,

        orderId: currentOrderId,

        userId: "00000000-0000-0000-0000-000000000000",

        entryStatus: "q",

        // 🔥 Include QR promo discount so POS sees it in RestaurantOrderCur
        discountAmount: promoAmountUsed > 0 ? promoAmountUsed : undefined,
        discountRemarks: promoAmountUsed > 0 && promoCodeUsed ? `Applied Promo Code: ${promoCodeUsed}` : undefined,

        items: cart.map((item) => ({

          id: item.DishId || item.id,

          name: item.Name || item.name,

          qty: item.qty || 1,

          price: item.Price || item.price || 0,

          modifiers: (item.selectedMods || [])
            .filter((m) =>
              /^[0-9a-fA-F-]{36}$/.test(m.ModifierID || m.ModifierId)
            )
            .map((m) => ({
              ModifierId: m.ModifierID || m.ModifierId,
              ModifierName: m.ModifierName,
              Price: m.Price || 0,
              qty: 1,
            })),

          comboSelections: item.comboSelections || [],
          // lineItemId: item.lineItemId || item.OrderDetailId || null,
          lineItemId:
  item.status === "NEW"
    ? null
    : (item.lineItemId || item.OrderDetailId || null),

          note: item.note || "",

          status: item.status || "NEW",
        })),
      };

      const res = await fetch(`${API}/order/send`, {

        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify(payload),
      });

      const data = await res.json();

      console.log("ORDER SEND:", data);

      if (data.success) {
        setCart(prev =>
    prev.map(item => ({
      ...item,
      status: "SENT"
    }))
  );
        if (data.orderId) {
          setCurrentOrderId(data.orderId);
          currentOrderIdRef.current = data.orderId;
        }

        const totalAmount =
          cart.reduce((s, i) => s + (Number(i.Price || i.price || 0) * Number(i.qty || 1)), 0).toFixed(2);
        setShowPaymentPopup(true);
      }
      else {
        alert(data.error || "This order has already been placed by another customer. Your cart has been refreshed.");
      }

    } catch (err) {

      console.log("PLACE ORDER ERROR:", err);

      alert("Server Error");
    } finally {
      setIsCartLoading(false);
    }
  };
  const loadCart = async (tableId) => {

    try {

      const res = await fetch(`${API}/order/cart/${tableId}`);

      const data = await res.json();

      console.log("LOAD CART API RESPONSE BEFORE setCart:", data);
      console.log("LOAD CART RESPONSE:", data);
console.log("CurrentOrderId From API:", data.currentOrderId);
console.log("Items:", data.items);
      console.log("LOAD CART:", data);

      console.log("LOAD CART ITEMS:", JSON.stringify(data.items, null, 2));

      if (data.items) {

        const fromDB = data.items.map((item) => ({

          ...item,
          isServiceCharge: Number(item.isServiceCharge || 0),

          lineItemId:
            item.OrderDetailId ||
            item.lineItemId,

          cartId:
            item.OrderDetailId ||
            crypto.randomUUID(),

          selectedMods:
            item.modifiers || [],

          comboSelections:
            item.comboSelections ||
            (item.ComboDetailsJSON
              ? JSON.parse(item.ComboDetailsJSON)
              : []),
        }));

        // Merge: keep any locally-added items that haven't been persisted yet
        // (no OrderDetailId/lineItemId means they haven't reached the DB)
        skipSaveRef.current = true;
        setCart(prev => {
          const dbIds = new Set(
            fromDB
              .map(i => i.OrderDetailId || i.lineItemId)
              .filter(Boolean)
          );
          // Local items not yet in DB (no server ID)
          const localOnly = prev.filter(
            item =>
              !item.OrderDetailId &&
              !item.lineItemId &&
              item.status === "NEW"
          );
          return [...fromDB, ...localOnly];
          console.log("Current Order ID:", currentOrderId);
console.log("Table ID:", tableId);
        });
      }

      if (data.currentOrderId !== undefined) {
        setCurrentOrderId(data.currentOrderId);
        currentOrderIdRef.current = data.currentOrderId;
      }

    } catch (err) {

      console.log("LOAD CART ERROR:", err);
    }
  };
  const toggleModifier = (mod) => {
    if (mod.ModifierName.toUpperCase() === "OPEN") {
      setShowCustomModal(true);
      return;
    }

    setSelectedModifierIds((prev) => {
      if (prev.includes(mod.ModifierID)) {
        return prev.filter((id) => id !== mod.ModifierID);
      } else {
        return [...prev, mod.ModifierID];
      }
    });
  };

  const addCustomMod = () => {
    if (!customItemName.trim()) return;
    const newId = `custom-${Date.now()}`;
    const newMod = {
      ModifierID: newId,
      ModifierName: customItemName,
      Price: parseFloat(customItemPrice) || 0,
    };

    setCustomMods((prev) => [...prev, newMod]);
    setSelectedModifierIds((prev) => [...prev, newId]);

    setShowCustomModal(false);
    setCustomItemName("");
    setCustomItemPrice("");
  };

  const addWithModifiers = () => {
    console.count("ADD WITH MODIFIERS");
    if (!selectedDish) return;
    actionRef.current = "INSERT";

    const allAvailable = [...modifiers, ...customMods];

    const selectedMods = allAvailable.filter((m) =>
      selectedModifierIds.includes(m.ModifierID)
    );

    const extra = selectedMods.reduce(
      (sum, m) => sum + Number(m.Price || 0),
      0
    );

    const finalPrice =
      Number(selectedDish.Price || 0) +
      Number(extra);

    setCart((prev) => {

      // same dish + same modifiers (and not sent yet)
      const existing = prev.find((item) => {
        const itemDishId = item.DishId || item.id;
        const selectedDishId = selectedDish.DishId || selectedDish.id;

        const itemModKey = (item.selectedMods || [])
          .map((m) => m.ModifierID || m.ModifierId)
          .sort()
          .join("-");

        const selectedModKey = selectedMods
          .map((m) => m.ModifierID || m.ModifierId)
          .sort()
          .join("-");

        return (
          itemDishId === selectedDishId &&
          item.status !== "SENT" &&
          itemModKey === selectedModKey
        );
      });

      // increase qty
      if (existing) {
        return prev.map((item) =>
          item === existing
            ? {
              ...item,
              qty: (item.qty || 1) + 1,
              status: "NEW",
            }
            : item
        );
      }

      const modKey = selectedMods
        .map((m) => m.ModifierID || m.ModifierId)
        .sort()
        .join("-");

      // new cart item
      return [
        ...prev,
        {
          ...selectedDish,

          cartId: crypto.randomUUID(),

          qty: 1,

          selectedMods,

          finalPrice,

          modifierKey: modKey,

          status: "NEW",
        },
      ];
    });

    setShowModifier(false);
  };

  const saveUpiId = async (type, upiId) => {
    if (type === 'paynow') {
      setPaynowUpiId(upiId);
    } else if (type === 'upi') {
      setUpiUpiId(upiId);
    }
    try {
      await fetch(`${API}/paymodes/update-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payMode: type, upiId: upiId })
      });
    } catch (err) {
      console.log("SAVE UPI ID ERROR:", err);
    }
  };

  // SVGs for Icons
  const SettingsIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  );

  const BackIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
  );

  const SearchIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
  );

  const CartIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
  );

  const ForkKnifeIcon = () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path></svg>
  );

  const BurgerDrinkIcon = () => (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
      <line x1="6" y1="1" x2="6" y2="4"></line>
      <line x1="10" y1="1" x2="10" y2="4"></line>
      <line x1="14" y1="1" x2="14" y2="4"></line>
    </svg>
  );

  const GPayBrand = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', fontSize: '12px', color: '#5f6368' }}>
      <span style={{ display: 'flex' }}>
        <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
      </span>
      Pay
    </div>
  );

  const MastercardBrand = () => (
    <svg width="28" height="18" viewBox="0 0 24 16">
      <circle cx="8" cy="8" r="8" fill="#EB001B" />
      <circle cx="16" cy="8" r="8" fill="#F79E1B" fillOpacity="0.8" />
    </svg>
  );

  const UnionPayBrand = () => (
    <div style={{ background: '#fff', border: '1px solid #ccc', borderRadius: '4px', padding: '1px 3px', fontSize: '6px', fontWeight: 'bold', display: 'flex', flexDirection: 'column', lineHeight: 1.1, alignItems: 'center', width: '30px' }}>
      <span style={{ color: '#d9251c', transform: 'scale(0.9)' }}>UnionPay</span>
      <span style={{ color: '#004f9e', transform: 'scale(0.9)' }}>银联</span>
    </div>
  );

  const ApplePayBrand = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 'bold', fontSize: '13px', color: '#000' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16.36 14.08c-.03-2.92 2.39-4.32 2.5-4.39-1.36-1.99-3.46-2.25-4.21-2.28-1.78-.18-3.48 1.05-4.4 1.05-.92 0-2.31-1.02-3.8-1-1.95.03-3.76 1.13-4.76 2.87-2.03 3.53-.52 8.75 1.45 11.59.96 1.39 2.08 2.94 3.6 2.89 1.46-.06 2.02-.95 3.79-.95 1.76 0 2.27.95 3.82.92 1.57-.03 2.54-1.42 3.49-2.81 1.1-1.61 1.55-3.17 1.57-3.25-.03-.01-2.99-1.15-3.05-4.64zM13.88 5.76c.8-.97 1.34-2.32 1.19-3.66-1.16.05-2.58.78-3.41 1.76-.73.86-1.35 2.24-1.18 3.55 1.3.1 2.6-.66 3.4-1.65z" /></svg>
      Pay
    </div>
  );

  const VisaBrand = () => (
    <div style={{ color: '#1434CB', fontWeight: '900', fontStyle: 'italic', fontSize: '15px', letterSpacing: '-1px' }}>VISA</div>
  );

  const AmexBrand = () => (
    <div style={{ background: '#2671B9', color: '#fff', fontSize: '6px', fontWeight: 'bold', padding: '2px', borderRadius: '2px', lineHeight: 1.1, width: '28px', textAlign: 'center' }}>
      AMERICAN<br />EXPRESS
    </div>
  );

  const CashBrand = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="24" height="20" viewBox="0 0 40 30" fill="none">
        <rect x="2" y="4" width="28" height="16" rx="2" fill="#2ECC71" />
        <circle cx="16" cy="12" r="3" fill="#27AE60" />
        <circle cx="26" cy="20" r="6" fill="#F1C40F" stroke="#F39C12" strokeWidth="1" />
        <circle cx="32" cy="16" r="5" fill="#F1C40F" stroke="#F39C12" strokeWidth="1" />
      </svg>
    </div>
  );

  const VoucherBrand = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="24" height="16" viewBox="0 0 40 30" fill="none">
        <rect x="4" y="6" width="30" height="16" fill="#FFF1E6" stroke="#FF9F43" strokeWidth="1" strokeDasharray="3 2" />
        <rect x="14" y="6" width="6" height="16" fill="#FF9F43" />
        <text x="12" y="16" fontSize="6" fill="#d35400" fontWeight="bold">VOUCHER</text>
      </svg>
    </div>
  );

  const NetsBrand = () => (
    <div style={{ color: '#E51937', fontWeight: '900', fontStyle: 'italic', fontSize: '12px', letterSpacing: '-1px' }}>NETS</div>
  );

  const PayNowBrand = () => (
    <div style={{ color: '#7B1FA2', fontWeight: '900', fontSize: '10px', display: 'flex', flexDirection: 'column', lineHeight: 0.9, alignItems: 'center' }}>
      <span>PAY</span>
      <span>N<span style={{ color: '#E51937' }}>O</span>W</span>
    </div>
  );

  // const handleRefresh = async () => {
  //   await loadKitchens();
  //   if (tableId) {
  //     await loadCart(tableId);
  //   }
  // };

  // const totalAmount
  //   = cart.reduce((s, i) => s +
  //     (Number(i.Price || i.price || 0) *
  //       Number(i.qty || 1)), 0).toFixed(2);

  // return (

  const handleRefresh = async () => {
    await loadKitchens();
    if (tableId) {
      await loadCart(tableId);
    }
  };

  // Subtotal — sum of all cart items
  const subTotal = cart.reduce(
    (sum, item) =>
      sum +
      Number(item.Price || item.price || 0) *
      Number(item.qty || 1),
    0
  );

  // Service Charge Calculation — applied to full subtotal
 const serviceChargeEligibleTotal = cart.reduce(
  (sum, item) =>
    Number(item.isServiceCharge || 0) === 1
      ? sum +
        Number(item.Price || item.price || 0) *
        Number(item.qty || 1)
      : sum,
  0
);

const serviceCharge =
  serviceChargeEligibleTotal * (serviceChargePercent / 100);

  const promoAmount = Number(localStorage.getItem("promoAmount") || 0);
  const promoCodeUsed = localStorage.getItem("promoCode") || "";
  const netSubTotal = Math.max(0, subTotal - promoAmount);
  const beforeGST = netSubTotal + serviceCharge;

  const gstAmount = beforeGST * (gstPercent / 100);

  const totalAmount = (beforeGST + gstAmount).toFixed(2);

  console.log("Cart:", cart);
console.log("Eligible Total:", serviceChargeEligibleTotal);
console.log("Service Charge %:", serviceChargePercent);
console.log("Service Charge:", serviceCharge);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (enableLogin && !isLoggedIn) {
    return (
      <LoginPage
        onLoginSuccess={() => {
          window.location.reload();
        }}
      />
    );
  }

  return (

    <Routes>

      <Route
        path="/"
        element={

          // <div className="pos-app">
          <PullToRefresh onRefresh={handleRefresh} backgroundColor="#f97316" pullingContent={""}>
            <div className="pos-app">
              {isCartLoading && (
                <div className="modal-overlay" style={{ zIndex: 99999, flexDirection: 'column', cursor: 'wait' }}>
                  <div style={{ width: '50px', height: '50px', border: '5px solid rgba(255,255,255,0.3)', borderTop: '5px solid #f97316', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                  <div style={{ color: '#fff', marginTop: '16px', fontSize: '18px', fontWeight: 'bold' }}>Loading...</div>
                  <style>
                    {`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}
                  </style>
                </div>
              )}
              {/* Top Header */}
              <div className="pos-header">
                {/* <button className="icon-btn" onClick={() => setShowSettingsModal(true)}>
          <SettingsIcon />
        </button> */}
                {!isSearchOpen ? (
                  <button className="icon-btn" onClick={() => setIsSearchOpen(true)} style={{ border: 'none', background: 'transparent' }}>
                    <SearchIcon />
                  </button>
                ) : (
                  <div className="search-wrap" style={{ display: 'flex', alignItems: 'center' }}>
                    <SearchIcon />
                    <input
                      type="text"
                      placeholder="Search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      autoFocus
                      onBlur={() => {
                        if (!search) setIsSearchOpen(false);
                      }}
                      style={{ outline: 'none', border: 'none', marginLeft: '5px' }}
                    />
                    <button onClick={() => { setIsSearchOpen(false); setSearch(""); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888' }}>✖</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    className={`status-btn ${cart.length > 0 ? 'blink-anim' : ''}`}
                    onClick={() => setShowCartPage(!showCartPage)}
                    style={{ background: '#fe7a38', color: 'white', transition: 'transform 0.1s ease-out', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                      <circle cx="9" cy="21" r="1"></circle>
                      <circle cx="20" cy="21" r="1"></circle>
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    Cart → {cart.length > 0 && `(${cart.length})`}
                  </button>

                  <button
                    className="status-btn"
                    onClick={() =>
                      window.location.href =
                      `/settlement-success?tableId=${tableId}&table=${tableNo}&orderId=${currentOrderId}`
                    }
                  >
                    🟢 Order Status
                  </button>

                  {enableLogin && (
                    <button
                      className="logout-btn"
                      onClick={() => {
                        localStorage.removeItem("isLoggedIn");
                        localStorage.removeItem("qr_pos_user");
                        localStorage.removeItem("promoCode");
                        localStorage.removeItem("promoAmount");
                        localStorage.removeItem("memberId");
                        window.location.reload();
                      }}
                    >
                      🚪 Logout
                    </button>
                  )}
                </div>
              </div>

              {/* Categories Navigation */}
              {!showCartPage && (
                <>
                  <div className="nav-scroll">
                    {(Array.isArray(categories) ? categories : []).map((cat) => (
                      <button
                        key={cat.CategoryId}
                        className={`pill cat-pill ${activeCategory === cat.CategoryId ? "active" : ""
                          }`}
                        onClick={() => {
                          setActiveCategory(cat.CategoryId);
                          loadGroups(cat.CategoryId);
                        }}
                      >
                        {cat.KitchenTypeName}
                      </button>
                    ))}
                  </div>

                  {/* Groups Navigation */}
                  <div className="nav-scroll groups-row">
                    {groups.map((grp) => (
                      <button
                        key={grp.DishGroupId}
                        className={`pill grp-pill ${activeGroup === grp.DishGroupId ? "active" : ""
                          }`}
                        onClick={() => {
                          setActiveGroup(grp.DishGroupId);
                          loadDishes(grp.DishGroupId);
                        }}
                      >
                        {grp.DishGroupName}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Main Content Area */}
              <div className="pos-content">
                {/* Left Side: Dish List */}
                {!showCartPage && (
                  <div className="dish-list">
                    {filteredItems.map((dish) => (
                      <div
                        className={`dish-card ${dish.IsSoldOut ? "sold-out" : ""}`}
                        key={dish.DishId}
                        onClick={() => {
                          if (!dish.IsSoldOut) {
                            openModifiers(dish);
                          }
                        }}
                        style={{
                          backgroundColor: dish.IsServiceCharge ? "#FFF3F3" : "#fff",

                          border: dish.IsServiceCharge
                            ? "2px solid #FFA8A8"
                            : "1px solid #E5E7EB",
                        }}
                      >
                        <div className="dish-img-box">
                          {dish.HasImage ? (
                            <img
                              src={`${API}/image/${dish.Image}`}
                              alt={dish.Name}
                            />
                          ) : (
                            <div className="dish-placeholder">
                              <ForkKnifeIcon />
                            </div>
                          )}
                        </div>
                        <div
                          className="dish-name"
                          style={{
                            color: dish.IsServiceCharge
                              ? "#D32F2F"
                              : "#111827",
                          }}
                        >
                          {dish.Name}

                          {dish.IsSoldOut && (
                            <div className="sold-out-badge">
                              Sold Out
                            </div>
                          )}
                        </div>
                        <div
                          className="dish-price"
                          style={{
                            color: dish.IsSoldOut
                              ? "#F97316"
                              : dish.IsServiceCharge
                                ? "#D32F2F"
                                : "#F97316",
                          }}
                        >
                          ${Number(dish.Price || 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Right Side: Cart Sidebar */}
                {showCartPage && (
                  <div className="cart-sidebar">
                    <div className="cart-header">
                      <button onClick={() => setShowCartPage(false)} style={{ background: 'none', border: '1px solid #ddd', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', color: '#fe7a38', fontWeight: 'bold' }}>
                        Go to Home Page
                      </button>
                      <span className="cart-table-no">
                        Table No:{tableNo || "1"}
                      </span>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button
                          onClick={async () => {
                            if (!tableId) return;
                            // Wait for any in-flight save to finish first,
                            // so newly-added items are persisted before we reload from DB
                            if (pendingSaveRef.current) {
                              try { await pendingSaveRef.current; } catch (_) { }
                            }
                            await loadCart(tableId);
                          }}
                          style={{ background: 'none', border: '1px solid #ddd', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                          title="Refresh Cart"
                          disabled={isCartLoading}
                        >
                          ↻ Refresh
                        </button>
                        <span className="cart-sync" style={{ color: isCartLoading ? '#f97316' : '#9ca3af' }}>
                          {isCartLoading ? "• Loading..." : "• Synced"}
                        </span>
                      </div>
                    </div>

                    {cart.length === 0 ? (
                      <div className="empty-cart-state">
                        <div className="empty-icon-wrap">
                          <BurgerDrinkIcon />
                        </div>
                        <h3>Empty Cart</h3>
                        <p>Select delicious dishes from the menu to start this order.</p>
                      </div>
                    ) : (
                      <div className="cart-items-container">
                        <div className="cart-items-list">
                          {cart.map((item, index) => (
                            <div
                              key={index}
                              className="cart-item"
                              style={{
                                background: item.IsServiceCharge ? "#FFF3F3" : "#fff",
                                border: item.IsServiceCharge
                                  ? "2px solid #FFA8A8"
                                  : "1px solid #E5E7EB",
                                borderRadius: "16px",
                                marginBottom: "12px",
                                padding: "12px",
                              }}
                            >

                              <div className="ci-info">

                                <div className="ci-name">

                                  <div className="ci-title">
                                    {item.Name || item.name}
                                  </div>

                                  {item.selectedMods?.length > 0 && (
                                    <div className="ci-mods">
                                      {item.selectedMods
                                        .map((m) => m.ModifierName)
                                        .join(", ")}
                                    </div>
                                  )}

                                  {item.comboSelections?.length > 0 && (
                                    <div className="ci-mods">
                                      {item.comboSelections.map((group, index) => (
                                        <div key={index} style={{ marginTop: "4px" }}>
                                          <div style={{ color: "#f97316", fontWeight: "600" }}>
                                            {group.groupName}:
                                          </div>

                                          {group.items?.map((option, idx) => (
                                            <div
                                              key={idx}
                                              style={{
                                                marginLeft: "12px",
                                                color: "#666",
                                                fontSize: "13px",
                                              }}
                                            >
                                              ↳ {option.name}
                                              {((option.surcharge || 0) + (option.dishPrice || 0)) > 0 && (
                                                <> (+${((option.surcharge || 0) + (option.dishPrice || 0)).toFixed(2)})</>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                </div>

                                <div className="qty-controls">

                                  <button
                                    className="qty-btn"
                                    onClick={() => decreaseQty(index)}
                                    disabled={
                                      (item.status && item.status !== "NEW") ||
                                      isCartLoading
                                    }
                                    style={{ opacity: ((item.status && item.status !== "NEW") || isCartLoading) ? 0.5 : 1 }}
                                  >
                                    -
                                  </button>

                                  <span className="qty-text">
                                    {item.qty || 1}
                                  </span>

                                  <button
                                    className="qty-btn"
                                    onClick={() => increaseQty(index)}
                                    disabled={
                                      (item.status && item.status !== "NEW") ||
                                      isCartLoading
                                    }
                                    style={{ opacity: ((item.status && item.status !== "NEW") || isCartLoading) ? 0.5 : 1 }}
                                  >
                                    +
                                  </button>

                                </div>

                              </div>

                              <div className="ci-price">
                                $
                                {(
                                  Number(item.Price || item.price || 0) *
                                  Number(item.qty || 1)
                                ).toFixed(2)}
                              </div>

                            </div>
                          ))}
                        </div>
                        {/* <div className="cart-footer">
                          <div className="cart-total-row">
                            <span>Total</span>
                            <span>${cart
                              .reduce(
                                (s, i) =>
                                  s +
                                  (
                                    Number(i.Price || i.price || 0) *
                                    Number(i.qty || 1)
                                  ),
                                0
                              )
                              .toFixed(2)}</span>
                          </div>
                          <button
                            className="checkout-btn"
                            onClick={placeOrder}
                          >
                            Place Order
                          </button>
                        </div> */}
                        <div className="cart-footer">

                          <div className="cart-total-row">
                            <span>Subtotal</span>
                            <span>${subTotal.toFixed(2)}</span>
                          </div>

                          {promoAmount > 0 && (
                            <div className="cart-total-row" style={{ color: "#16a34a" }}>
                              <span>Discount {promoCodeUsed ? `(${promoCodeUsed})` : ""}</span>
                              <span>-${promoAmount.toFixed(2)}</span>
                            </div>
                          )}
                        

                          {serviceCharge > 0 && (
                            <div className="cart-total-row">
                              <span>Service Charge ({serviceChargePercent}%)</span>
                              <span>${serviceCharge.toFixed(2)}</span>
                            </div>
                          )}

                          {gstAmount > 0 && (
                            <div className="cart-total-row">
                              <span>GST ({gstPercent}%)</span>
                              <span>${gstAmount.toFixed(2)}</span>
                            </div>
                          )}

                          <div className="cart-total-row">
                            <strong>Total</strong>
                            <strong>${totalAmount}</strong>
                          </div>

                          <button
                            className="checkout-btn"
                            onClick={placeOrder}
                            disabled={!cart.some(item => item.status === "NEW")}
                          >
                            Place Order
                          </button>

                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* COMBO CUSTOMIZER MODAL */}
              {showComboCustomizer && selectedDish && (
                <div className="modal-overlay" onClick={() => setShowComboCustomizer(false)} style={{ zIndex: 99999 }}>
                  <div className="modal-content combo-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '650px', width: '90%' }}>
                    <div className="modal-header">
                      <div className="header-title-row" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="fast-food-icon" style={{ fontSize: '20px' }}>🍔</span>
                        <h2 className="modal-title" style={{ margin: 0 }}>Customize {selectedDish.Name || selectedDish.name}</h2>
                      </div>
                      <button className="modal-close" onClick={() => setShowComboCustomizer(false)}>
                        &times;
                      </button>
                    </div>

                    <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                      {comboLoading ? (
                        <div className="loading-container" style={{ textAlign: 'center', padding: '20px' }}>
                          <div className="spinner" style={{ display: 'inline-block', width: '30px', height: '30px', border: '3px solid #ccc', borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                          <p style={{ marginTop: '10px', color: '#666' }}>Loading combo options...</p>
                        </div>
                      ) : comboError ? (
                        <div className="error-container" style={{ textAlign: 'center', padding: '20px', color: 'red' }}>
                          <p>{comboError}</p>
                          <button className="btn-retry" onClick={() => openComboCustomizer(selectedDish)} style={{ background: '#f97316', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px' }}>Retry</button>
                        </div>
                      ) : (
                        <div className="combo-groups">
                          {(comboConfig?.groups || []).map((group) => {
                            const selectedIds = comboSelections[group.comboGroupId] || [];
                            return (
                              <div key={group.comboGroupId} className="combo-group-section" style={{ marginBottom: '24px', borderBottom: '1px solid #eee', paddingBottom: '15px' }}>
                                <div className="group-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                                  <h3 style={{ margin: 0, fontSize: '16px', color: '#2c3e50' }}>{group.groupName}</h3>
                                  <span style={{ marginLeft: '8px', fontSize: '11px', background: '#f2f4f4', padding: '2px 8px', borderRadius: '12px', color: '#7f8c8d' }}>
                                    PICK {group.minSelection === group.maxSelection ? group.minSelection : `${group.minSelection}-${group.maxSelection}`}
                                  </span>
                                </div>
                                <div className="options-grid">
                                  {(group.options || []).map((option) => {
                                    const isSelected = selectedIds.includes(option.dishId);
                                    return (
                                      <div
                                        key={option.mappingId}
                                        className={`option-card ${isSelected ? 'selected' : ''}`}
                                        onClick={() => handleSelectComboOption(group.comboGroupId, option, group.isMultiSelect, group.maxSelection)}
                                        style={{
                                          border: isSelected ? '2px solid #f97316' : '1.5px solid #eaecee',
                                          background: isSelected ? '#fff5eb' : 'white',
                                          borderRadius: '12px',
                                          padding: '10px',
                                          boxSizing: 'border-box',
                                          cursor: 'pointer',
                                          textAlign: 'center',
                                          position: 'relative'
                                        }}
                                      >
                                        <div style={{ fontWeight: 'bold', fontSize: '13px', color: isSelected ? '#f97316' : '#2c3e50' }}>{option.name}</div>
                                        {(option.surcharge > 0 || option.dishPrice > 0) && (
                                          <div style={{ fontSize: '11px', color: '#f97316', background: '#ffeedb', display: 'inline-block', padding: '1px 6px', borderRadius: '8px', marginTop: '4px' }}>
                                            +${((Number(option.surcharge) || 0) + (Number(option.dishPrice) || 0)).toFixed(2)}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                          {comboDishModifiers.length > 0 && (
                            <div className="combo-modifiers" style={{ marginTop: '20px' }}>
                              <h3 style={{ fontSize: '15px', color: '#2c3e50', marginBottom: '10px' }}>Add Modifiers (Optional)</h3>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {comboDishModifiers.map((m) => {
                                  const isSelected = selectedComboModifierIds.includes(String(m.ModifierID || m.ModifierId || ""));
                                  return (
                                    <div
                                      key={m.ModifierID}
                                      onClick={() => handleToggleComboModifier(String(m.ModifierID || m.ModifierId || ""))}
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '10px 14px',
                                        border: isSelected ? '1px solid #f97316' : '1px solid #eaecee',
                                        background: isSelected ? '#fff5eb' : '#faf9f6',
                                        borderRadius: '10px',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ color: isSelected ? '#f97316' : '#7f8c8d' }}>{isSelected ? '☑' : '☐'}</span>
                                        <span style={{ fontSize: '14px', color: '#2c3e50' }}>{m.ModifierName}</span>
                                      </div>
                                      {m.Price > 0 && (
                                        <span style={{ fontWeight: 'bold', color: '#f97316' }}>+${Number(m.Price).toFixed(2)}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="modal-footer" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {comboError && (
                        <div style={{ color: 'red', fontSize: '13px', textAlign: 'center', marginBottom: '5px' }}>{comboError}</div>
                      )}
                      <button className="btn-add" onClick={handleAddComboToCart} style={{ width: '100%', background: '#f97316', color: 'white', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>
                        Add Combo to Cart - ${calculateComboTotal().toFixed(2)}
                      </button>
                      <button className="btn-cancel" onClick={handleAddBaseComboDirectly} style={{ width: '100%', background: '#eceff1', color: '#37474f', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>
                        Add Base Combo Directly (Skip Selections)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* MODIFIER MODAL */}
              {showModifier && selectedDish && (
                <div className="modal-overlay" onClick={() => setShowModifier(false)}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <div className="modal-header">
                      <h2 className="modal-title">Modifiers for {selectedDish.Name || selectedDish.name}</h2>
                      <button className="modal-close" onClick={() => setShowModifier(false)}>
                        &times;
                      </button>
                    </div>

                    <div className="modal-body">
                      <div className="modifier-list">
                        {modifiers.map((m) => (
                          <div
                            key={m.ModifierID}
                            className="modifier-row"
                            onClick={() => toggleModifier(m)}
                          >
                            <span className="modifier-name">
                              {m.ModifierName} {m.Price > 0 && `(+$${m.Price.toFixed(2)})`}
                            </span>
                            <div
                              className={`checkbox ${selectedModifierIds.includes(m.ModifierID) ? "active" : ""
                                }`}
                            >
                              {selectedModifierIds.includes(m.ModifierID) && (
                                <span className="checkmark">&#10003;</span>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Display added custom mods */}
                        {customMods.map((m) => (
                          <div
                            key={m.ModifierID}
                            className="modifier-row"
                            onClick={() => toggleModifier(m)}
                          >
                            <span className="modifier-name" style={{ color: '#f97316' }}>
                              {m.ModifierName} {m.Price > 0 && `(+$${m.Price.toFixed(2)})`} (Custom)
                            </span>
                            <div
                              className={`checkbox ${selectedModifierIds.includes(m.ModifierID) ? "active" : ""
                                }`}
                            >
                              {selectedModifierIds.includes(m.ModifierID) && (
                                <span className="checkmark">&#10003;</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="modal-footer">
                      <button className="btn-cancel" onClick={() => setShowModifier(false)}>
                        Cancel
                      </button>
                      <button className="btn-add" onClick={addWithModifiers}>
                        Done
                      </button>
                    </div>
                  </div>

                  {/* CUSTOM ITEM SUB-MODAL */}
                  {showCustomModal && (
                    <div className="modal-overlay sub-modal-overlay">
                      <div className="custom-item-modal" onClick={(e) => e.stopPropagation()}>
                        <h3 className="custom-modal-title">Add Custom Item</h3>

                        <div className="input-group">
                          <label className="input-label">Item Name *</label>
                          <input
                            type="text"
                            className="custom-input"
                            placeholder="Enter item name"
                            value={customItemName}
                            onChange={(e) => setCustomItemName(e.target.value)}
                            autoFocus
                          />
                        </div>

                        <div className="input-group">
                          <label className="input-label">Price (Optional)</label>
                          <input
                            type="number"
                            className="custom-input"
                            placeholder="Enter price"
                            value={customItemPrice}
                            onChange={(e) => setCustomItemPrice(e.target.value)}
                          />
                        </div>

                        <div className="custom-modal-actions">
                          <button
                            className="btn-cancel"
                            onClick={() => setShowCustomModal(false)}
                          >
                            Cancel
                          </button>
                          <button className="btn-add" onClick={addCustomMod}>
                            Add Item
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              )}
              {showPaymentPopup && (
                <div className="modal-overlay">

                  <div className="payment-popup">

                    <button
                      className="payment-close"
                      onClick={() => setShowPaymentPopup(false)}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>

                    <div className="payment-dot"></div>

                    <div className="payment-icon-outer">
                      <div className="payment-icon-inner">?</div>
                    </div>

                    <h2 className="payment-title">
                      How would you like to pay ?
                    </h2>

                    <p className="payment-subtitle">
                      These are the available payment methods
                    </p>

                    <div className="payment-card">

                      {/* <div className="card-top-section card-1-top">*/}
                      {/* <div className="qlub-branding">
                  <span className="pb-text">Powered By</span>
                  <span className="qlub-logo">qlub <span className="qlub-dots">::</span></span>
                </div> */}
                      {/*  <div className="brand-grid">
                          <VoucherBrand />
                          <MastercardBrand />
                          <NetsBrand />
                          <PayNowBrand />
                          <VisaBrand />
                           <GPayBrand />
                  <MastercardBrand />
                  <UnionPayBrand />
                  <ApplePayBrand />
                  <VisaBrand />
                  <AmexBrand /> 
                        </div>
                      </div>*/}

                      { /*<button
                        className="payment-btn"
                        onClick={() => {
                          setShowPaymentPopup(false);
                          alert("Currently Not Available");
                        }}
                      >
                        Pay Online
                      </button>*/}

                      {/*  <button
                        className="payment-btn"
                        onClick={() => {
                          setShowPaymentPopup(false);
                         
                          handlePayOnline();
                        }}
                      >
                        Pay Online
                      </button>*/}

                    </div>

                    {/* <div className="payment-or">
                      OR
                    </div> */}

                    <div className="payment-card">

                      <div className="card-top-section card-2-top">
                        <div className="brand-grid-two">
                          <VoucherBrand />
                          <MastercardBrand />

                          <PayNowBrand />
                          <VisaBrand />
                        </div>
                      </div>

                      <button
                        className="payment-btn"
                        onClick={async () => {
                          try {
                            await fetch(`${API}/order/mark-sent`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ orderId: currentOrderId/*, statusCode: 1 */ })
                            });

                            await fetch(`${API}/order/payment-status`, {
                              method: "POST",
                              headers: {
                                "Content-Type": "application/json"
                              },
                              body: JSON.stringify({
                                tableId: tableId,
                                paymentStatus: 0
                              })
                            });
                            // KOT Printing is now handled by the backend

                          } catch (e) {
                            console.error(e);
                          }
                          setShowPaymentPopup(false);

                          window.location.href =
                            `/settlement-success?tableId=${tableId}&table=${tableNo}&orderId=${currentOrderIdRef.current || currentOrderId}`;

                        }}
                      >
                        Pay at Counter
                      </button>

                    </div>

                  </div>

                </div>
              )}

              {successMessage && (
                <div className="modal-overlay" style={{ zIndex: 10000 }}>
                  <div className="success-modal">
                    <div className="success-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    </div>
                    <h2 className="success-title">Success!</h2>
                    <p className="success-text">{successMessage}</p>
                  </div>
                </div>
              )}

              {showOnlinePayment && (
                <div className="modal-overlay" style={{ zIndex: 10001, padding: 0 }}>
                  <div className="pos-app" style={{ width: '100vw', height: '100dvh', background: '#fdfbf7', display: 'flex', flexDirection: 'column', borderRadius: 0 }}>

                    <div className="pos-header" style={{ borderBottom: '1px solid #eee', background: 'white' }}>
                      <button className="icon-btn" onClick={() => setShowOnlinePayment(false)}>
                        <BackIcon />
                      </button>
                      <div style={{ flex: 1, textAlign: 'center', fontSize: '18px', fontWeight: 'bold' }}>
                        Checkout
                      </div>
                      <div style={{ width: '48px' }}></div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', gap: '20px', padding: '20px', overflowY: 'auto', flexWrap: 'wrap', alignContent: 'flex-start' }}>
                      {/* Left Side: Payment Method */}
                      <div style={{ flex: '1 1 300px', background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <h3 style={{ margin: '0', textTransform: 'uppercase', fontSize: '12px', color: '#666', letterSpacing: '0.5px' }}>Select Payment Method</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
                          <div
                            style={{ padding: '20px 10px', border: '1px solid #eee', borderRadius: '12px', textAlign: 'center', color: '#666', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                            onClick={() => setShowPayNowModal(true)}
                          >
                            <PayNowBrand /> <span style={{ fontSize: '12px' }}>PayNow</span>
                          </div>
                        </div>

                        {/* Promo Code Section */}
                        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px', border: '1px solid #e2e8f0', marginTop: '10px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>Promo Code</div>
                          {appliedOnlinePromo ? (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff2ec', padding: '10px', borderRadius: '8px', border: '1px solid #ffd2bd' }}>
                              <div>
                                <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b' }}>Applied: {appliedOnlinePromo.code}</div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>Discount: -${appliedOnlinePromo.amount.toFixed(2)}</div>
                              </div>
                              <button 
                                style={{ background: '#ffe4e6', color: '#e11d48', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                                onClick={() => { setAppliedOnlinePromo(null); localStorage.removeItem("promoCode"); localStorage.removeItem("promoAmount"); }}
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <div>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                  type="text"
                                  placeholder="Enter Promo Code (e.g. PROMO10)"
                                  value={onlinePromoCode}
                                  onChange={(e) => setOnlinePromoCode(e.target.value.toUpperCase())}
                                  style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 12px', fontSize: '13px' }}
                                />
                                <button
                                  disabled={!onlinePromoCode.trim() || validatingOnlinePromo}
                                  onClick={handleApplyOnlinePromo}
                                  style={{ background: onlinePromoCode.trim() ? '#f97316' : '#cbd5e1', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                  {validatingOnlinePromo ? '...' : 'Apply'}
                                </button>
                              </div>
                              {onlinePromoError && (
                                <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px' }}>{onlinePromoError}</div>
                              )}
                            </div>
                          )}
                        </div>

                        <div style={{ flex: 1 }}></div>

                        {/* <button
                  className="checkout-btn"
                  style={{ height: '56px', fontSize: '18px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '20px' }}
                  // onClick={() => {
                  //   setShowOnlinePayment(false);
                  //   handlePaymentSuccess("Online Payment Successful!");
                  // }}
                  onClick={async () => {

                    try {
                      console.log("CURRENT ORDER ID:", currentOrderId);
                      const res = await fetch(`${API}/sales/save`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({

                          orderId:
                            currentOrderId &&
                              currentOrderId !== "null"
                              ? currentOrderId
                              : "00000000-0000-0000-0000-000000000000",

                          tableNo: tableNo,

                          tableId: tableId,

                          subTotal: Number(totalAmount),


                          totalAmount: Number(totalAmount),

                          paymentMethod: "PAYNOW",

                          items: cart.map((item) => ({

                            id: item.DishId || item.id,

                            name: item.Name || item.name,

                            qty: Number(item.qty || 1),

                            price: Number(item.Price || item.price || 0),

                          })),

                        }),
                      });

                      const data = await res.json();

                      console.log("PAYMENT PROCESS:", data);

                      if (data.success) {

                    setShowOnlinePayment(false);

                    handlePaymentSuccess(
                      `Payment Successful! TXN: ${data.transactionId}`
                    );

                    // KOT PRINT is now handled by backend


                    // ✅ Open SettlementSuccess Screen
                    setTimeout(() => {

                      window.location.href =
                        `/settlement-success?tableId=${tableId}&table=${tableNo}&orderId=${currentOrderId}`;

                    }, 1000);

                  } else {

                    alert(data.error || "Payment Failed");

                  }

                    } catch (err) {

                      console.log("PAYMENT ERROR:", err);

                      alert("Server Error");

                    }

                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  Complete Settlement
                </button>*/}
                        <button
                          className="checkout-btn"
                          style={{ height: '56px', fontSize: '18px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '20px' }}
                          onClick={handlePayOnline}
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                          Complete Settlement
                        </button>
                      </div>

                      {/* Right Side: Summary */}
                      <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div style={{ background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.04)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
                            <span style={{ color: '#666', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>Amount Due</span>
                            <span style={{ fontSize: '28px', fontWeight: '900', color: '#f97316' }}>${totalAmount}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                            <span style={{ color: '#666', fontWeight: '600' }}>Subtotal</span>
                            <span style={{ fontWeight: 'bold', color: '#1f2937' }}>${totalAmount}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                            <span style={{ color: '#666', fontWeight: '600' }}>GST</span>
                            <span style={{ fontWeight: 'bold', color: '#1f2937' }}>$0.00</span>
                          </div>
                        </div>

                        <div style={{ flex: 1, background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.04)', overflowY: 'auto' }}>
                          <h3 style={{ margin: '0 0 15px 0', textTransform: 'uppercase', fontSize: '11px', color: '#666', letterSpacing: '0.5px' }}>Order Items</h3>
                          {cart.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                              <div style={{ width: '30px', color: '#f97316', fontWeight: '900', fontSize: '13px' }}>{item.qty}x</div>
                              <div style={{ flex: 1, fontWeight: '600', color: '#1f2937', fontSize: '13px' }}>
                                {item.Name || item.name}
                                {item.selectedMods?.length > 0 && (
                                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                    {item.selectedMods.map((m) => m.ModifierName).join(", ")}
                                  </div>
                                )}
                              </div>
                              <div style={{ fontWeight: 'bold', color: '#1f2937', fontSize: '13px' }}>
                                ${(Number(item.Price || item.price || 0) * Number(item.qty || 1)).toFixed(2)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {showPayNowModal && (
                <div className="modal-overlay" style={{ zIndex: 10002 }}>
                  <div style={{ width: '100%', maxWidth: '320px', backgroundColor: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '16px' }}>
                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: '800', color: '#1f2937' }}>PayNow QR Payment</div>
                          {/* <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>AL-HAZIMA RESTAURANT PTE LTD</div> */}
                        </div>
                        <button
                          style={{ border: 'none', background: '#F1F5F9', borderRadius: '10px', padding: '6px', cursor: 'pointer', display: 'flex' }}
                          onClick={() => setShowPayNowModal(false)}
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                      </div>

                      {/* Amount Box */}
                      <div style={{ backgroundColor: '#F0F9FF', padding: '10px', borderRadius: '12px', alignItems: 'center', marginBottom: '16px', border: '1px solid #BAE6FD', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: '11px', color: '#0369A1', fontWeight: '600', marginBottom: '2px' }}>Please Transfer Exactly</div>
                        <div style={{ fontSize: '22px', fontWeight: '900', color: '#0284C7' }}>${totalAmount}</div>
                      </div>

                      {/* Dynamic QR */}
                      <div style={{ alignItems: 'center', marginBottom: '16px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ width: '150px', height: '150px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', border: '1px solid #f0f0f0', display: 'flex' }}>
                          <img
                            src={
                              paynowUpiId?.startsWith("data:")
                                ? paynowUpiId
                                : paynowUpiId?.startsWith("/9j/")
                                  ? `data:image/jpeg;base64,${paynowUpiId}`
                                  : `data:image/png;base64,${paynowUpiId}`
                            }
                            alt="PayNow QR"
                            style={{
                              width: "130px",
                              height: "130px",
                              objectFit: "contain"
                            }}
                          />
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px', fontWeight: '500', textAlign: 'center' }}>
                          Scan this QR and pay {totalAmount} exactly
                        </div>
                        <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                          Scan using PayNow / UPI App
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <button
                        style={{ width: '100%', display: 'flex', backgroundColor: '#22c55e', padding: '12px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px', border: 'none', cursor: 'pointer' }}
                        onClick={() => {
                          setShowPayNowModal(false);
                          setShowOnlinePayment(false);
                          completeOrder(currentOrderId, totalAmount);
                        }}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        <span style={{ color: '#fff', fontSize: '15px', fontWeight: '800' }}>Payment Received</span>
                      </button>

                      <button
                        style={{ width: '100%', padding: '6px', alignItems: 'center', display: 'flex', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer' }}
                        onClick={() => setShowPayNowModal(false)}
                      >
                        <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600' }}>Cancel Transaction</span>
                      </button>

                    </div>
                  </div>
                </div>
              )}

              {showUpiModal && (
                <div className="modal-overlay" style={{ zIndex: 10002 }}>
                  <div style={{ width: '100%', maxWidth: '320px', backgroundColor: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '16px' }}>
                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: '800', color: '#1f2937' }}>UPI QR Payment</div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>AL-HAZIMA RESTAURANT PTE LTD</div>
                        </div>
                        <button
                          style={{ border: 'none', background: '#F1F5F9', borderRadius: '10px', padding: '6px', cursor: 'pointer', display: 'flex' }}
                          onClick={() => setShowUpiModal(false)}
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                      </div>

                      {/* Amount Box */}
                      <div style={{ backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '12px', alignItems: 'center', marginBottom: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '2px' }}>Total Amount to Collect</div>
                        <div style={{ fontSize: '22px', fontWeight: '900', color: '#f97316' }}>${totalAmount}</div>
                      </div>

                      {/* QR Code Container */}
                      {/* <div style={{ alignItems: 'center', marginBottom: '10px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ width: '160px', height: '160px', padding: '10px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <QRCodeSVG value={`upi://pay?pa=${upiUpiId || 'merchant@upi'}&pn=Merchant&am=${totalAmount}&cu=INR`} size={140} />
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px', fontWeight: '500', textAlign: 'center' }}>
                  Ask customer to scan with any UPI App
                </div>
                {upiUpiId && <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>UPI: {upiUpiId}</div>}
              </div> */}

                      {/* Action Buttons */}
                      <button
                        style={{ width: '100%', display: 'flex', backgroundColor: '#22c55e', padding: '12px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px', border: 'none', cursor: 'pointer' }}
                        onClick={() => {
                          setShowUpiModal(false);
                          setShowOnlinePayment(false);
                          completeOrder(currentOrderId, totalAmount);
                        }}
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        <span style={{ color: '#fff', fontSize: '15px', fontWeight: '800' }}>Payment Received</span>
                      </button>

                      <button
                        style={{ width: '100%', padding: '6px', alignItems: 'center', display: 'flex', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer' }}
                        onClick={() => setShowUpiModal(false)}
                      >
                        <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600' }}>Cancel Transaction</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showSettingsModal && (
                <div className="modal-overlay" style={{ zIndex: 10003 }}>
                  <div className="modal-content" style={{ maxWidth: '420px', display: 'flex', flexDirection: 'column' }}>
                    <div className="modal-header">
                      <h2 className="modal-title">Payment Settings</h2>
                      <button className="modal-close" onClick={() => setShowSettingsModal(false)}>&times;</button>
                    </div>
                    <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                      <div style={{ border: '1px solid #eee', borderRadius: '12px', padding: '16px' }}>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#333' }}>PayNow UPI ID</h3>
                        <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#6b7280' }}>Enter your PayNow / UPI ID. The QR will be generated dynamically with the correct amount.</p>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {

                            const file = e.target.files[0];

                            const reader = new FileReader();

                            reader.onloadend = () => {

                              const base64 = reader.result.split(",")[1];

                              setTempPaynowUpiId(base64);
                            };

                            if (file) {
                              reader.readAsDataURL(file);
                            }

                          }}
                        />
                        {/* {tempPaynowUpiId && (
                  <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
                    <QRCodeSVG
  value={
    tempPaynowUpiId &&
    tempPaynowUpiId.length < 100
      ? `upi://pay?pa=${tempPaynowUpiId}&pn=Merchant&am=1&cu=INR`
      : "upi://pay?pa=test@upi&pn=Merchant&am=1&cu=INR"
  }
  size={100}
/>
                  </div>
                )} */}
                      </div>

                      {/* <div style={{ border: '1px solid #eee', borderRadius: '12px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#333' }}>GPay / UPI ID</h3>
                <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#6b7280' }}>Enter your GPay / UPI ID. The QR will include the exact order amount when shown at checkout.</p>
                <input
                  type="text"
                  placeholder="e.g. 9876543210@superyes"
                  value={tempUpiUpiId}
                  onChange={(e) => setTempUpiUpiId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
                />
                {tempUpiUpiId && (
                  <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
                    <QRCodeSVG value={`upi://pay?pa=${tempUpiUpiId}&pn=Merchant&am=1&cu=INR`} size={100} />
                  </div>
                )}
              </div> */}

                    </div>
                    <div className="modal-footer" style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn-cancel" onClick={() => setShowSettingsModal(false)}>Cancel</button>
                      <button className="btn-add" style={{ flex: 1 }} onClick={() => {
                        saveUpiId('paynow', tempPaynowUpiId);
                        saveUpiId('upi', tempUpiUpiId);
                        setShowSettingsModal(false);
                      }}>Save Settings</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </PullToRefresh>
        }
      />

      <Route
        path="/settlement-success"
        element={<SettlementSuccess />}
      />

    </Routes>
  );
}

export default App;