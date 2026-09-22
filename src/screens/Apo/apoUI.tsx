// Apo — UI-контекст: Drawer-оверлей слева (замена таб-бара).
// NATIVE OWNER (Ares): App.tsx за scaffold — сюда не лезть; Drawer живёт
// внутри ApoNavigator и открывается шестерёнкой с Home.
import React, { createContext, useContext, useState } from 'react';

interface ApoUI {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const Ctx = createContext<ApoUI>({ drawerOpen: false, openDrawer: () => {}, closeDrawer: () => {} });

export function ApoUIProvider({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  return (
    <Ctx.Provider
      value={{ drawerOpen, openDrawer: () => setDrawerOpen(true), closeDrawer: () => setDrawerOpen(false) }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApoUI() {
  return useContext(Ctx);
}
