/**
 * 对端运行锁（docs/07 §5）：行内「在 X 设备运行中」徽标与接管入口的数据源。
 * 刷新时机：scheduler 每 60 秒 + sync-done 事件后。
 */
import { useSyncExternalStore } from "react";
import { data, type RemoteLock } from "../api/data";

let locks: RemoteLock[] = [];
const listeners = new Set<() => void>();

export function refreshLocks() {
  void data
    .syncLocks()
    .then((l) => {
      locks = l;
      listeners.forEach((f) => f());
    })
    .catch(() => {}); // 未配置/离线静默
}

export function useLocks(): RemoteLock[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => locks,
  );
}

/** 按进程 uuid 找对端锁；fresh=false 表示 TTL 已过（「可能仍在运行」） */
export function lockFor(locks: RemoteLock[], uuid: string | null | undefined): { lock: RemoteLock; fresh: boolean } | null {
  if (!uuid) return null;
  const lock = locks.find((l) => l.process_uuid === uuid);
  if (!lock) return null;
  return { lock, fresh: Date.now() - lock.written_at < lock.ttl_ms };
}
