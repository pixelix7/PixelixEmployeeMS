import { useEffect, useRef } from "react";

// Things that the Android back button should close before it navigates
// (open dialogs, the mobile menu). Last opened = first closed.
const stack = [];

// Close the top-most open thing. Returns false if nothing was open.
export const closeTopLayer = () => {
  const top = stack.at(-1);
  if (!top) return false;
  top.current();
  return true;
};

// While `active`, a back press calls `onBack` instead of leaving the page
export function useBackHandler(active, onBack) {
  const ref = useRef(onBack);
  useEffect(() => {
    ref.current = onBack;
  });
  useEffect(() => {
    if (!active) return;
    const entry = ref;
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [active]);
}
