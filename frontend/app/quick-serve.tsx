import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Platform,
  StatusBar,
  useWindowDimensions,
  Pressable,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from "@expo/vector-icons";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Fonts } from "@/constants/Fonts";
import { API_URL } from "@/constants/Config";
import { useAuthStore } from "@/stores/authStore";
import { useCartStore, CartItem } from "@/stores/cartStore";
import { useOrderContextStore } from "@/stores/orderContextStore";
import { useCompanySettingsStore } from "@/stores/companySettingsStore";
import { useGeneralSettingsStore } from "@/stores/generalSettingsStore";
import { useToast } from "@/components/Toast";
import StoreSettingsModal from "@/components/payment/StoreSettingsModal";
import ComboCustomizer from "@/components/ComboCustomizer";

const getImageUrl = (imagePath: string | null | undefined) => {
  if (!imagePath) return null;
  const pathStr = String(imagePath).trim();
  if (!pathStr) return null;
  if (pathStr.startsWith("http://") || pathStr.startsWith("https://") || pathStr.startsWith("data:")) {
    return pathStr;
  }
  return `${API_URL}/api/menu/image/${pathStr}`;
};

// Helper for category icons
const getCategoryIcon = (name: string): string => {
  const n = (name || "").toLowerCase();
  if (n.includes("italian") || n.includes("pizza")) return "pizza-outline";
  if (n.includes("beverage") || n.includes("drink")) return "cafe-outline";
  if (n.includes("kebab")) return "restaurant-outline";
  if (n.includes("indian")) return "flame-outline";
  if (n.includes("chinese")) return "fast-food-outline";
  if (n.includes("south")) return "nutrition-outline";
  if (n.includes("north")) return "restaurant-outline";
  return "grid-outline";
};

// Helper for subcategory icons
const getGroupIcon = (name: string): string => {
  const n = (name || "").toLowerCase();
  if (n.includes("biryani")) return "restaurant-outline";
  if (n.includes("breakfast")) return "sunny-outline";
  if (n.includes("meals")) return "nutrition-outline";
  if (n.includes("poori")) return "ellipse-outline";
  if (n.includes("chicken")) return "nutrition-outline";
  if (n.includes("dosa")) return "triangle-outline";
  if (n.includes("parotta")) return "layers-outline";
  if (n.includes("egg")) return "egg-outline";
  return "fast-food-outline";
};

