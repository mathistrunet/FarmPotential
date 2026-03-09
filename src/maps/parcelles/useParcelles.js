import { useContext } from "react";

import { ParcellesContext } from "./ParcellesContext";

export function useParcelles() {
  const context = useContext(ParcellesContext);
  if (!context) {
    throw new Error("[PARCELLES_CONTEXT_MISSING] useParcelles doit être utilisé dans ParcellesProvider.");
  }
  return context;
}
