import { create } from 'zustand';
import { API_URL } from '@/constants/Config';
import { socket } from '@/constants/socket';

interface MenuState {
  kitchens: any[];
  dishGroups: Record<string, any[]>;
  dishesByGroup: Record<string, any[]>;
  allDishes: any[];
  modifierCache: Record<string, any[]>;
  directFetchedGroups: Record<string, boolean>;
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
  directFetchedGroups: {},
  lastFetched: null,
  isLoading: false,

  fetchMenu: async (force = false) => {
    const { lastFetched, kitchens, allDishes, isLoading } = get();
    // Cache for 10 minutes unless forced or if data is incomplete
    if (!force && lastFetched && kitchens.length > 0 && allDishes.length > 0 && Date.now() - lastFetched < 600000) {
      return;
    }
    if (isLoading && force) {
      return;
    }

    set({ isLoading: true });
    try {
      const cleanId = (id: any) => String(id || "").replace(/[{}]/g, "").trim().toLowerCase();
      const cacheBust = force ? `?force=1&t=${Date.now()}` : "";

      // 🚀 PARALLEL ATOMIC FETCH: Load kitchens, all dish groups, and all dishes concurrently
      const [kRes, gRes, dRes] = await Promise.all([
        fetch(`${API_URL}/api/menu/kitchens${cacheBust}`),
        fetch(`${API_URL}/api/menu/dishgroups/all${cacheBust}`),
        fetch(`${API_URL}/api/menu/dishes/all${cacheBust}`)
      ]);

      const [kData, gData, dData] = await Promise.all([
        kRes.json(),
        gRes.json(),
        dRes.json()
      ]);

      const rawKitchens = Array.isArray(kData) ? kData.filter((k: any) => k.KitchenTypeName && !k.KitchenTypeName.includes("TEST")) : [];
      // 🟢 Deduplicate kitchens by CategoryId
      const kitchensData = Array.from(
        new Map(rawKitchens.map((k: any) => [cleanId(k.CategoryId), k])).values()
      );

      const allDishesRaw = Array.isArray(dData) ? dData : [];
      // Deduplicate & clean dishes by normalized DishId
      const allDishesData = Array.from(
        new Map(allDishesRaw.map((d: any) => [cleanId(d.DishId || d.id), d])).values()
      );

      // 🟢 Build dishGroups map grouped by CategoryId (keyed by both raw & cleanId)
      const groupsRaw = Array.isArray(gData) ? gData : [];
      const dishGroupsMap: Record<string, any[]> = {};
      groupsRaw.forEach((g: any) => {
        const catId = g.CategoryId;
        if (catId) {
          const cCatId = cleanId(catId);
          [catId, cCatId].forEach((key) => {
            if (!dishGroupsMap[key]) dishGroupsMap[key] = [];
            if (!dishGroupsMap[key].some((existing: any) => cleanId(existing.DishGroupId) === cleanId(g.DishGroupId))) {
              dishGroupsMap[key].push(g);
            }
          });
        }
      });

      // 🟢 Build dishesByGroup map for ALL groups directly from allDishesData
      const dishesByGroupMap: Record<string, any[]> = {};

      // 1. Map dishes for groups defined in groupsRaw
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
        dishesByGroupMap[targetGId] = groupDishes;
      });