export default function QuickServePOSScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const toast = useToast();
  const { user } = useAuthStore();
  const companySettings = useCompanySettingsStore((state: any) => state.settings);

  // Quick Serve UI Mode Toggle (ON / OFF)
  const [quickServeModeEnabled, setQuickServeModeEnabled] = useState<boolean>(true);
  const [tablesList, setTablesList] = useState<any[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>("Section 1");
  const [loadingTables, setLoadingTables] = useState<boolean>(false);

  // Quick Serve Order Context
  const [quickServeToken, setQuickServeToken] = useState<string>("");

  useEffect(() => {
    const token = `QS-${Math.floor(1000 + Math.random() * 9000)}`;
    setQuickServeToken(token);
    useOrderContextStore.getState().setOrderContext({
      orderType: "TAKEAWAY",
      takeawayNo: token,
    });

    // Load persisted Quick Serve mode setting
    AsyncStorage.getItem("QUICK_SERVE_MODE_ENABLED").then((val) => {
      if (val !== null) {
        const isEnabled = val === "true";
        setQuickServeModeEnabled(isEnabled);
        if (!isEnabled) {
          fetchNormalPOSTables();
        }
      }
    });
  }, []);

  const toggleQuickServeMode = (enabled?: boolean) => {
    const nextVal = enabled !== undefined ? enabled : !quickServeModeEnabled;
    setQuickServeModeEnabled(nextVal);
    AsyncStorage.setItem("QUICK_SERVE_MODE_ENABLED", String(nextVal));
    toast.showToast({
      message: nextVal ? "⚡ Quick Serve UI Enabled (ON)" : "🏬 Normal POS Mode (OFF)",
      type: "info",
    });
    if (!nextVal) {
      fetchNormalPOSTables();
    }
  };

  const fetchNormalPOSTables = async () => {
    setLoadingTables(true);
    try {
      const res = await fetch(`${API_URL}/api/tables/all`).then((r) => r.json()).catch(() => []);
      if (Array.isArray(res)) {
        setTablesList(res);
      }
    } catch (err) {
      console.error("Error fetching tables:", err);
    } finally {
      setLoadingTables(false);
    }
  };

  // Cart Store State & Helpers
  const cartItems = useCartStore((state) => state.getCart());
  const addToCartGlobal = useCartStore((state) => state.addToCartGlobal);
  const updateCartItemQty = useCartStore((state) => state.updateCartItemQty);
  const removeFromCartGlobal = useCartStore((state) => state.removeFromCartGlobal);
  const clearCart = useCartStore((state) => state.clearCart);

  // Categories, Dish Groups, Dishes Data
  const [categories, setCategories] = useState<any[]>([]);
  const [dishGroups, setDishGroups] = useState<any[]>([]);
  const [dishes, setDishes] = useState<any[]>([]);

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  // Additional UI states matching reference design
  const [sortBy, setSortBy] = useState<string>("NAME_ASC");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Modals & Popups State for POS Flow
  const [modifiers, setModifiers] = useState<any[]>([]);
  const [showModifier, setShowModifier] = useState<boolean>(false);
  const [selectedDish, setSelectedDish] = useState<any | null>(null);
  const [selectedModifierQuantities, setSelectedModifierQuantities] = useState<Record<string, number>>({});
  const [loadingModifiers, setLoadingModifiers] = useState<boolean>(false);

  const [showOpenItemModal, setShowOpenItemModal] = useState<boolean>(false);
  const [openItemDish, setOpenItemDish] = useState<any | null>(null);
  const [openItemPrice, setOpenItemPrice] = useState<string>("");
  const [openItemError, setOpenItemError] = useState<string>("");

  const [showComboModal, setShowComboModal] = useState<boolean>(false);
  const [comboDish, setComboDish] = useState<any | null>(null);

  // Payment State
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("CASH");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountModalVisible, setDiscountModalVisible] = useState<boolean>(false);
  const [tempDiscount, setTempDiscount] = useState<string>("");
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [storeSettingsVisible, setStoreSettingsVisible] = useState<boolean>(false);

  // Load Menu Data (Categories, Dish Groups, Dishes)
  useEffect(() => {
    fetchMenuData();
  }, []);

  const fetchMenuData = async () => {
    setLoading(true);
    try {
      const [catRes, dishRes] = await Promise.all([
        fetch(`${API_URL}/api/menu/kitchens`).then((r) => r.json()).catch(() => []),
        fetch(`${API_URL}/api/menu/dishes/all`).then((r) => r.json()).catch(() => []),
      ]);

      const validCats = Array.isArray(catRes) ? catRes : [];
      setCategories(validCats);
      setDishes(Array.isArray(dishRes) ? dishRes : []);

      if (validCats.length > 0) {
        const firstCatId = validCats[0].CategoryId;
        setSelectedCategoryId(firstCatId);
        const groupRes = await fetch(`${API_URL}/api/menu/dishgroups/${firstCatId}`).then((r) => r.json()).catch(() => []);
        const validGroups = Array.isArray(groupRes) ? groupRes : [];
        setDishGroups(validGroups);
        if (validGroups.length > 0) {
          setSelectedGroupId(validGroups[0].DishGroupId);
        } else {
          setSelectedGroupId(null);
        }
      }
    } catch (err) {
      console.error("Error fetching menu data:", err);
      toast.showToast({ message: "Failed to load menu", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Handler when a Category is clicked
  const handleSelectCategory = async (catId: number | null) => {
    setSelectedCategoryId(catId);
    if (catId === null) {
      setDishGroups([]);
      setSelectedGroupId(null);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/menu/dishgroups/${catId}`).then((r) => r.json()).catch(() => []);
      const validGroups = Array.isArray(res) ? res : [];
      setDishGroups(validGroups);
      if (validGroups.length > 0) {
        setSelectedGroupId(validGroups[0].DishGroupId);
      } else {
        setSelectedGroupId(null);
      }
    } catch (err) {
      console.error("Error fetching category dishgroups:", err);
      setDishGroups([]);
      setSelectedGroupId(null);
    }
  };

  // Filter Dishes based on Category, Dish Group, and Search Query
  const filteredDishes = useMemo(() => {
    return dishes.filter((dish) => {
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const matchesName = dish.Name?.toLowerCase().includes(query);
        const matchesCode = dish.DishCode?.toLowerCase().includes(query);
        return matchesName || matchesCode;
      }

      if (selectedGroupId !== null && selectedGroupId !== undefined) {
        if (String(dish.DishGroupId) !== String(selectedGroupId)) return false;
      } else if (selectedCategoryId !== null && selectedCategoryId !== undefined) {
        const validGroupIds = dishGroups.map((g) => String(g.DishGroupId));
        if (validGroupIds.length > 0 && !validGroupIds.includes(String(dish.DishGroupId))) return false;
      }

      return true;
    });
  }, [dishes, selectedCategoryId, selectedGroupId, searchQuery, dishGroups]);

  // Sorted Dishes
  const sortedDishes = useMemo(() => {
    const list = [...filteredDishes];
    if (sortBy === "NAME_ASC") {
      list.sort((a, b) => (a.Name || "").localeCompare(b.Name || ""));
    } else if (sortBy === "PRICE_LOW") {
      list.sort((a, b) => Number(a.Price || 0) - Number(b.Price || 0));
    } else if (sortBy === "PRICE_HIGH") {
      list.sort((a, b) => Number(b.Price || 0) - Number(a.Price || 0));
    }
    return list;
  }, [filteredDishes, sortBy]);

  // Cart Calculations (Subtotal, Discount, Taxes, Total)
  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      const price = Number(item.price || 0);
      const qty = Number(item.qty || 1);
      return sum + price * qty;
    }, 0);
  }, [cartItems]);

  const cartQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    cartItems.forEach((item) => {
      if (item.id) {
        map[String(item.id)] = (map[String(item.id)] || 0) + (item.qty || 1);
      }
    });
    return map;
  }, [cartItems]);

  const discountAmount = useMemo(() => {
    if (!discountPercent) return 0;
    return (subtotal * discountPercent) / 100;
  }, [subtotal, discountPercent]);

  const serviceChargeRate = 0.05;
  const gstRate = 0.05;

  const serviceChargeAmount = useMemo(() => {
    const net = subtotal - discountAmount;
    return net > 0 ? net * serviceChargeRate : 0;
  }, [subtotal, discountAmount]);

  const gstAmount = useMemo(() => {
    const net = subtotal - discountAmount + serviceChargeAmount;
    return net > 0 ? net * gstRate : 0;
  }, [subtotal, discountAmount, serviceChargeAmount]);

  const finalTotal = useMemo(() => {
    const tot = subtotal - discountAmount + serviceChargeAmount + gstAmount;
    return Math.max(0, tot);
  }, [subtotal, discountAmount, serviceChargeAmount, gstAmount]);

  // Group Modifiers dynamically
  const groupedModifiers = useMemo(() => {
    if (!modifiers || modifiers.length === 0) return [];
    const groupsMap: Record<string, any> = {};

    modifiers.forEach((m: any) => {
      const gId = m.ModifierGroupId || "general";
      const gName = m.ModifierGroupName || "General Modifiers";
      const minSel = Number(m.MinSelect ?? m.MinSelection ?? 0);
      const maxSel = Number(m.MaxSelect ?? m.MaxSelection ?? 0);
      const multiselect = Boolean(m.IsMultiSelect ?? m.MultiSelect ?? true);

      if (!groupsMap[gId]) {
        groupsMap[gId] = {
          groupId: String(gId),
          groupName: gName,
          minSelect: minSel,
          maxSelect: maxSel,
          multiselect: multiselect,
          items: [],
        };
      }

      if (!groupsMap[gId].items.some((x: any) => String(x.ModifierID) === String(m.ModifierID))) {
        groupsMap[gId].items.push(m);
      }
    });

    return Object.values(groupsMap);
  }, [modifiers]);

  const adjustModifierQuantity = (mod: any, gId: string, delta: number) => {
    const key = `${mod.ModifierID}_${gId}`;
    const group = groupedModifiers.find((g: any) => g.groupId === gId);
    if (!group) return;

    const groupSelectedCount = Object.entries(selectedModifierQuantities)
      .filter(([k]) => k.endsWith(`_${gId}`))
      .reduce((sum, [, q]) => sum + q, 0);

    setSelectedModifierQuantities((prev) => {
      const currentQty = prev[key] || 0;
      const newQty = Math.max(0, currentQty + delta);
      if (delta > 0 && group.maxSelect > 0 && groupSelectedCount >= group.maxSelect) {
        return prev;
      }
      return { ...prev, [key]: newQty };
    });
  };

  const toggleModifier = (mod: any) => {
    const gId = mod.ModifierGroupId || "general";
    const key = `${mod.ModifierID}_${gId}`;
    const isSelected = !!selectedModifierQuantities[key];
    if (isSelected) {
      adjustModifierQuantity(mod, gId, -1);
    } else {
      const group = groupedModifiers.find((g: any) => g.groupId === String(gId));
      if (group && !group.multiselect) {
        setSelectedModifierQuantities((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((k) => {
            if (k.endsWith(`_${gId}`)) delete next[k];
          });
          next[key] = 1;
          return next;
        });
      } else {
        adjustModifierQuantity(mod, gId, 1);
      }
    }
  };

  const addSimpleToCart = (dish: any, overridePrice?: number) => {
    const itemPrice = overridePrice !== undefined ? overridePrice : Number(dish.Price || dish.currentcost || 0);
    const currentKitchen = categories.find((k) => k.CategoryId === selectedCategoryId);
    const kitchenName = dish.KitchenTypeName || currentKitchen?.KitchenTypeName || "KITCHEN";
    const kitchenCode = dish.KitchenTypeCode || currentKitchen?.KitchenTypeCode || "2";

    const cartItem: Omit<CartItem, "qty" | "lineItemId"> & { Image?: string } = {
      id: String(dish.DishId),
      name: dish.Name,
      price: itemPrice,
      basePrice: itemPrice,
      isServiceCharge: Boolean(dish.isServiceCharge ?? true),
      isCombo: Boolean(dish.IsCombo),
      takeawayCharge: Number(dish.TakeawayCharge || 0),
      KitchenTypeCode: kitchenCode,
      KitchenTypeName: kitchenName,
      PrinterIP: dish.PrinterIP || "",
      Image: dish.Image || dish.ImagePath || dish.image,
    };

    addToCartGlobal(cartItem as any);
    toast.showToast({ message: `Added ${dish.Name}`, type: "success" });
  };

  const addWithModifiers = () => {
    if (!selectedDish) return;

    for (const group of groupedModifiers) {
      if (group.minSelect > 0) {
        const groupSelectedCount = Object.entries(selectedModifierQuantities)
          .filter(([k]) => k.endsWith(`_${group.groupId}`))
          .reduce((sum, [, q]) => sum + q, 0);

        if (groupSelectedCount < group.minSelect) {
          toast.showToast({
            message: `Please select at least ${group.minSelect} option(s) for ${group.groupName}`,
            type: "warning",
          });
          return;
        }
      }
    }

    const chosenModifiers: any[] = [];
    Object.entries(selectedModifierQuantities).forEach(([key, qty]) => {
      if (qty <= 0) return;
      const [modId] = key.split("_");
      const m = modifiers.find((x) => String(x.ModifierID) === String(modId));
      if (m) {
        chosenModifiers.push({
          ModifierId: String(m.ModifierID || m.ModifierId || ""),
          ModifierName: m.ModifierName,
          Price: Number(m.Price || 0),
          qty: qty,
        });
      }
    });

    const modifierPriceTotal = chosenModifiers.reduce(
      (sum, m) => sum + Number(m.Price || 0) * (m.qty || 1),
      0
    );

    const basePrice = Number(selectedDish.Price || selectedDish.currentcost || 0);
    const finalPrice = basePrice + modifierPriceTotal;

    const currentKitchen = categories.find((k) => k.CategoryId === selectedCategoryId);
    const kitchenName = selectedDish.KitchenTypeName || currentKitchen?.KitchenTypeName || "KITCHEN";
    const kitchenCode = selectedDish.KitchenTypeCode || currentKitchen?.KitchenTypeCode || "2";

    const cartItem: Omit<CartItem, "qty" | "lineItemId"> & { Image?: string } = {
      id: String(selectedDish.DishId),
      name: selectedDish.Name,
      price: finalPrice,
      basePrice: basePrice,
      modifiers: chosenModifiers,
      isServiceCharge: Boolean(selectedDish.isServiceCharge ?? true),
      isCombo: false,
      takeawayCharge: Number(selectedDish.TakeawayCharge || 0),
      KitchenTypeCode: kitchenCode,
      KitchenTypeName: kitchenName,
      PrinterIP: selectedDish.PrinterIP || "",
      Image: selectedDish.Image || selectedDish.ImagePath || selectedDish.image,
    };

    addToCartGlobal(cartItem as any);
    setShowModifier(false);
    setSelectedDish(null);
    toast.showToast({ message: `Added ${selectedDish.Name}`, type: "success" });
  };

  const confirmOpenItemPrice = () => {
    if (!openItemDish) return;
    const numPrice = parseFloat(openItemPrice);
    if (isNaN(numPrice) || numPrice < 0) {
      setOpenItemError("Please enter a valid price");
      return;
    }

    addSimpleToCart(openItemDish, numPrice);
    setShowOpenItemModal(false);
    setOpenItemDish(null);
    setOpenItemPrice("");
  };

  // Main POS Dish Click Handler
  const handleDishClick = async (dish: any) => {
    if (dish.IsSoldOut) {
      toast.showToast({ message: "Dish is Sold Out", type: "warning" });
      return;
    }

    const isComboEnabled = useGeneralSettingsStore.getState().settings.enableCombo !== false;
    const isItCombo = isComboEnabled && (dish.IsCombo === true || String(dish.IsCombo) === "1" || String(dish.IsCombo) === "true");
    if (isItCombo) {
      setComboDish(dish);
      setShowComboModal(true);
      return;
    }

    const isItOpenItem = Number(dish.IsOpenItem) === 1 || dish.IsOpenItem === true || dish.IsOpenItem === 'true' || dish.IsOpenItem === '1';
    if (isItOpenItem) {
      setOpenItemDish(dish);
      setOpenItemPrice(dish.Price > 0 ? String(dish.Price) : "");
      setOpenItemError("");
      setShowOpenItemModal(true);
      return;
    }

    setSelectedDish(dish);
    setSelectedModifierQuantities({});
    setLoadingModifiers(true);

    try {
      const res = await fetch(`${API_URL}/api/menu/modifiers/${dish.DishId}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setModifiers(data);
        setShowModifier(true);
      } else {
        addSimpleToCart(dish);
      }
    } catch (err) {
      addSimpleToCart(dish);
    } finally {
      setLoadingModifiers(false);
    }
  };

  // Settle Payment Action
  const handleCompletePayment = async () => {
    if (cartItems.length === 0) {
      toast.showToast({ message: "Cart is empty!", type: "warning" });
      return;
    }

    setIsProcessingPayment(true);
    try {
      const orderPayload = {
        orderType: "TAKEAWAY",
        takeawayNo: quickServeToken,
        cart: cartItems,
        subtotal,
        discountPercent,
        discountAmount,
        serviceChargeAmount,
        gstAmount,
        totalAmount: finalTotal,
        paymentMethod: selectedPaymentMethod,
        cashierId: user?.userId || 1,
        cashierName: user?.userName || "Cashier",
        paidAt: new Date().toISOString(),
      };

      await fetch(`${API_URL}/api/orders/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      }).catch(() => null);

      toast.showToast({
        message: "🎉 Payment Successful!",
        subtitle: `Bill Total: $${finalTotal.toFixed(2)} (${selectedPaymentMethod})`,
        type: "success",
        duration: 3000,
      });

      await clearCart();
      setQuickServeToken(`QS-${Math.floor(1000 + Math.random() * 9000)}`);
      setDiscountPercent(0);
      setCustomAmount("");
    } catch (err) {
      console.error("Payment error:", err);
      toast.showToast({ message: "Payment failed. Please try again.", type: "error" });
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const currentCategoryName = useMemo(() => {
    if (!selectedCategoryId) return "All Items";
    const found = categories.find((c) => c.CategoryId === selectedCategoryId);
    return found ? (found.KitchenTypeName || found.CategoryName) : "Items";
  }, [categories, selectedCategoryId]);

  const currentGroupName = useMemo(() => {
    if (!selectedGroupId) return "";
    const found = dishGroups.find((g) => String(g.DishGroupId) === String(selectedGroupId));
    return found ? found.DishGroupName : "";
  }, [dishGroups, selectedGroupId]);

  // Helper to filter tables for normal POS mode
  const getTablesForSection = (sectionName: string, loadedTables: any[]) => {
    if (loadedTables && loadedTables.length > 0) {
      const secKey = sectionName.toLowerCase();
      const filtered = loadedTables.filter((t) => {
        const s = String(t.DiningSection || t.section || "").toLowerCase();
        if (secKey.includes("takeaway")) return s.includes("takeaway") || String(t.TableName || t.name || "").startsWith("PU");
        if (secKey.includes("1")) return s.includes("1");
        if (secKey.includes("2")) return s.includes("2");
        if (secKey.includes("3")) return s.includes("3");
        return true;
      });
      if (filtered.length > 0) return filtered;
    }

    // Fallback demo table grid matching Image 2
    if (sectionName === "Takeaway") {
      return Array.from({ length: 10 }).map((_, i) => ({ id: `pu_${i+1}`, name: `PU${i + 1}` }));
    }
    return [
      { id: "36", name: "36", isOvertime: true },
      { id: "37", name: "37" },
      { id: "38", name: "38" },
      { id: "39", name: "39" },
      { id: "40", name: "40" },
      { id: "41", name: "41" },
      { id: "42", name: "42" },
      { id: "43", name: "43" },
      { id: "44", name: "44" },
      { id: "45", name: "45" },
      { id: "pu1", name: "PU1" },
      { id: "pu2", name: "PU2" },
      { id: "pu3", name: "PU3" },
      { id: "pu4", name: "PU4" },
      { id: "pu5", name: "PU5" },
      { id: "pu6", name: "PU6" },
      { id: "pu7", name: "PU7" },
      { id: "pu8", name: "PU8" },
      { id: "pu9", name: "PU9" },
      { id: "pu10", name: "PU10" },
    ];
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF7F2" />

      {/* TOP HEADER NAVBAR (COMMON TO BOTH MODES WITH QUICK SERVE UI ON/OFF TOGGLE) */}
      <View style={styles.topNavbar}>
        <View style={styles.navLeft}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.replace("/order-type")}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#334155" />
          </TouchableOpacity>

          <View style={styles.logoBadge}>
            <MaterialCommunityIcons name="hamburger" size={24} color="#FF5E1A" style={{ marginRight: 6 }} />
            <Text style={styles.logoTitle}>
              Quick Serve <Text style={{ color: "#FF5E1A" }}>POS</Text>
            </Text>
            <View style={styles.tokenTag}>
              <Text style={styles.tokenText}>{quickServeToken}</Text>
            </View>
          </View>
        </View>

        {/* SEARCH BAR (In Quick Serve Mode) */}
        {quickServeModeEnabled ? (
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search dishes by name or code..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Ionicons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            ) : (
              <View style={styles.searchShortcutTag}>
                <Text style={styles.searchShortcutText}>Ctrl + K</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {/* NAV RIGHT ACTIONS WITH QUICK SERVE UI ON/OFF TOGGLE BUTTON */}
        <View style={styles.navRight}>
          {/* QUICK SERVE UI MODE TOGGLE BUTTON */}
          <TouchableOpacity
            style={[
              styles.modeTogglePill,
              quickServeModeEnabled ? styles.modeTogglePillOn : styles.modeTogglePillOff,
            ]}
            onPress={() => toggleQuickServeMode()}
            activeOpacity={0.8}
          >
            <Ionicons
              name="flash"
              size={14}
              color={quickServeModeEnabled ? "#FFFFFF" : "#64748B"}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.modeToggleText,
                quickServeModeEnabled ? styles.modeToggleTextOn : styles.modeToggleTextOff,
              ]}
            >
              Quick Serve UI
            </Text>
            <View
              style={[
                styles.modeSwitchBadge,
                quickServeModeEnabled ? styles.modeSwitchBadgeOn : styles.modeSwitchBadgeOff,
              ]}
            >
              <Text
                style={[
                  styles.modeSwitchBadgeText,
                  quickServeModeEnabled ? styles.modeSwitchBadgeTextOn : styles.modeSwitchBadgeTextOff,
                ]}
              >
                {quickServeModeEnabled ? "ON" : "OFF"}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingsPillBtn} onPress={() => setStoreSettingsVisible(true)}>
            <Ionicons name="settings-outline" size={16} color="#334155" />
            <Text style={styles.settingsPillText}>Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconNavBtn}>
            <Ionicons name="notifications-outline" size={18} color="#334155" />
            <View style={styles.notifBadge}>
              <Text style={styles.notifBadgeText}>1</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.userBadge}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {user?.userName ? user.userName.charAt(0).toUpperCase() : "C"}
              </Text>
            </View>
            <Text style={styles.userNameText}>123</Text>
            <Ionicons name="chevron-down" size={14} color="#64748B" style={{ marginLeft: 4 }} />
          </View>
        </View>
      </View>

      {/* CONDITIONAL BODY: QUICK SERVE UI (WHEN ON) VS NORMAL POS TABLE LAYOUT (WHEN OFF) */}
      {quickServeModeEnabled ? (
        /* ==================== 1. QUICK SERVE COUNTER UI (WHEN ON) ==================== */
        <View style={styles.appShell}>
          {/* FAR LEFT NAVIGATION RAIL */}
          <View style={styles.leftRail}>
            <TouchableOpacity style={styles.railMenuBtn}>
              <Ionicons name="menu-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <ScrollView style={{ flex: 1, width: "100%" }} contentContainerStyle={styles.railList}>
              <TouchableOpacity style={[styles.railItem, styles.railItemActive]}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={20} color="#FFFFFF" />
                <Text style={[styles.railItemText, styles.railItemTextActive]}>Quick Serve</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.railItem}
                onPress={() => {
                  useOrderContextStore.getState().setOrderContext({
                    orderType: "DINE_IN",
                  });
                  router.replace("/(tabs)/category");
                }}
              >
                <Ionicons name="restaurant-outline" size={20} color="#94A3B8" />
                <Text style={styles.railItemText}>Dine In</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.railItem}
                onPress={() => {
                  const takeawayNo = `TW-${Math.floor(1000 + Math.random() * 9000)}`;
                  useOrderContextStore.getState().setOrderContext({
                    orderType: "TAKEAWAY",
                    takeawayNo,
                  });
                  router.replace("/(tabs)/category");
                }}
              >
                <Ionicons name="bag-handle-outline" size={20} color="#94A3B8" />
                <Text style={styles.railItemText}>Take Away</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.railItem} onPress={() => router.replace("/order-type")}>
                <Ionicons name="bicycle-outline" size={20} color="#94A3B8" />
                <Text style={styles.railItemText}>Delivery</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.railItem} onPress={() => router.replace("/order-type")}>
                <Ionicons name="receipt-outline" size={20} color="#94A3B8" />
                <Text style={styles.railItemText}>Orders</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.railItem} onPress={() => router.replace("/order-type")}>
                <Ionicons name="people-outline" size={20} color="#94A3B8" />
                <Text style={styles.railItemText}>Customers</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.railItem} onPress={() => router.replace("/order-type")}>
                <Ionicons name="bar-chart-outline" size={20} color="#94A3B8" />
                <Text style={styles.railItemText}>Reports</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.railItem}>
                <Ionicons name="ellipsis-horizontal-outline" size={20} color="#94A3B8" />
                <Text style={styles.railItemText}>More</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* RIGHT MAIN AREA (CATALOG + CART PANEL) */}
          <View style={styles.mainAreaWrap}>
            <View style={styles.mainBody}>
              {/* LEFT CATALOG AREA */}
              <View style={styles.leftCatalogArea}>
                {/* CATEGORY TABS (ROW 1) */}
                <View style={styles.categoryHeaderRow}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.scrollCategoryContent}
                  >
                    <TouchableOpacity
                      style={[styles.categoryPill, selectedCategoryId === null && styles.categoryPillActive]}
                      onPress={() => handleSelectCategory(null)}
                    >
                      <Ionicons
                        name="grid-outline"
                        size={16}
                        color={selectedCategoryId === null ? "#FFFFFF" : "#FF5E1A"}
                        style={{ marginRight: 6 }}
                      />
                      <Text
                        style={[
                          styles.categoryText,
                          selectedCategoryId === null && styles.categoryTextActive,
                        ]}
                      >
                        All
                      </Text>
                    </TouchableOpacity>

                    {categories.map((cat) => {
                      const isActive = selectedCategoryId === cat.CategoryId;
                      const catName = cat.KitchenTypeName || cat.CategoryName;
                      const iconName = getCategoryIcon(catName);

                      return (
                        <TouchableOpacity
                          key={cat.CategoryId}
                          style={[styles.categoryPill, isActive && styles.categoryPillActive]}
                          onPress={() => handleSelectCategory(cat.CategoryId)}
                        >
                          <Ionicons
                            name={iconName as any}
                            size={16}
                            color={isActive ? "#FFFFFF" : "#FF5E1A"}
                            style={{ marginRight: 6 }}
                          />
                          <Text
                            style={[
                              styles.categoryText,
                              isActive && styles.categoryTextActive,
                            ]}
                          >
                            {catName}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* DISH GROUP / SUB CATEGORIES (ROW 2) */}
                {dishGroups.length > 0 && (
                  <View style={styles.groupHeaderRow}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.scrollGroupContent}
                    >
                      {dishGroups.map((group: any) => {
                        const isActive = String(selectedGroupId) === String(group.DishGroupId);
                        const gName = group.DishGroupName;
                        const iconName = getGroupIcon(gName);

                        return (
                          <TouchableOpacity
                            key={group.DishGroupId}
                            style={[styles.groupPill, isActive && styles.groupPillActive]}
                            onPress={() => setSelectedGroupId(group.DishGroupId)}
                          >
                            <Ionicons
                              name={iconName as any}
                              size={14}
                              color={isActive ? "#FF5E1A" : "#64748B"}
                              style={{ marginRight: 4 }}
                            />
                            <Text
                              style={[
                                styles.groupText,
                                isActive && styles.groupTextActive,
                              ]}
                            >
                              {gName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <TouchableOpacity style={styles.groupScrollArrowBtn}>
                      <Ionicons name="chevron-forward" size={16} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                )}

                {/* CATALOG SUB-HEADER BAR */}
                <View style={styles.catalogSubHeader}>
                  <View style={styles.catalogTitleBox}>
                    <View style={styles.titleOrangeBar} />
                    <Text style={styles.catalogTitleText}>
                      {currentGroupName || currentCategoryName}{" "}
                      <Text style={styles.catalogCountText}>({sortedDishes.length} items)</Text>
                    </Text>
                  </View>

                  <View style={styles.catalogRightControls}>
                    <View style={styles.sortDropdownWrap}>
                      <Text style={styles.sortLabel}>Sort By</Text>
                      <TouchableOpacity style={styles.sortDropdownBtn}>
                        <Text style={styles.sortDropdownText}>
                          {sortBy === "NAME_ASC" ? "Name (A - Z)" : sortBy === "PRICE_LOW" ? "Price (Low to High)" : "Price (High to Low)"}
                        </Text>
                        <Ionicons name="chevron-down" size={14} color="#64748B" style={{ marginLeft: 4 }} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.viewModeToggle}>
                      <TouchableOpacity
                        style={[styles.viewModeBtn, viewMode === "grid" && styles.viewModeBtnActive]}
                        onPress={() => setViewMode("grid")}
                      >
                        <Ionicons
                          name="grid"
                          size={16}
                          color={viewMode === "grid" ? "#FFFFFF" : "#64748B"}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.viewModeBtn, viewMode === "list" && styles.viewModeBtnActive]}
                        onPress={() => setViewMode("list")}
                      >
                        <Ionicons
                          name="list"
                          size={16}
                          color={viewMode === "list" ? "#FFFFFF" : "#64748B"}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* DISHES GRID AREA */}
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#FF5E1A" />
                    <Text style={styles.loadingText}>Loading Dishes...</Text>
                  </View>
                ) : sortedDishes.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="fast-food-outline" size={48} color="#CBD5E1" />
                    <Text style={styles.emptyTitle}>No dishes found</Text>
                    <Text style={styles.emptySub}>Try selecting another category or group</Text>
                  </View>
                ) : (
                  <ScrollView
                    contentContainerStyle={styles.dishGridContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={styles.dishGrid}>
                      {sortedDishes.map((dish, idx) => {
                        const price = Number(dish.Price || dish.currentcost || 0);
                        const isSoldOut = Boolean(dish.IsSoldOut);
                        const rawImg = dish.Image || dish.ImagePath || dish.image || dish.image_url;
                        const imgUri = getImageUrl(rawImg);
                        const qtyInCart = cartQtyMap[String(dish.DishId)] || 0;

                        const isPopular = idx % 3 === 1;
                        const isSpicy = idx % 4 === 2;
                        const isChefSpecial = idx % 5 === 4;

                        return (
                          <TouchableOpacity
                            key={dish.DishId}
                            style={[styles.dishCard, isSoldOut && styles.dishCardSoldOut]}
                            onPress={() => handleDishClick(dish)}
                            activeOpacity={0.88}
                          >
                            <View style={styles.dishCoverWrap}>
                              {imgUri ? (
                                <Image
                                  source={{ uri: imgUri }}
                                  style={styles.dishCoverImage}
                                  contentFit="cover"
                                />
                              ) : (
                                <View style={styles.dishCoverPlaceholder}>
                                  <Ionicons name="restaurant-outline" size={36} color="#A39E93" />
                                </View>
                              )}

                              <View
                                style={[
                                  styles.vegIndicator,
                                  { borderColor: dish.IsVeg ? "#22C55E" : "#FF5E1A" },
                                ]}
                              >
                                <View
                                  style={[
                                    styles.vegDot,
                                    { backgroundColor: dish.IsVeg ? "#22C55E" : "#FF5E1A" },
                                  ]}
                                />
                              </View>

                              {isSoldOut ? (
                                <View style={styles.soldOutBadge}>
                                  <Text style={styles.soldOutText}>Sold Out</Text>
                                </View>
                              ) : qtyInCart > 0 ? (
                                <View style={styles.cartQtyBadge}>
                                  <Text style={styles.cartQtyBadgeText}>{qtyInCart}</Text>
                                </View>
                              ) : isPopular ? (
                                <View style={[styles.featureBadge, { backgroundColor: "#FF5E1A" }]}>
                                  <Text style={styles.featureBadgeText}>★ Popular</Text>
                                </View>
                              ) : isSpicy ? (
                                <View style={[styles.featureBadge, { backgroundColor: "#EF4444" }]}>
                                  <Text style={styles.featureBadgeText}>🌶 Spicy</Text>
                                </View>
                              ) : isChefSpecial ? (
                                <View style={[styles.featureBadge, { backgroundColor: "#10B981" }]}>
                                  <Text style={styles.featureBadgeText}>👑 Chef Special</Text>
                                </View>
                              ) : null}
                            </View>

                            <View style={styles.dishInfo}>
                              <Text style={styles.dishName} numberOfLines={1}>
                                {dish.Name}
                              </Text>

                              <View style={styles.dishFooterRow}>
                                <Text style={styles.dishPrice}>${price.toFixed(2)}</Text>

                                <TouchableOpacity
                                  style={[
                                    styles.addButton,
                                    isSoldOut && styles.addButtonDisabled,
                                  ]}
                                  onPress={() => handleDishClick(dish)}
                                  disabled={isSoldOut}
                                >
                                  <Ionicons name="add" size={16} color="#FFFFFF" />
                                  <Text style={styles.addButtonText}>Add</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </ScrollView>
                )}
              </View>

              {/* RIGHT CART & PAYMENT PANEL */}
              <View style={styles.rightCartArea}>
                <View style={styles.cartHeader}>
                  <View style={styles.cartHeaderLeft}>
                    <Ionicons name="cart" size={20} color="#FF5E1A" />
                    <Text style={styles.cartTitle}>Current Order</Text>
                    <View style={styles.itemCountBadge}>
                      <Text style={styles.itemCountText}>{cartItems.length}</Text>
                    </View>
                  </View>

                  {cartItems.length > 0 && (
                    <TouchableOpacity
                      onPress={() => clearCart()}
                      style={styles.clearCartBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" style={{ marginRight: 2 }} />
                      <Text style={styles.clearCartText}>Clear All</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView style={styles.cartList} showsVerticalScrollIndicator={false}>
                  {cartItems.length === 0 ? (
                    <View style={styles.emptyCartBox}>
                      <Ionicons name="basket-outline" size={46} color="#CBD5E1" />
                      <Text style={styles.emptyCartTitle}>Order cart is empty</Text>
                      <Text style={styles.emptyCartSub}>Select items from left to add to bill</Text>
                    </View>
                  ) : (
                    cartItems.map((item, idx) => {
                      const itemPrice = Number(item.price || 0);
                      const itemQty = Number(item.qty || 1);
                      const itemTotal = itemPrice * itemQty;
                      const itemImgUri = getImageUrl((item as any).Image || (item as any).image);

                      return (
                        <View key={item.lineItemId || idx} style={styles.cartItemRow}>
                          <View style={styles.cartItemThumb}>
                            {itemImgUri ? (
                              <Image source={{ uri: itemImgUri }} style={styles.cartItemImage} contentFit="cover" />
                            ) : (
                              <Ionicons name="restaurant-outline" size={20} color="#94A3B8" />
                            )}
                          </View>

                          <View style={styles.cartItemInfo}>
                            <Text style={styles.cartItemName} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={styles.cartItemUnitPrice}>
                              ${itemPrice.toFixed(2)} each
                            </Text>
                          </View>

                          <View style={styles.qtyControlRow}>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => {
                                if (itemQty > 1) {
                                  updateCartItemQty(item.lineItemId, itemQty - 1);
                                } else {
                                  removeFromCartGlobal(item.lineItemId);
                                }
                              }}
                            >
                              <Ionicons name="remove" size={14} color="#334155" />
                            </TouchableOpacity>
                            <Text style={styles.qtyText}>{itemQty}</Text>
                            <TouchableOpacity
                              style={styles.qtyBtn}
                              onPress={() => updateCartItemQty(item.lineItemId, itemQty + 1)}
                            >
                              <Ionicons name="add" size={14} color="#334155" />
                            </TouchableOpacity>
                          </View>

                          <Text style={styles.cartItemTotal}>${itemTotal.toFixed(2)}</Text>

                          <TouchableOpacity
                            onPress={() => removeFromCartGlobal(item.lineItemId)}
                            style={{ marginLeft: 8 }}
                          >
                            <Ionicons name="trash-outline" size={16} color="#EF4444" />
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  )}
                </ScrollView>

                <View style={styles.billSummaryBox}>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Subtotal</Text>
                    <Text style={styles.billValue}>${subtotal.toFixed(2)}</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.billRow}
                    onPress={() => setDiscountModalVisible(true)}
                  >
                    <Text style={[styles.billLabel, { color: "#FF5E1A" }]}>
                      Discount {discountPercent > 0 ? `(${discountPercent}%)` : ""}
                    </Text>
                    <Text style={[styles.billValue, { color: discountPercent > 0 ? "#EF4444" : "#FF5E1A" }]}>
                      {discountAmount > 0 ? `-$${discountAmount.toFixed(2)}` : "Apply Discount"}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Service Charge (5%)</Text>
                    <Text style={styles.billValue}>${serviceChargeAmount.toFixed(2)}</Text>
                  </View>

                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>GST (5%)</Text>
                    <Text style={styles.billValue}>${gstAmount.toFixed(2)}</Text>
                  </View>

                  <View style={styles.finalTotalCard}>
                    <Text style={styles.billTotalLabel}>Final Total</Text>
                    <Text style={styles.billTotalValue}>${finalTotal.toFixed(2)}</Text>
                  </View>
                </View>

                <View style={styles.paymentSection}>
                  <Text style={styles.paymentSectionTitle}>Select Payment Method</Text>

                  <View style={styles.payMethodsGrid}>
                    <TouchableOpacity
                      style={[
                        styles.payMethodBtn,
                        selectedPaymentMethod === "CASH" && styles.payMethodBtnActive,
                      ]}
                      onPress={() => setSelectedPaymentMethod("CASH")}
                    >
                      <Ionicons
                        name="cash-outline"
                        size={18}
                        color={selectedPaymentMethod === "CASH" ? "#FF5E1A" : "#0F172A"}
                      />
                      <Text
                        style={[
                          styles.payMethodText,
                          selectedPaymentMethod === "CASH" && styles.payMethodTextActive,
                        ]}
                      >
                        Cash
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.payMethodBtn,
                        selectedPaymentMethod === "CARD" && styles.payMethodBtnActive,
                      ]}
                      onPress={() => setSelectedPaymentMethod("CARD")}
                    >
                      <Ionicons
                        name="card-outline"
                        size={18}
                        color={selectedPaymentMethod === "CARD" ? "#FF5E1A" : "#0F172A"}
                      />
                      <Text
                        style={[
                          styles.payMethodText,
                          selectedPaymentMethod === "CARD" && styles.payMethodTextActive,
                        ]}
                      >
                        Card
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.payMethodBtn,
                        selectedPaymentMethod === "UPI" && styles.payMethodBtnActive,
                      ]}
                      onPress={() => setSelectedPaymentMethod("UPI")}
                    >
                      <Ionicons
                        name="qr-code-outline"
                        size={18}
                        color={selectedPaymentMethod === "UPI" ? "#FF5E1A" : "#0F172A"}
                      />
                      <Text
                        style={[
                          styles.payMethodText,
                          selectedPaymentMethod === "UPI" && styles.payMethodTextActive,
                        ]}
                      >
                        UPI / QR
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.payMethodBtn,
                        selectedPaymentMethod === "SPLIT" && styles.payMethodBtnActive,
                      ]}
                      onPress={() => setSelectedPaymentMethod("SPLIT")}
                    >
                      <Ionicons
                        name="options-outline"
                        size={18}
                        color={selectedPaymentMethod === "SPLIT" ? "#FF5E1A" : "#0F172A"}
                      />
                      <Text
                        style={[
                          styles.payMethodText,
                          selectedPaymentMethod === "SPLIT" && styles.payMethodTextActive,
                        ]}
                      >
                        Split
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {selectedPaymentMethod === "CASH" && (
                    <View style={styles.quickCashRow}>
                      {[10, 20, 50, 100].map((amt) => (
                        <TouchableOpacity
                          key={amt}
                          style={styles.quickCashChip}
                          onPress={() => setCustomAmount(String(amt))}
                        >
                          <Text style={styles.quickCashChipText}>${amt}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.completePaymentBtn,
                      cartItems.length === 0 && styles.completePaymentBtnDisabled,
                    ]}
                    onPress={handleCompletePayment}
                    disabled={cartItems.length === 0 || isProcessingPayment}
                  >
                    {isProcessingPayment ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                        <Text style={styles.completePaymentText}>
                          Complete Payment (${finalTotal.toFixed(2)})
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>
      ) : (
        /* ==================== 2. NORMAL POS TABLE/SECTION VIEW (WHEN OFF - MATCHING IMAGE 2) ==================== */
        <View style={styles.normalPosContainer}>
          {/* TOP SECTION TABS BAR */}
          <View style={styles.normalPosHeaderBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, alignItems: "center" }}>
              {["Section 1", "Section 2", "Section 3", "Takeaway"].map((sec, idx) => {
                const isActive = selectedSection === sec;
                const count = idx === 0 ? 2 : idx === 1 ? 1 : idx === 3 ? 1 : 0;
                return (
                  <TouchableOpacity
                    key={sec}
                    style={[styles.sectionTabPill, isActive && styles.sectionTabPillActive]}
                    onPress={() => setSelectedSection(sec)}
                  >
                    {sec === "Takeaway" ? (
                      <Ionicons name="bag-handle-outline" size={14} color={isActive ? "#FFFFFF" : "#64748B"} style={{ marginRight: 4 }} />
                    ) : (
                      <Ionicons name="restaurant-outline" size={14} color={isActive ? "#FFFFFF" : "#64748B"} style={{ marginRight: 4 }} />
                    )}
                    <Text style={[styles.sectionTabText, isActive && styles.sectionTabTextActive]}>
                      {sec}
                    </Text>
                    {count > 0 && (
                      <View style={[styles.sectionCountTag, isActive ? { backgroundColor: "rgba(255,255,255,0.25)" } : { backgroundColor: "#CBD5E1" }]}>
                        <Text style={[styles.sectionCountText, isActive && { color: "#FFFFFF" }]}>{count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}

              <View style={styles.datePillTag}>
                <Text style={styles.datePillText}>06-10-2026</Text>
                <Ionicons name="calendar-outline" size={14} color="#64748B" style={{ marginLeft: 4 }} />
              </View>

              <View style={styles.dayStartedBadge}>
                <Text style={styles.dayStartedText}>Day Started</Text>
              </View>

              <TouchableOpacity style={styles.normalPosTopBtn} onPress={() => router.replace("/status" as any)}>
                <Ionicons name="restaurant-outline" size={14} color="#166534" />
                <Text style={styles.normalPosTopBtnText}>Status</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.normalPosTopBtn} onPress={() => router.replace("/kds" as any)}>
                <Ionicons name="desktop-outline" size={14} color="#2563EB" />
                <Text style={[styles.normalPosTopBtnText, { color: "#2563EB" }]}>KDS</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.normalPosMenuBtn} onPress={() => router.replace("/order-type")}>
                <Ionicons name="menu-outline" size={16} color="#FF5E1A" />
                <Text style={styles.normalPosMenuBtnText}>Menu</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* SUB HEADER (TABLE COUNTS & STATUS LEGENDS) */}
          <View style={styles.normalPosSubHeader}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ width: 4, height: 16, backgroundColor: "#FF5E1A", borderRadius: 2, marginRight: 8 }} />
              <Text style={{ fontSize: 16, fontFamily: Fonts.bold, color: "#0F172A" }}>
                {selectedSection}
              </Text>
              <View style={styles.tableCountPill}>
                <Text style={{ fontSize: 12, fontFamily: Fonts.medium, color: "#475569" }}>20 tables</Text>
              </View>
              <View style={[styles.tableCountPill, { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" }]}>
                <Text style={{ fontSize: 12, fontFamily: Fonts.bold, color: "#059669" }}>● 4 occupied</Text>
              </View>
            </View>

            {/* LEGEND BADGES */}
            <View style={styles.statusLegendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#22C55E" }]} />
                <Text style={styles.legendText}>Dining</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#3B82F6" }]} />
                <Text style={styles.legendText}>Hold</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#F59E0B" }]} />
                <Text style={styles.legendText}>Checkout</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
                <Text style={styles.legendText}>Reserved</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#8B5CF6" }]} />
                <Text style={styles.legendText}>Overtime</Text>
              </View>
            </View>
          </View>

          {/* TABLE GRID */}
          {loadingTables ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="large" color="#FF5E1A" />
              <Text style={{ marginTop: 8, fontSize: 14, fontFamily: Fonts.medium, color: "#64748B" }}>
                Loading Tables...
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <View style={styles.normalTableGrid}>
                {getTablesForSection(selectedSection, tablesList).map((table: any) => {
                  const isOvertime = table.name === "36" || table.TableNo === "36";

                  return (
                    <TouchableOpacity
                      key={table.id || table.TableId || table.name || table.TableNo}
                      style={[
                        styles.normalTableCard,
                        isOvertime && styles.normalTableCardOvertime,
                      ]}
                      onPress={() => {
                        useOrderContextStore.getState().setOrderContext({
                          orderType: selectedSection === "Takeaway" ? "TAKEAWAY" : "DINE_IN",
                          tableId: String(table.TableId || table.id || ""),
                          tableNo: String(table.TableName || table.name || table.TableNo || ""),
                          section: selectedSection,
                        });
                        router.replace("/menu/thai_kitchen");
                      }}
                      activeOpacity={0.85}
                    >
                      {isOvertime ? (
                        <>
                          <View style={styles.tableOvertimeHeader}>
                            <Text style={styles.tableNoTextBold}>{table.TableName || table.name || "36"}</Text>
                            <Ionicons name="qr-code-outline" size={16} color="#8B5CF6" />
                          </View>
                          <View style={styles.overtimeBadge}>
                            <Text style={styles.overtimeBadgeText}>OVERTIME</Text>
                          </View>
                          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4 }}>
                            <Ionicons name="time-outline" size={12} color="#8B5CF6" style={{ marginRight: 2 }} />
                            <Text style={{ fontSize: 11, fontFamily: Fonts.bold, color: "#8B5CF6" }}>12:57</Text>
                          </View>
                          <Text style={{ fontSize: 14, fontFamily: Fonts.bold, color: "#8B5CF6", marginTop: 2 }}>$251.79</Text>
                        </>
                      ) : (
                        <Text style={styles.tableNoTextBig}>{table.TableName || table.name || table.TableNo}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          {/* FLOATING ACTION BUTTON */}
          <TouchableOpacity style={styles.normalPosFabBtn} onPress={() => toggleQuickServeMode(true)}>
            <Ionicons name="sparkles" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* DISCOUNT MODAL */}
      <Modal visible={discountModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Apply Discount (%)</Text>
            <TextInput
              style={styles.modalInput}
              keyboardType="numeric"
              placeholder="Enter discount percentage (e.g. 10)"
              value={tempDiscount}
              onChangeText={setTempDiscount}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDiscountModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={() => {
                  const val = parseFloat(tempDiscount) || 0;
                  setDiscountPercent(Math.min(100, Math.max(0, val)));
                  setDiscountModalVisible(false);
                }}
              >
                <Text style={styles.modalSaveText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* STORE SETTINGS MODAL */}
      <StoreSettingsModal
        visible={storeSettingsVisible}
        onClose={() => setStoreSettingsVisible(false)}
      />

      {/* MODIFIER MODAL */}
      {showModifier && selectedDish && (
        <Modal
          transparent
          visible={showModifier}
          animationType="fade"
          onRequestClose={() => setShowModifier(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowModifier(false)}
          >
            <TouchableOpacity activeOpacity={1} style={styles.modifierModalContent}>
              <View style={styles.modifierModalHeader}>
                <Text style={styles.modifierModalTitle} numberOfLines={2}>
                  Modifiers: {selectedDish.Name}
                </Text>
                <TouchableOpacity onPress={() => setShowModifier(false)}>
                  <Ionicons name="close" size={24} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.modifierModalBody}>
                {loadingModifiers ? (
                  <ActivityIndicator color="#FF5E1A" size="large" />
                ) : (
                  <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                    {groupedModifiers.map((group: any) => {
                      const gId = group.groupId;
                      const gName = group.groupName;
                      const maxSelect = group.maxSelect;
                      const minSelect = group.minSelect;
                      const multiselect = group.multiselect;
                      const groupSelectedCount = Object.entries(selectedModifierQuantities)
                        .filter(([k]) => k.endsWith(`_${gId}`))
                        .reduce((sum, [, q]) => sum + q, 0);

                      return (
                        <View key={gId} style={styles.modifierGroupContainer}>
                          <View style={styles.modifierGroupHeader}>
                            <Text style={styles.modifierGroupName}>{gName}</Text>
                            <Text style={styles.modifierGroupLimits}>
                              {minSelect > 0 && maxSelect > 0 && `(Select ${minSelect} to ${maxSelect})`}
                              {minSelect > 0 && maxSelect === 0 && `(Select at least ${minSelect})`}
                              {minSelect === 0 && maxSelect > 0 && `(Select up to ${maxSelect})`}
                              {minSelect === 0 && maxSelect === 0 && `(Optional)`}
                              {` - Selected: ${groupSelectedCount}`}
                            </Text>
                          </View>

                          <View style={styles.modifierGrid}>
                            {group.items.map((m: any) => {
                              const key = `${m.ModifierID}_${gId}`;
                              const qty = selectedModifierQuantities[key] || 0;
                              const isSelected = qty > 0;
                              const isDisabled = maxSelect > 0 && groupSelectedCount >= maxSelect && qty === 0;

                              return (
                                <TouchableOpacity
                                  key={m.ModifierID}
                                  style={[
                                    styles.modifierCard,
                                    isSelected && styles.modifierCardSelected,
                                    isDisabled && { opacity: 0.5 }
                                  ]}
                                  onPress={() => {
                                    if (isSelected || !isDisabled) {
                                      if (multiselect) {
                                        adjustModifierQuantity(m, gId, isSelected ? -1 : 1);
                                      } else {
                                        toggleModifier(m);
                                      }
                                    }
                                  }}
                                  disabled={isDisabled}
                                >
                                  <Text style={[styles.modifierCardName, isSelected && styles.modifierCardTextSelected]}>
                                    {m.ModifierName}
                                  </Text>
                                  {Number(m.Price) > 0 && (
                                    <Text style={[styles.modifierCardPrice, isSelected && styles.modifierCardTextSelected]}>
                                      +${Number(m.Price).toFixed(2)}
                                    </Text>
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <View style={styles.modifierModalFooter}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowModifier(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalSaveBtn, { flexDirection: "row", alignItems: "center" }]} onPress={addWithModifiers}>
                  <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.modalSaveText}>Done</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {/* COMBO CUSTOMIZER */}
      <ComboCustomizer
        visible={showComboModal}
        onClose={() => {
          setShowComboModal(false);
          setComboDish(null);
        }}
        dish={comboDish}
        kitchenName={categories.find((k) => k.CategoryId === selectedCategoryId)?.KitchenTypeName || "KITCHEN"}
        kitchenCode={categories.find((k) => k.CategoryId === selectedCategoryId)?.KitchenTypeCode || String(selectedCategoryId || "0")}
      />

      {/* OPEN ITEM PRICE MODAL */}
      <Modal
        transparent
        visible={showOpenItemModal}
        animationType="fade"
        onRequestClose={() => setShowOpenItemModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowOpenItemModal(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.openItemModalContent}>
            <View style={styles.modifierModalHeader}>
              <Text style={styles.modifierModalTitle}>Enter Price</Text>
              <TouchableOpacity onPress={() => setShowOpenItemModal(false)}>
                <Ionicons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 14, fontFamily: Fonts.medium, color: "#475569", marginBottom: 14 }}>
              {openItemDish?.Name}
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder={openItemDish?.Price > 0 ? `Default: $${openItemDish.Price}` : "Enter custom price"}
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
              value={openItemPrice}
              onChangeText={(t) => {
                setOpenItemPrice(t);
                setOpenItemError("");
              }}
              autoFocus
            />

            {openItemError ? (
              <Text style={{ color: "#EF4444", fontSize: 12, fontFamily: Fonts.medium, marginBottom: 10 }}>
                {openItemError}
              </Text>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowOpenItemModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={confirmOpenItemPrice}>
                <Text style={styles.modalSaveText}>Add to Cart</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FAF7F2",
  },
  appShell: {
    flex: 1,
    flexDirection: "row",
  },

  /* MODE TOGGLE PILL BUTTON IN HEADER */
  modeTogglePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 6,
  },
  modeTogglePillOn: {
    backgroundColor: "#FF5E1A",
    borderColor: "#FF5E1A",
  },
  modeTogglePillOff: {
    backgroundColor: "#FAF7F2",
    borderColor: "#E8E0D5",
  },
  modeToggleText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
  },
  modeToggleTextOn: {
    color: "#FFFFFF",
  },
  modeToggleTextOff: {
    color: "#334155",
  },
  modeSwitchBadge: {
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  modeSwitchBadgeOn: {
    backgroundColor: "#FFFFFF",
  },
  modeSwitchBadgeOff: {
    backgroundColor: "#E2E8F0",
  },
  modeSwitchBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
  },
  modeSwitchBadgeTextOn: {
    color: "#FF5E1A",
  },
  modeSwitchBadgeTextOff: {
    color: "#64748B",
  },

  /* FAR LEFT NAVIGATION RAIL */
  leftRail: {
    width: 76,
    backgroundColor: "#0B132B",
    alignItems: "center",
    paddingTop: 12,
    borderRightWidth: 1,
    borderRightColor: "#1E293B",
  },
  railMenuBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  railList: {
    alignItems: "center",
    gap: 12,
    paddingBottom: 20,
  },
  railItem: {
    width: 66,
    height: 60,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  railItemActive: {
    backgroundColor: "#FF5E1A",
  },
  railItemText: {
    fontSize: 10,
    fontFamily: Fonts.medium,
    color: "#94A3B8",
    marginTop: 4,
    textAlign: "center",
  },
  railItemTextActive: {
    color: "#FFFFFF",
    fontFamily: Fonts.bold,
  },

  /* MAIN AREA WRAPPER */
  mainAreaWrap: {
    flex: 1,
    flexDirection: "column",
  },

  /* NAVBAR STYLES */
  topNavbar: {
    height: 60,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8E0D5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  navLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FAF7F2",
    borderWidth: 1,
    borderColor: "#E8E0D5",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  logoBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#0F172A",
  },
  tokenTag: {
    backgroundColor: "#FFF0EA",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 10,
    borderWidth: 1,
    borderColor: "rgba(255,94,26,0.3)",
  },
  tokenText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#FF5E1A",
  },

  searchContainer: {
    flex: 1,
    maxWidth: 380,
    height: 40,
    backgroundColor: "#FAF7F2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E8E0D5",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    marginHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#0F172A",
  },
  searchShortcutTag: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  searchShortcutText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#94A3B8",
  },

  navRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  settingsPillBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAF7F2",
    borderWidth: 1,
    borderColor: "#E8E0D5",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  settingsPillText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#334155",
    marginLeft: 4,
  },
  iconNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FAF7F2",
    borderWidth: 1,
    borderColor: "#E8E0D5",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notifBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#FF5E1A",
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadgeText: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  userBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAF7F2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E8E0D5",
  },
  avatarCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  avatarText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  userNameText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#334155",
  },

  /* MAIN BODY STYLES */
  mainBody: {
    flex: 1,
    flexDirection: "row",
  },

  /* LEFT CATALOG AREA */
  leftCatalogArea: {
    flex: 1,
    backgroundColor: "#FAF7F2",
    borderRightWidth: 1,
    borderRightColor: "#E8E0D5",
  },

  /* ROW 1: CATEGORY TABS */
  categoryHeaderRow: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E0D5",
  },
  scrollCategoryContent: {
    paddingHorizontal: 16,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#FAF7F2",
    borderWidth: 1,
    borderColor: "#E8E0D5",
    marginRight: 10,
  },
  categoryPillActive: {
    backgroundColor: "#FF5E1A",
    borderColor: "#FF5E1A",
  },
  categoryText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#334155",
  },
  categoryTextActive: {
    color: "#FFFFFF",
  },

  /* ROW 2: DISH GROUPS / SUBCATEGORIES */
  groupHeaderRow: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E0D5",
    flexDirection: "row",
    alignItems: "center",
  },
  scrollGroupContent: {
    paddingRight: 10,
  },
  groupPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E8E0D5",
  },
  groupPillActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FF5E1A",
    borderWidth: 1.5,
  },
  groupText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#475569",
  },
  groupTextActive: {
    color: "#FF5E1A",
    fontFamily: Fonts.bold,
  },
  groupScrollArrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FAF7F2",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },

  /* CATALOG SUB-HEADER BAR */
  catalogSubHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  catalogTitleBox: {
    flexDirection: "row",
    alignItems: "center",
  },
  titleOrangeBar: {
    width: 4,
    height: 18,
    backgroundColor: "#FF5E1A",
    borderRadius: 2,
    marginRight: 8,
  },
  catalogTitleText: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#0F172A",
  },
  catalogCountText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#64748B",
  },
  catalogRightControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sortDropdownWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
  sortLabel: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#64748B",
    marginRight: 6,
  },
  sortDropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8E0D5",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  sortDropdownText: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#334155",
  },
  viewModeToggle: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E8E0D5",
    padding: 2,
  },
  viewModeBtn: {
    width: 30,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  viewModeBtnActive: {
    backgroundColor: "#FF5E1A",
  },

  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#64748B",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: "#475569",
    marginTop: 10,
  },
  emptySub: {
    fontSize: 13,
    fontFamily: Fonts.regular,
    color: "#94A3B8",
    marginTop: 4,
  },

  /* DISHES GRID AREA */
  dishGridContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  dishGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  dishCard: {
    width: "23.5%",
    minWidth: 170,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8E0D5",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  dishCardSoldOut: {
    opacity: 0.6,
  },
  dishCoverWrap: {
    height: 130,
    width: "100%",
    backgroundColor: "#F7F3EC",
    position: "relative",
  },
  dishCoverImage: {
    width: "100%",
    height: "100%",
  },
  dishCoverPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFEBE4",
  },
  vegIndicator: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  vegDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  featureBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    zIndex: 5,
  },
  featureBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  cartQtyBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#FF5E1A",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  cartQtyBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: Fonts.bold,
  },
  soldOutBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#EF4444",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    zIndex: 5,
  },
  soldOutText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  dishInfo: {
    padding: 12,
  },
  dishName: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#0F172A",
    marginBottom: 8,
  },
  dishFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dishPrice: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#FF5E1A",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF5E1A",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addButtonDisabled: {
    backgroundColor: "#94A3B8",
  },
  addButtonText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
    marginLeft: 2,
  },

  /* RIGHT CART PANEL AREA */
  rightCartArea: {
    width: 380,
    backgroundColor: "#FFFFFF",
    borderLeftWidth: 1,
    borderLeftColor: "#E8E0D5",
    display: "flex",
    flexDirection: "column",
  },
  cartHeader: {
    height: 54,
    borderBottomWidth: 1,
    borderBottomColor: "#E8E0D5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  cartHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  cartTitle: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#0F172A",
    marginLeft: 6,
  },
  itemCountBadge: {
    backgroundColor: "#FF5E1A",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  itemCountText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  clearCartBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  clearCartText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#EF4444",
  },

  cartList: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyCartBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
  },
  emptyCartTitle: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#64748B",
    marginTop: 8,
  },
  emptyCartSub: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#94A3B8",
    marginTop: 2,
  },

  cartItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F0E8",
  },
  cartItemThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#FAF7F2",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#E8E0D5",
  },
  cartItemImage: {
    width: "100%",
    height: "100%",
  },
  cartItemInfo: {
    flex: 1,
    marginRight: 8,
  },
  cartItemName: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#0F172A",
  },
  cartItemUnitPrice: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: "#64748B",
  },
  qtyControlRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAF7F2",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E8E0D5",
    padding: 2,
    marginRight: 8,
  },
  qtyBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#0F172A",
    paddingHorizontal: 6,
  },
  cartItemTotal: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#0F172A",
  },

  /* BILL SUMMARY */
  billSummaryBox: {
    backgroundColor: "#FAF7F2",
    borderTopWidth: 1,
    borderTopColor: "#E8E0D5",
    padding: 16,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  billLabel: {
    fontSize: 12,
    fontFamily: Fonts.medium,
    color: "#64748B",
  },
  billValue: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#334155",
  },
  finalTotalCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF0EA",
    borderWidth: 1,
    borderColor: "rgba(255,94,26,0.3)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  billTotalLabel: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#0F172A",
  },
  billTotalValue: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: "#0F172A",
  },

  /* PAYMENT SECTION */
  paymentSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E8E0D5",
    backgroundColor: "#FFFFFF",
  },
  paymentSectionTitle: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#475569",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  payMethodsGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  payMethodBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E8E0D5",
  },
  payMethodBtnActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FF5E1A",
    borderWidth: 1.5,
  },
  payMethodText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#334155",
    marginLeft: 4,
  },
  payMethodTextActive: {
    color: "#FF5E1A",
  },

  quickCashRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  quickCashChip: {
    flex: 1,
    backgroundColor: "#FAF7F2",
    borderWidth: 1,
    borderColor: "#E8E0D5",
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: "center",
  },
  quickCashChipText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#334155",
  },

  completePaymentBtn: {
    height: 50,
    backgroundColor: "#FF5E1A",
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  completePaymentBtnDisabled: {
    backgroundColor: "#CBD5E1",
  },
  completePaymentText: {
    fontSize: 15,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
    marginLeft: 6,
  },

  /* ==================== NORMAL POS TABLE/SECTION VIEW STYLES (IMAGE 2) ==================== */
  normalPosContainer: {
    flex: 1,
    backgroundColor: "#FAF7F2",
  },
  normalPosHeaderBar: {
    height: 56,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E8E0D5",
    flexDirection: "row",
    alignItems: "center",
  },
  sectionTabPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#FAF7F2",
    borderWidth: 1,
    borderColor: "#E8E0D5",
    marginRight: 10,
  },
  sectionTabPillActive: {
    backgroundColor: "#FF5E1A",
    borderColor: "#FF5E1A",
  },
  sectionTabText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
    color: "#475569",
  },
  sectionTabTextActive: {
    color: "#FFFFFF",
  },
  sectionCountTag: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  sectionCountText: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#475569",
  },
  datePillTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FAF7F2",
    borderWidth: 1,
    borderColor: "#E8E0D5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 10,
  },
  datePillText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#475569",
  },
  dayStartedBadge: {
    backgroundColor: "#22C55E",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 10,
  },
  dayStartedText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  normalPosTopBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  normalPosTopBtnText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#166534",
    marginLeft: 4,
  },
  normalPosMenuBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF0EA",
    borderWidth: 1,
    borderColor: "rgba(255,94,26,0.3)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginLeft: 4,
  },
  normalPosMenuBtnText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#FF5E1A",
    marginLeft: 4,
  },

  normalPosSubHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#FAF7F2",
    borderBottomWidth: 1,
    borderBottomColor: "#E8E0D5",
  },
  tableCountPill: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E8E0D5",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusLegendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  legendText: {
    fontSize: 11,
    fontFamily: Fonts.medium,
    color: "#64748B",
  },

  normalTableGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  normalTableCard: {
    width: 120,
    height: 100,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#E8E0D5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  normalTableCardOvertime: {
    borderColor: "#8B5CF6",
    backgroundColor: "#F5F3FF",
  },
  tableNoTextBig: {
    fontSize: 22,
    fontFamily: Fonts.bold,
    color: "#0F172A",
  },
  tableNoTextBold: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#0F172A",
  },
  tableOvertimeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 12,
  },
  overtimeBadge: {
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },
  overtimeBadgeText: {
    fontSize: 9,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  normalPosFabBtn: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FF5E1A",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF5E1A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },

  /* MODAL STYLES */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBox: {
    width: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: "#0F172A",
    marginBottom: 12,
  },
  modalInput: {
    height: 44,
    borderWidth: 1,
    borderColor: "#E8E0D5",
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: Fonts.regular,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modalCancelText: {
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: "#64748B",
  },
  modalSaveBtn: {
    backgroundColor: "#FF5E1A",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  modalSaveText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#FFFFFF",
  },
  modifierModalContent: {
    width: 520,
    maxWidth: "92%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  modifierModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingBottom: 12,
  },
  modifierModalTitle: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: "#0F172A",
    flex: 1,
  },
  modifierModalBody: {
    marginBottom: 16,
  },
  modifierGroupContainer: {
    marginBottom: 16,
  },
  modifierGroupHeader: {
    marginBottom: 8,
  },
  modifierGroupName: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#1E293B",
  },
  modifierGroupLimits: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#64748B",
  },
  modifierGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  modifierCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E8E0D5",
    backgroundColor: "#FAF7F2",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 100,
  },
  modifierCardSelected: {
    borderColor: "#FF5E1A",
    backgroundColor: "#FFF4EC",
  },
  modifierCardName: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: "#334155",
  },
  modifierCardPrice: {
    fontSize: 11,
    fontFamily: Fonts.bold,
    color: "#64748B",
    marginTop: 2,
  },
  modifierCardTextSelected: {
    color: "#FF5E1A",
  },
  modifierModalFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    paddingTop: 12,
  },
  openItemModalContent: {
    width: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
  },
});
