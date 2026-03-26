import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface DeferredRenderProps {
  children: ReactNode;
  rootMargin?: string;
  idleMs?: number | null;
  minHeight?: CSSProperties["minHeight"];
  className?: string;
  onRender?: () => void;
}

export function DeferredRender({
  children,
  rootMargin = "500px 0px",
  idleMs = null,
  minHeight,
  className,
  onRender,
}: DeferredRenderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasNotifiedRenderRef = useRef(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (!shouldRender || !onRender || hasNotifiedRenderRef.current) return;
    hasNotifiedRenderRef.current = true;
    onRender();
  }, [onRender, shouldRender]);

  useEffect(() => {
    if (shouldRender) return;

    if (typeof idleMs === "number") {
      if (idleMs <= 0) {
        setShouldRender(true);
        return;
      }

      const requestIdle =
        typeof window !== "undefined" && "requestIdleCallback" in window
          ? window.requestIdleCallback.bind(window)
          : null;
      const cancelIdle =
        typeof window !== "undefined" && "cancelIdleCallback" in window
          ? window.cancelIdleCallback.bind(window)
          : null;

      let idleHandle: number | null = null;
      const reveal = () => {
        if (requestIdle && cancelIdle) {
          idleHandle = requestIdle(() => setShouldRender(true), { timeout: 1000 });
          return;
        }
        setShouldRender(true);
      };

      const timer = window.setTimeout(reveal, idleMs);
      return () => {
        window.clearTimeout(timer);
        if (idleHandle !== null && cancelIdle) {
          cancelIdle(idleHandle);
        }
      };
    }

    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [idleMs, rootMargin, shouldRender]);

  return (
    <div ref={containerRef} className={className} style={minHeight ? { minHeight } : undefined}>
      {shouldRender ? children : null}
    </div>
  );
}
