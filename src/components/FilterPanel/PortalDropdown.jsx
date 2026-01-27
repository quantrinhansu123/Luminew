import React, { memo, useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

// Portal Dropdown - Tối ưu hiệu suất
const PortalDropdown = memo(({ open, anchorRef, onClose, children }) => {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [flipped, setFlipped] = useState(false);
  const menuRef = useRef(null);
  const rafRef = useRef(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef?.current;
    if (!anchor || !open) return;

    const rect = anchor.getBoundingClientRect();
    const menu = menuRef.current;
    const menuHeight = menu?.offsetHeight || 224; // 14rem ~ 224px
    const menuWidth = menu?.offsetWidth || rect.width;
    const gap = 8;
    const viewportPadding = 8;

    let top = rect.bottom + gap;
    let isFlipped = false;

    if (top + menuHeight > window.innerHeight - viewportPadding) {
      top = rect.top - menuHeight - gap;
      isFlipped = true;
    }

    let left = rect.left;
    if (left + menuWidth > window.innerWidth - viewportPadding) {
      left = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
    }

    setPos({ top, left, width: rect.width });
    setFlipped(isFlipped);
  }, [anchorRef, open]);

  useEffect(() => {
    if (!open) return;

    const handleResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updatePosition);
    };

    updatePosition();
    window.addEventListener("resize", handleResize, { passive: true });
    window.addEventListener("scroll", handleResize, { passive: true, capture: true });

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, { capture: true });
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (
        anchorRef.current?.contains(e.target) ||
        menuRef.current?.contains(e.target)
      )
        return;
      onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed z-[9999] pointer-events-auto"
      style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
    >
      <div
        ref={menuRef}
        className={`bg-white border border-gray-200 rounded-xl shadow-xl max-h-56 overflow-y-auto p-3 transition-all duration-150 ease-out ${
          open ? "opacity-100 scale-100" : "opacity-0 scale-95"
        } ${flipped ? "-translate-y-1" : "translate-y-1"}`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
});

export default PortalDropdown;