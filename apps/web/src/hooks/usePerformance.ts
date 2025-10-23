'use client';

import { useEffect, useState, useCallback } from 'react';

interface PerformanceMetrics {
  ttfb: number; // Time to First Byte
  tti: number;   // Time to Interactive
  cls: number;   // Cumulative Layout Shift
  fcp: number;   // First Contentful Paint
  lcp: number;   // Largest Contentful Paint
  fid: number;   // First Input Delay
}

interface PerformanceEntry {
  name: string;
  startTime: number;
  duration: number;
  type: string;
}

export function usePerformanceMonitoring() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    ttfb: 0,
    tti: 0,
    cls: 0,
    fcp: 0,
    lcp: 0,
    fid: 0,
  });
  const [isMonitoring, setIsMonitoring] = useState(false);

  const measurePerformance = useCallback(() => {
    if (typeof window === 'undefined' || !window.performance) return;

    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paintEntries = performance.getEntriesByType('paint');
    
    // Time to First Byte
    const ttfb = navigation.responseStart - navigation.requestStart;
    
    // First Contentful Paint
    const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
    const fcp = fcpEntry ? fcpEntry.startTime : 0;
    
    // Largest Contentful Paint (simplified)
    const lcp = navigation.loadEventEnd - navigation.navigationStart;
    
    // Time to Interactive (simplified)
    const tti = navigation.domInteractive - navigation.navigationStart;
    
    // First Input Delay (simplified)
    const fid = navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart;
    
    // Cumulative Layout Shift (simplified - would need more complex implementation)
    const cls = 0; // This would require observing layout shifts

    setMetrics({
      ttfb,
      tti,
      cls,
      fcp,
      lcp,
      fid,
    });
  }, []);

  const startMonitoring = useCallback(() => {
    setIsMonitoring(true);
    
    // Measure initial performance
    measurePerformance();
    
    // Set up observer for layout shifts (simplified)
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (entry.entryType === 'largest-contentful-paint') {
              setMetrics(prev => ({
                ...prev,
                lcp: entry.startTime,
              }));
            }
          });
        });
        
        observer.observe({ entryTypes: ['largest-contentful-paint'] });
        
        return () => observer.disconnect();
      } catch (error) {
        console.warn('Performance monitoring not fully supported:', error);
      }
    }
  }, [measurePerformance]);

  const logLongTask = useCallback((task: PerformanceEntry) => {
    if (task.duration > 50) { // Log tasks longer than 50ms
      console.warn(`Long task detected: ${task.name} took ${task.duration}ms`);
    }
  }, []);

  useEffect(() => {
    if (isMonitoring) {
      startMonitoring();
    }
  }, [isMonitoring, startMonitoring]);

  return {
    metrics,
    isMonitoring,
    startMonitoring,
    logLongTask,
  };
}

// Hook for measuring component render performance
export function useRenderPerformance(componentName: string) {
  const [renderTime, setRenderTime] = useState(0);
  const [renderCount, setRenderCount] = useState(0);

  useEffect(() => {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      setRenderTime(duration);
      setRenderCount(prev => prev + 1);
      
      if (duration > 16) { // Log renders longer than 16ms (60fps threshold)
        console.warn(`Slow render in ${componentName}: ${duration.toFixed(2)}ms`);
      }
    };
  });

  return { renderTime, renderCount };
}

// Hook for lazy loading with intersection observer
export function useLazyLoad(ref: React.RefObject<HTMLElement>, options?: IntersectionObserverInit) {
  const [isVisible, setIsVisible] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasLoaded) {
          setIsVisible(true);
          setHasLoaded(true);
          observer.disconnect();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
        ...options,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref, hasLoaded, options]);

  return { isVisible, hasLoaded };
}

// Hook for debounced values (performance optimization)
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Hook for throttled callbacks (performance optimization)
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const [lastCall, setLastCall] = useState(0);

  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        setLastCall(now);
        return callback(...args);
      }
    }) as T,
    [callback, delay, lastCall]
  );
}
