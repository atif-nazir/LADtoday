import { useEffect, useRef } from "react";

// Custom hook for auto-scrolling horizontal carousels with wheel support
export function useCarouselScroll(itemsCount: number, direction: 'left' | 'right' = 'left') {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container || itemsCount === 0) return;

    let animationId: number;
    const scrollSpeed = 0.5;
    let isPaused = false;

    // Reset scroll position for 'right' direction so it doesn't hit 0 immediately
    if (direction === 'right') {
      container.scrollLeft = container.scrollWidth / 2;
    }

    const scroll = () => {
      if (!isPaused && container) {
        if (direction === 'left') {
          container.scrollLeft += scrollSpeed;
          if (container.scrollLeft >= container.scrollWidth / 2) {
            container.scrollLeft = 0;
          }
        } else {
          container.scrollLeft -= scrollSpeed;
          if (container.scrollLeft <= 0) {
            container.scrollLeft = container.scrollWidth / 2;
          }
        }
      }
      animationId = requestAnimationFrame(scroll);
    };

    const pause = () => { isPaused = true; };
    const resume = () => { isPaused = false; };

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener("mouseenter", pause);
    container.addEventListener("mouseleave", resume);
    container.addEventListener("touchstart", pause);
    container.addEventListener("touchend", resume);
    container.addEventListener("wheel", handleWheel, { passive: false });

    animationId = requestAnimationFrame(scroll);

    return () => {
      cancelAnimationFrame(animationId);
      container.removeEventListener("mouseenter", pause);
      container.removeEventListener("mouseleave", resume);
      container.removeEventListener("touchstart", pause);
      container.removeEventListener("touchend", resume);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [itemsCount, direction]);

  return scrollRef;
}