      // 2. Comprehensive pass: ensure every dish's primary and mapped group IDs are present in dishesByGroupMap
      allDishesData.forEach((d: any) => {
        const primaryGId = cleanId(d.DishGroupId);
        const mappedGroupIds = d.MappedGroupIds
          ? String(d.MappedGroupIds).split(",").map(s => cleanId(s)).filter(Boolean)
          : [];
        const groupIdsToAddTo = new Set<string>();
        if (primaryGId) groupIdsToAddTo.add(primaryGId);
        mappedGroupIds.forEach(gid => groupIdsToAddTo.add(gid));

        groupIdsToAddTo.forEach((gid) => {
          if (!dishesByGroupMap[gid]) dishesByGroupMap[gid] = [];
          if (!dishesByGroupMap[gid].some((existing: any) => cleanId(existing.DishId || existing.id) === cleanId(d.DishId || d.id))) {
            dishesByGroupMap[gid].push(d);
          }
        });
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
    const cleanId = (id: any) => String(id || "").replace(/[{}]/g, "").trim().toLowerCase();
    const cKId = cleanId(kitchenId);

    if (dishGroups[kitchenId]) return dishGroups[kitchenId];
    if (dishGroups[cKId]) return dishGroups[cKId];

    try {
      const res = await fetch(`${API_URL}/api/menu/dishgroups/${kitchenId}`);
      const data = await res.json();
      const rawGroups = Array.isArray(data) ? data : [];
      // 🟢 Deduplicate groups by DishGroupId
      const groups = Array.from(
        new Map(rawGroups.map((g: any) => [cleanId(g.DishGroupId || g.id), g])).values()
      );
      
      set((state) => ({
        dishGroups: { ...state.dishGroups, [kitchenId]: groups, [cKId]: groups }
      }));
      return groups;
    } catch (error) {
      console.error(`Failed to fetch groups for kitchen ${kitchenId}:`, error);
      return [];
    }
  },

  fetchDishes: async (groupId, force = false) => {
    const { dishesByGroup, modifierCache, allDishes, directFetchedGroups } = get();
    const cleanId = (id: any) => String(id || "").replace(/[{}]/g, "").trim().toLowerCase();
    const cGId = cleanId(groupId);

    if (!force && directFetchedGroups[cGId] && (dishesByGroup[groupId] || dishesByGroup[cGId])) {
      const groupDishes = dishesByGroup[groupId] || dishesByGroup[cGId];
      const hasAnyModifierCached = groupDishes.some(d => modifierCache[cleanId(d.DishId || d.id)] !== undefined);
      if (!hasAnyModifierCached) {
        get().fetchModifiersForGroup(groupId);
      }
      return groupDishes;
    }

    try {
      const cacheBust = force ? `?force=1&t=${Date.now()}` : "";
      const res = await fetch(`${API_URL}/api/menu/dishes/group/${groupId}${cacheBust}`);
      const data = await res.json();
      const dishesRaw = Array.isArray(data) ? data : [];
      
      // Clean and deduplicate dishes by DishId
      const dishes = Array.from(
        new Map(dishesRaw.map((d: any) => [cleanId(d.DishId || d.id), d])).values()
      );

      // Merge into allDishes to ensure allDishes remains 100% comprehensive
      const updatedAllMap = new Map<string, any>();
      allDishes.forEach((d: any) => {
        const id = cleanId(d.DishId || d.id);
        if (id) updatedAllMap.set(id, d);
      });
      dishes.forEach((d: any) => {
        const id = cleanId(d.DishId || d.id);
        if (id) {
          const existing = updatedAllMap.get(id);
          updatedAllMap.set(id, existing ? { ...existing, ...d } : d);
        }
      });

      set((state) => ({
        dishesByGroup: { ...state.dishesByGroup, [groupId]: dishes, [cGId]: dishes },
        directFetchedGroups: { ...state.directFetchedGroups, [groupId]: true, [cGId]: true },
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
    set({ isLoading: true });
    try {
      await fetch(`${API_URL}/api/menu/clear-cache`, { method: 'POST' });
    } catch (err) {
      console.warn("Backend cache clear failed:", err);
    }
    // fetchMenu(true) fetches kitchens, dishgroups/all, and dishes/all concurrently in 3 clean requests,
    // refreshing all groups and dishes without flooding the network with dozens of individual requests.
    await get().fetchMenu(true);
    set({ isLoading: false });
  },
}));

// 🔌 Real-time Socket Listener for Menu Updates (e.g. IsPublished toggle = 1 or 0)
socket.on('menu_updated', (data) => {
  console.log('⚡ [MenuStore] Received menu_updated socket event:', data);
  useMenuStore.getState().fetchMenu(true);
});
