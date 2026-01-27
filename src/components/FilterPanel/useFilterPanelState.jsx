import { useEffect, useState } from "react";

// Lightweight global state singleton for the FilterPanel UI.
// Stored on window to avoid expensive tree rerenders when only dropdown/collapse UI changes.
// Provides subscription via an internal listeners Set so React hooks can re-render when state changes.

function createGlobalState() {
  const state = {
    openDropdown: null,
    collapsed: new Set(),
    _listeners: new Set(),
    _emit() {
      this._listeners.forEach((l) => {
        try {
          l();
        } catch (e) {
          // swallow listener errors to avoid breaking others
          // eslint-disable-next-line no-console
          console.error("filterPanelState listener error", e);
        }
      });
    },
    setOpenDropdown(value) {
      // support function updater or direct value
      const next = typeof value === "function" ? value(this.openDropdown) : value;
      if (this.openDropdown === next) return;
      this.openDropdown = next;
      this._emit();
    },
    toggleSection(id) {
      if (this.collapsed.has(id)) this.collapsed.delete(id);
      else this.collapsed.add(id);
      this._emit();
    },
  };
  return state;
}

function getGlobalState() {
  // keep name unique on window to avoid collisions
  if (!window.__filterPanelState) {
    window.__filterPanelState = createGlobalState();
  }
  return window.__filterPanelState;
}

export default function useFilterPanelState() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const state = getGlobalState();
    const listener = () => setTick((t) => t + 1);
    state._listeners.add(listener);
    return () => state._listeners.delete(listener);
  }, []);

  const state = getGlobalState();
  // return stable bound functions to be used by components
  return {
    openDropdown: state.openDropdown,
    setOpenDropdown: state.setOpenDropdown.bind(state),
    collapsed: state.collapsed,
    toggleSection: state.toggleSection.bind(state),
  };
}
