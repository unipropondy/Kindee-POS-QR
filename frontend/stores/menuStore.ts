import { create } from 'zustand';
import { API_URL } from '@/constants/Config';
import { socket } from '@/constants/socket';

interface MenuState {
  kitchens: any[];
  dishGroups: Record<string, any[]>;
  dishesByGroup: Record<string, any[]>;
  allDishes: any[];
  modifierCache: Record<string, any[]>;
  lastFetched: number | null;
  isLoading: boolean;

  fetchMenu: (force?: boolean) => Promise<void>;
  fetchGroups: (kitchenId: string) => Promise<any[]>;
  fetchDishes: (groupId: string, force?: boolean) => Promise<any[]>;
  fetchModifiersForGroup: (groupId: string) => Promise<void>;
  clearCache: () => void;
  forceRefreshMenu: () => Promise<void>;
}

export const useMenuStore = create<MenuState>((set, get) => ({
  kitchens: [],
  dishGroups: {},
  dishesByGroup: {},
  allDishes: [],
  modifierCache: {},
  lastFetched: null,
  isLoading: false,

  fetchMenu: async (force = false) => {
    const { lastFetched, kitchens } = get();
    // Cache for 10 minutes unless forced
    if (!force && lastFetched && kitchens.length > 0 && Date.now() - lastFetched < 600000) {
      return;
    }

    set({ isLoading: true });
    try {
      // 🚀 PARALLEL ATOMIC FETCH: Load kitchens, all dish groups, and all dishes concurrently
      const [kRes, gRes, dRes] = await Promise.all([
        fetch(`${API_URL}/api/menu/kitchens`),
        fetch(`${API_URL}/api/menu/dishgroups/all`),
        fetch(`${API_URL}/api/menu/dishes/all`)
      ]);

      const [kData, gData, dData] = await Promise.all([
        kRes.json(),
        gRes.json(),
        dRes.json()
      ]);

      const rawKitchens = Array.isArray(kData) ? kData.filter((k: any) => k.KitchenTypeName && !k.KitchenTypeName.includes("TEST")) : [];
      // 🟢 Deduplicate kitchens by CategoryId
      const kitchensData = Array.from(
        new Map(rawKitchens.map((k: any) => [k.CategoryId, k])).values()
      );

      const allDishesRaw = Array.isArray(dData) ? dData : [];
      // Deduplicate & clean dishes by normalized DishId
      const allDishesData = Array.from(
        new Map(allDishesRaw.map((d: any) => [String(d.DishId || d.id).replace(/[{}]/g, "").trim().toLowerCase(), d])).values()
      );

      // 🟢 Build dishGroups map grouped by CategoryId
      const groupsRaw = Array.isArray(gData) ? gData : [];
      const dishGroupsMap: Record<string, any[]> = {};
      groupsRaw.forEach((g: any) => {
        const catId = g.CategoryId;
        if (catId) {
          if (!dishGroupsMap[catId]) dishGroupsMap[catId] = [];
          if (!dishGroupsMap[catId].some((existing: any) => existing.DishGroupId === g.DishGroupId)) {
            dishGroupsMap[catId].push(g);
          }
        }
      });

      // 🟢 Build dishesByGroup map for ALL groups directly from allDishesData
      const dishesByGroupMap: Record<string, any[]> = {};
      const cleanId = (id: any) => String(id || "").replace(/[{}]/g, "").trim().toLowerCase();

      groupsRaw.forEach((g: any) => {
        const targetGId = cleanId(g.DishGroupId);
        if (!targetGId) return;

        const groupDishes = allDishesData.filter((d: any) => {
          if (cleanId(d.DishGroupId) === targetGId) return true;
          if (d.MappedGroupIds) {
            const mappedArr = String(d.MappedGroupIds).split(",").map(s => cleanId(s)).filter(Boolean);
            if (mappedArr.includes(targetGId)) return true;
          }
          return false;
        });

        dishesByGroupMap[g.DishGroupId] = groupDishes;
      });

      set((state) => ({ 
        kitchens: kitchensData,
        dishGroups: { ...state.dishGroups, ...dishGroupsMap },
        dishesByGroup: { ...state.dishesByGroup, ...dishesByGroupMap },
        allDishes: allDishesData,
        lastFetched: Date.now(),
        isLoading: false 
      }));
    } catch (error) {
      console.error("Failed to fetch menu:", error);
      set({ isLoading: false });
    }
  },

  fetchGroups: async (kitchenId) => {
    const { dishGroups } = get();
    if (dishGroups[kitchenId]) return dishGroups[kitchenId];

    try {
      const res = await fetch(`${API_URL}/api/menu/dishgroups/${kitchenId}`);
      const data = await res.json();
      const rawGroups = Array.isArray(data) ? data : [];
      // 🟢 Deduplicate groups by DishGroupId
      const groups = Array.from(
        new Map(rawGroups.map((g: any) => [g.DishGroupId || g.id, g])).values()
      );
      
      set((state) => ({
        dishGroups: { ...state.dishGroups, [kitchenId]: groups }
      }));
      return groups;
    } catch (error) {
      console.error(`Failed to fetch groups for kitchen ${kitchenId}:`, error);
      return [];
    }
  },

  fetchDishes: async (groupId, force = false) => {
    const { dishesByGroup, modifierCache, allDishes } = get();
    if (!force && dishesByGroup[groupId]) {
      const groupDishes = dishesByGroup[groupId];
      const hasAnyModifierCached = groupDishes.some(d => modifierCache[d.DishId || d.id] !== undefined);
      if (!hasAnyModifierCached) {
        get().fetchModifiersForGroup(groupId);
      }
      return dishesByGroup[groupId];
    }

    try {
      const res = await fetch(`${API_URL}/api/menu/dishes/group/${groupId}`);
      const data = await res.json();
      const dishesRaw = Array.isArray(data) ? data : [];
      
      // Clean and deduplicate dishes by DishId
      const dishes = Array.from(
        new Map(dishesRaw.map((d: any) => [String(d.DishId || d.id).replace(/[{}]/g, "").trim().toLowerCase(), d])).values()
      );

      // Merge into allDishes to ensure allDishes remains 100% comprehensive
      const updatedAllMap = new Map<string, any>();
      allDishes.forEach((d: any) => {
        const id = String(d.DishId || d.id).replace(/[{}]/g, "").trim().toLowerCase();
        if (id) updatedAllMap.set(id, d);
      });
      dishes.forEach((d: any) => {
        const id = String(d.DishId || d.id).replace(/[{}]/g, "").trim().toLowerCase();
        if (id) {
          const existing = updatedAllMap.get(id);
          updatedAllMap.set(id, existing ? { ...existing, ...d } : d);
        }
      });

      set((state) => ({
        dishesByGroup: { ...state.dishesByGroup, [groupId]: dishes },
        allDishes: Array.from(updatedAllMap.values())
      }));

      // 🚀 BACKGROUND PRE-FETCH: Load all modifiers for this group
      get().fetchModifiersForGroup(groupId);

      return dishes;
    } catch (error) {
      console.error(`Failed to fetch dishes for group ${groupId}:`, error);
      return [];
    }
  },

  fetchModifiersForGroup: async (groupId) => {
    try {
      const res = await fetch(`${API_URL}/api/menu/modifiers/group/${groupId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        const newModifiers: Record<string, any[]> = {};
        data.forEach(m => {
          if (!newModifiers[m.DishId]) newModifiers[m.DishId] = [];
          newModifiers[m.DishId].push(m);
        });
        
        set(state => ({
          modifierCache: { ...state.modifierCache, ...newModifiers }
        }));
      }
    } catch (err) {
      console.error("Failed to fetch group modifiers:", err);
    }
  },

  clearCache: () => set({ lastFetched: null }),

  forceRefreshMenu: async () => {
    const { dishesByGroup } = get();
    set({ isLoading: true });
    try {
      await fetch(`${API_URL}/api/menu/clear-cache`, { method: 'POST' });
    } catch (err) {
      console.warn("Backend cache clear failed:", err);
    }
    await get().fetchMenu(true);

    // Re-fetch all currently active cached groups to keep dishesByGroup fresh
    const activeGroupIds = Object.keys(dishesByGroup);
    if (activeGroupIds.length > 0) {
      await Promise.all(activeGroupIds.map(gId => get().fetchDishes(gId, true)));
    }
    set({ isLoading: false });
  },
}));

// 🔌 Real-time Socket Listener for Menu Updates (e.g. IsPublished toggle = 1 or 0)
socket.on('menu_updated', (data) => {
  console.log('⚡ [MenuStore] Received menu_updated socket event:', data);
  useMenuStore.getState().forceRefreshMenu();
});
