"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Stand-in for a media element: play/pause/seek/rate over a fixed duration.
 * Exposes the same surface a <video> adapter would, so real media can replace it later.
 */
export function useVirtualClock(durationMs: number, initialMs = 0) {
  const [currentMs, setCurrentMs] = useState(initialMs);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const anchor = useRef({ wall: 0, media: initialMs });

  useEffect(() => {
    if (!playing) return;
    anchor.current = { wall: performance.now(), media: anchor.current.media };
    const id = window.setInterval(() => {
      const t = anchor.current.media + (performance.now() - anchor.current.wall) * rate;
      if (t >= durationMs) {
        anchor.current.media = durationMs;
        setCurrentMs(durationMs);
        setPlaying(false);
      } else setCurrentMs(t);
    }, 100);
    return () => {
      anchor.current.media += (performance.now() - anchor.current.wall) * rate;
      window.clearInterval(id);
    };
  }, [playing, rate, durationMs]);

  const seek = useCallback(
    (ms: number) => {
      const t = Math.min(Math.max(0, ms), durationMs);
      anchor.current = { wall: performance.now(), media: t };
      setCurrentMs(t);
    },
    [durationMs],
  );
  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p && anchor.current.media >= durationMs) anchor.current.media = 0;
      return !p;
    });
  }, [durationMs]);

  return { currentMs, playing, rate, setRate, seek, toggle, play: () => setPlaying(true) };
}
