import { useEffect, useRef, useState } from "react";

/**
 * 出场动效挂载器（2026-09-22）：open 翻 false 后保持挂载 ms 毫秒并置 exiting=true，
 * 让 CSS 播反场再卸载；open 回 true 立即复位（连打不残影）。
 * 反场统一快于进场（--dur-fast 量级）——快而不催。
 */
export function useExiting(open: boolean, ms = 140): { mounted: boolean; exiting: boolean } {
  const [st, setSt] = useState({ mounted: open, exiting: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setSt({ mounted: true, exiting: false });
    } else {
      setSt((s) => (s.mounted && !s.exiting ? { mounted: true, exiting: true } : s));
      timer.current = setTimeout(() => {
        timer.current = null;
        setSt({ mounted: false, exiting: false });
      }, ms);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open, ms]);

  return st;
}
