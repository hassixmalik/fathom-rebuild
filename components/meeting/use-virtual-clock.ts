"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Playback clock with one surface for both cases:
 *  - no recording: a virtual clock (play/pause/seek/rate over a fixed duration);
 *  - a real <video>/<audio>: the element is the source of truth and this hook mirrors it.
 */
export function useVirtualClock(durationMs: number, initialMs = 0, media?: RefObject<HTMLMediaElement | null>) {
  const [currentMs, setCurrentMs] = useState(initialMs);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const anchor = useRef({ wall: 0, media: initialMs });
  const el = () => media?.current ?? null;

  // Real media: follow the element.
  useEffect(() => {
    const m = el();
    if (!m) return;
    m.currentTime = initialMs / 1000;
    const onTime = () => setCurrentMs(m.currentTime * 1000);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    m.addEventListener("timeupdate", onTime);
    m.addEventListener("seeked", onTime);
    m.addEventListener("play", onPlay);
    m.addEventListener("pause", onPause);
    m.addEventListener("ended", onPause);
    return () => {
      m.removeEventListener("timeupdate", onTime);
      m.removeEventListener("seeked", onTime);
      m.removeEventListener("play", onPlay);
      m.removeEventListener("pause", onPause);
      m.removeEventListener("ended", onPause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media]);

  useEffect(() => {
    const m = el();
    if (m) m.playbackRate = rate;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rate]);

  // Virtual clock: tick only when there is no media element.
  useEffect(() => {
    if (!playing || el()) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, rate, durationMs]);

  const seek = useCallback(
    (ms: number) => {
      const t = Math.min(Math.max(0, ms), durationMs);
      const m = el();
      if (m) m.currentTime = t / 1000;
      anchor.current = { wall: performance.now(), media: t };
      setCurrentMs(t);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [durationMs],
  );
  const toggle = useCallback(() => {
    const m = el();
    if (m) {
      if (m.paused) void m.play();
      else m.pause();
      return;
    }
    setPlaying((p) => {
      if (!p && anchor.current.media >= durationMs) anchor.current.media = 0;
      return !p;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  return { currentMs, playing, rate, setRate, seek, toggle };
}
