import React, { useState, useEffect, useRef, useCallback } from "react";

interface ScrollPickerProps {
  items: string[];
  defaultIndex?: number;
  onUpdate: (value: string) => void;
}

const ITEM_HEIGHT = 50; // Corresponds to h-[50px]
const VISIBLE_ITEMS_OFFSET = 2; // Extra items rendered for smooth scrolling illusion

const ScrollPicker: React.FC<ScrollPickerProps> = ({
  items,
  defaultIndex = 0,
  onUpdate,
}) => {
  const [currentIndex, setCurrentIndex] = useState(defaultIndex);
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Touch handling state
  const touchStartY = useRef<number>(0);
  const touchCurrentY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);
  const lastUpdateTime = useRef<number>(0);
  const velocityY = useRef<number>(0);
  const lastTouchY = useRef<number>(0);
  const lastTouchTime = useRef<number>(0);

  const updatePosition = useCallback(
    (animate: boolean) => {
      if (!scrollRef.current) return;
      const centerOffset = 95; // Adjusted to center the active item perfectly
      const translateY =
        centerOffset - (currentIndex + VISIBLE_ITEMS_OFFSET) * ITEM_HEIGHT;

      // Use transform3d for hardware acceleration
      scrollRef.current.style.transition = animate
        ? "transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)"
        : "none";
      scrollRef.current.style.transform = `translate3d(0, ${translateY}px, 0)`;
      scrollRef.current.style.willChange = "transform";
    },
    [currentIndex]
  );

  useEffect(() => {
    updatePosition(true);
  }, [currentIndex, updatePosition]);

  useEffect(() => {
    // Debounce the update to avoid too many re-renders
    const timeoutId = setTimeout(() => {
      onUpdate(items[currentIndex]);
    }, 100); // Increased debounce time for better performance
    return () => clearTimeout(timeoutId);
  }, [currentIndex, items, onUpdate]);

  // Touch event handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    isDragging.current = true;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    lastTouchY.current = e.touches[0].clientY;
    lastTouchTime.current = new Date().getTime();
    velocityY.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    e.stopPropagation();

    const currentY = e.touches[0].clientY;
    const currentTime = new Date().getTime();
    const deltaY = currentY - touchCurrentY.current;
    const deltaTime = currentTime - lastTouchTime.current;

    // Calculate velocity for momentum
    if (deltaTime > 0) {
      velocityY.current = (currentY - lastTouchY.current) / deltaTime;
    }

    lastTouchY.current = currentY;
    lastTouchTime.current = currentTime;

    // Throttle updates for better performance
    const now = new Date().getTime();
    if (now - lastUpdateTime.current > 50) {
      const itemsDelta = -Math.round(deltaY / ITEM_HEIGHT);
      if (itemsDelta !== 0) {
        const newIndex = Math.max(
          0,
          Math.min(items.length - 1, currentIndex + itemsDelta)
        );
        if (newIndex !== currentIndex) {
          setCurrentIndex(newIndex);
          touchCurrentY.current = currentY;
        }
      }
      lastUpdateTime.current = now;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    e.stopPropagation();
    isDragging.current = false;

    // Apply momentum scrolling based on velocity
    const momentum = Math.round(velocityY.current * -5); // Adjust multiplier for sensitivity
    if (Math.abs(momentum) > 0) {
      const newIndex = Math.max(
        0,
        Math.min(items.length - 1, currentIndex + momentum)
      );
      setCurrentIndex(newIndex);
    }

    velocityY.current = 0;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = Math.abs(e.deltaY) > 50 ? (e.deltaY > 0 ? 1 : -1) : 0;
    if (delta !== 0) {
      setCurrentIndex((prev) =>
        Math.max(0, Math.min(items.length - 1, prev + delta))
      );
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full md:w-[100px] h-[240px] relative overflow-hidden bg-[#f1f3f5] rounded-xl cursor-pointer select-none touch-none"
      onWheel={onWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: "none" }}
    >
      <div
        className="absolute left-1 right-1 h-[50px] bg-black/5 border-t border-b border-line rounded-lg pointer-events-none z-10"
        style={{ top: "calc(50% - 25px + 3px)" }}
      ></div>
      <div ref={scrollRef} className="absolute w-full left-0 right-0">
        {Array.from({ length: VISIBLE_ITEMS_OFFSET }).map((_, i) => (
          <div key={`pad-start-${i}`} className="h-[50px] w-full"></div>
        ))}
        {items.map((item, index) => (
          <div
            key={item}
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex(index);
            }}
            className={`h-[50px] w-full flex items-center justify-center text-2xl transition-colors duration-150 select-none cursor-pointer hover:bg-black/5 ${currentIndex === index ? "text-brand font-extrabold text-[34px]" : "text-muted font-bold"}`}
            style={{ lineHeight: "50px" }}
          >
            {item}
          </div>
        ))}
        {Array.from({ length: VISIBLE_ITEMS_OFFSET }).map((_, i) => (
          <div key={`pad-end-${i}`} className="h-[50px] w-full"></div>
        ))}
      </div>
    </div>
  );
};

export default ScrollPicker;
