import { useRef, useCallback, useEffect } from "react";

export function useChessAudio() {
  const moveAudioRef = useRef<HTMLAudioElement | null>(null);
  const captureAudioRef = useRef<HTMLAudioElement | null>(null);
  const tickAudioRef = useRef<HTMLAudioElement | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTickingRef = useRef(false);

  // Pre-load audio elements
  useEffect(() => {
    moveAudioRef.current = new Audio("/assets/piece-move.mp3");
    captureAudioRef.current = new Audio("/assets/piece-capture.mp3");
    tickAudioRef.current = new Audio("/assets/fast-tick.mp3");

    // Pre-load
    moveAudioRef.current.load();
    captureAudioRef.current.load();
    tickAudioRef.current.load();

    return () => {
      stopTicking();
    };
  }, []);

  const playMove = useCallback(() => {
    if (moveAudioRef.current) {
      moveAudioRef.current.currentTime = 0;
      moveAudioRef.current.play().catch(() => {});
    }
  }, []);

  const playCapture = useCallback(() => {
    if (captureAudioRef.current) {
      captureAudioRef.current.currentTime = 0;
      captureAudioRef.current.play().catch(() => {});
    }
  }, []);

  const startTicking = useCallback(() => {
    if (isTickingRef.current) return; // Already ticking
    isTickingRef.current = true;

    // Play immediately once
    if (tickAudioRef.current) {
      tickAudioRef.current.currentTime = 0;
      tickAudioRef.current.play().catch(() => {});
    }

    // Then repeat every second
    tickIntervalRef.current = setInterval(() => {
      if (tickAudioRef.current) {
        tickAudioRef.current.currentTime = 0;
        tickAudioRef.current.play().catch(() => {});
      }
    }, 1000);
  }, []);

  const stopTicking = useCallback(() => {
    isTickingRef.current = false;
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  return { playMove, playCapture, startTicking, stopTicking };
}