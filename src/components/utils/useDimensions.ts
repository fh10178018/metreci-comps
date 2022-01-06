// 用来实时监听元素宽高变化

import { useState, useRef, RefObject, useEffect, useCallback } from "react";

export function useLatest<T>(val: T): RefObject<T> {
  const ref = useRef(val);
  ref.current = val;
  return ref;
}

export const observerErr =
  "💡 react-cool-dimensions: the browser doesn't support Resize Observer, please use polyfill: https://github.com/wellyshen/react-cool-dimensions#resizeobserver-polyfill";
export const borderBoxWarn =
  "💡 react-cool-dimensions: the browser doesn't support border-box size, fallback to content-box size. Please see: https://github.com/wellyshen/react-cool-dimensions#border-box-size-measurement";

interface State {
  readonly currentBreakpoint: string;
  readonly width: number;
  readonly height: number;
  readonly entry?: ResizeObserverEntry;
}
interface Observe<T> {
  (element?: T | null): void;
}
interface Event<T> extends State {
  readonly entry: ResizeObserverEntry;
  observe: Observe<T>;
  unobserve: () => void;
}
interface OnResize<T> {
  (event: Event<T>): void;
}
interface ShouldUpdate {
  (state: State): boolean;
}
type Breakpoints = Record<string, number>;
export interface Options<T> {
  useBorderBoxSize?: boolean;
  breakpoints?: Breakpoints;
  updateOnBreakpointChange?: boolean;
  shouldUpdate?: ShouldUpdate;
  onResize?: OnResize<T>;
  polyfill?: any;
}
interface Return<T> extends Omit<Event<T>, "entry"> {
  entry?: ResizeObserverEntry;
}

const getCurrentBreakpoint = (bps: Breakpoints, w: number): string => {
  let curBp = "";
  let max = -1;

  Object.keys(bps).forEach((key: string) => {
    const val = bps[key];

    if (w >= val && val > max) {
      curBp = key;
      max = val;
    }
  });

  return curBp;
};

const useDimensions = <T extends HTMLElement | null>({
  useBorderBoxSize,
  breakpoints,
  updateOnBreakpointChange,
  shouldUpdate,
  onResize,
  polyfill,
}: Options<T> = {}): Return<T> => {
  const [state, setState] = useState<State>({
    currentBreakpoint: "",
    width: 0,
    height: 0,
  });
  const prevSizeRef = useRef<{ width?: number; height?: number }>({});
  const prevBreakpointRef = useRef<string>();
  const observerRef = useRef<ResizeObserver>();
  const warnedRef = useRef(false);
  const ref = useRef<T>();
  const onResizeRef = useLatest<OnResize<T> | undefined>(onResize);
  const shouldUpdateRef = useLatest<ShouldUpdate | undefined>(shouldUpdate);

  const unobserve = useCallback(() => {
    if (observerRef.current) observerRef.current.disconnect();
  }, []);

  const observe = useCallback<Observe<T>>(
    (element) => {
      if (element && element !== ref.current) {
        unobserve();
        ref.current = element;
      }
      if (observerRef.current && ref.current)
        observerRef.current.observe(ref.current as HTMLElement);
    },
    [unobserve]
  );

  useEffect(() => {
    if (
      (!("ResizeObserver" in window) || !("ResizeObserverEntry" in window)) &&
      !polyfill
    ) {
      console.error(observerErr);
      return () => null;
    }

    let raf: number | null = null;

    observerRef.current = new (polyfill || ResizeObserver)(([entry]: any) => {
      raf = requestAnimationFrame(() => {
        const { contentBoxSize, borderBoxSize, contentRect } = entry;

        let boxSize = contentBoxSize;
        if (useBorderBoxSize)
          if (borderBoxSize) {
            boxSize = borderBoxSize;
          } else if (!warnedRef.current) {
            console.warn(borderBoxWarn);
            warnedRef.current = true;
          }
        // @juggle/resize-observer polyfill has different data structure
        boxSize = Array.isArray(boxSize) ? boxSize[0] : boxSize;

        const width = boxSize ? boxSize.inlineSize : contentRect.width;
        const height = boxSize ? boxSize.blockSize : contentRect.height;

        if (
          width === prevSizeRef.current.width &&
          height === prevSizeRef.current.height
        )
          return;

        prevSizeRef.current = { width, height };

        const e = {
          currentBreakpoint: "",
          width,
          height,
          entry,
          observe,
          unobserve,
        };

        if (breakpoints) {
          e.currentBreakpoint = getCurrentBreakpoint(breakpoints, width);

          if (e.currentBreakpoint !== prevBreakpointRef.current) {
            if (onResizeRef.current) onResizeRef.current(e);
            prevBreakpointRef.current = e.currentBreakpoint;
          }
        } else if (onResizeRef.current) {
          onResizeRef.current(e);
        }

        const next = {
          currentBreakpoint: e.currentBreakpoint,
          width,
          height,
          entry,
        };

        if (shouldUpdateRef.current && !shouldUpdateRef.current(next)) return;

        if (
          !shouldUpdateRef.current &&
          breakpoints &&
          updateOnBreakpointChange
        ) {
          setState((prev) =>
            prev.currentBreakpoint !== next.currentBreakpoint ? next : prev
          );
          return;
        }

        setState(next);
      });
    });

    observe();

    return () => {
      unobserve();
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(breakpoints),
    useBorderBoxSize,
    observe,
    unobserve,
    updateOnBreakpointChange,
  ]);

  return { ...state, observe, unobserve };
};

export default useDimensions;
