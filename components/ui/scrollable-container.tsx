"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ScrollableContainerProps {
  children: React.ReactNode;
  className?: string;
  scrollAmount?: number;
}

export function ScrollableContainer({
  children,
  className,
  scrollAmount = 300,
}: ScrollableContainerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // ドラッグ用 refs（再レンダリング不要）
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);
  const hasMoved = useRef(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const tolerance = 1;
    setCanScrollLeft(el.scrollLeft > tolerance);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - tolerance);
  }, []);

  // 初期化 + ResizeObserver
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();

    const observer = new ResizeObserver(() => {
      updateScrollState();
    });
    observer.observe(el);
    if (el.firstElementChild) {
      observer.observe(el.firstElementChild);
    }
    return () => observer.disconnect();
  }, [updateScrollState]);

  // スクロールイベント
  const handleScroll = useCallback(() => {
    requestAnimationFrame(updateScrollState);
  }, [updateScrollState]);

  // 矢印クリック
  const scrollByAmount = (direction: "left" | "right") => {
    scrollRef.current?.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  // ドラッグ開始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    // スクロール不要な場合はドラッグ無効
    if (el.scrollWidth <= el.clientWidth) return;
    isDragging.current = true;
    hasMoved.current = false;
    startX.current = e.pageX;
    scrollLeftStart.current = el.scrollLeft;
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }, []);

  // ドラッグ中・終了（document に付与）
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const el = scrollRef.current;
      if (!el) return;
      const dx = e.pageX - startX.current;
      if (Math.abs(dx) > 3) hasMoved.current = true;
      el.scrollLeft = scrollLeftStart.current - dx;
      e.preventDefault();
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      const el = scrollRef.current;
      if (el) {
        el.style.cursor = "";
        el.style.userSelect = "";
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const isScrollable = canScrollLeft || canScrollRight;

  return (
    <div className={cn("relative", className)}>
      {/* スクロール領域 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onMouseDown={handleMouseDown}
        className={cn(
          "overflow-x-auto",
          isScrollable && "cursor-grab",
          // スクロールバー非表示
          "[&::-webkit-scrollbar]:hidden",
        )}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        {children}
      </div>

      {/* 左矢印 */}
      <div
        className={cn(
          "print:hidden absolute left-0 top-0 bottom-0 z-10 flex items-center",
          "pointer-events-none transition-opacity duration-200",
          canScrollLeft ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="pointer-events-auto pl-1">
          <button
            type="button"
            onClick={() => scrollByAmount("left")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/50 shadow-sm border border-gray-200/50 hover:bg-white/80 transition-colors"
            aria-label="左にスクロール"
          >
            <ChevronLeft className="h-5 w-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* 右矢印 */}
      <div
        className={cn(
          "print:hidden absolute right-0 top-0 bottom-0 z-10 flex items-center",
          "pointer-events-none transition-opacity duration-200",
          canScrollRight ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="pointer-events-auto pr-1">
          <button
            type="button"
            onClick={() => scrollByAmount("right")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/50 shadow-sm border border-gray-200/50 hover:bg-white/80 transition-colors"
            aria-label="右にスクロール"
          >
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* 左グラデーション */}
      <div
        className={cn(
          "print:hidden absolute left-0 top-0 bottom-0 w-8 pointer-events-none",
          "bg-gradient-to-r from-white/40 to-transparent",
          "transition-opacity duration-200",
          canScrollLeft ? "opacity-100" : "opacity-0",
        )}
      />

      {/* 右グラデーション */}
      <div
        className={cn(
          "print:hidden absolute right-0 top-0 bottom-0 w-8 pointer-events-none",
          "bg-gradient-to-l from-white/40 to-transparent",
          "transition-opacity duration-200",
          canScrollRight ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
