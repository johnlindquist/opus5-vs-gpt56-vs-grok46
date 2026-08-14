"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  value: number | null;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  fallback?: string;
  className?: string;
}

export function AnimatedNumber({
  value,
  decimals = 1,
  duration = 450,
  prefix = "",
  suffix = "",
  fallback = "—",
  className = "",
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState<number | null>(value);
  const prevValueRef = useRef<number | null>(value);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (value === null || typeof value !== "number" || isNaN(value)) {
      setDisplayValue(null);
      prevValueRef.current = null;
      return;
    }

    const startValue = prevValueRef.current ?? value;
    const endValue = value;
    prevValueRef.current = endValue;

    if (startValue === endValue) {
      setDisplayValue(endValue);
      return;
    }

    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);

      // Ease-out cubic curve
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * ease;

      setDisplayValue(current);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, duration]);

  if (displayValue === null) {
    return <span className={className}>{fallback}</span>;
  }

  const formatted = displayValue.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
