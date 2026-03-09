import { useContext } from "react";

import { ParcellesMatchContext } from "./ParcellesMatchContext";

export function useParcellesMatchStore() {
  const context = useContext(ParcellesMatchContext);
  if (!context) {
    throw new Error("[PARCELLES_MATCH_CONTEXT_MISSING] useParcellesMatchStore doit être utilisé dans ParcellesMatchProvider.");
  }
  return context;
}
