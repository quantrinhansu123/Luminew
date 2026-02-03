// src/components/filter-panel/CollapsibleSection.jsx
import React, { memo } from "react";
import Icon from "./Icon";
import useFilterPanelState from "./useFilterPanelState";

const CollapsibleSection = memo(({ id, title, icon, children, defaultOpen = true }) => {
  const { collapsed, toggleSection } = useFilterPanelState();
  const isOpen = !collapsed.has(id);

  return (
    <div className="mb-4">
      <button
        onClick={() => toggleSection(id)}
        className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all duration-200 group"
      >
        <div className="flex items-center gap-3">
          <Icon>{icon}</Icon>
          <span className="font-semibold text-gray-800 text-sm">{title}</span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 group-hover:text-green-500 transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="mt-3 space-y-3 px-1 relative">{children}</div>}
    </div>
  );
});

export default CollapsibleSection;