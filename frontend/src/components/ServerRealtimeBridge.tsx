import { useEffect } from "react";
import { useAppStore } from "../store";
import { useServerStore } from "../store_2";

export function ServerRealtimeBridge() {
  const user = useAppStore((s) => s.user);
  const token = useAppStore((s) => s.token);

  const loadServers = useServerStore((s) => s.loadServers);
  const startServerRealtime = useServerStore((s) => s.startServerRealtime);
  const stopServerRealtime = useServerStore((s) => s.stopServerRealtime);
  const resetServerStore = useServerStore((s) => s.resetServerStore);

  useEffect(() => {
    if (!user || !token) {
      stopServerRealtime();
      resetServerStore();
      return;
    }

    void loadServers();
    startServerRealtime();
  }, [
    user?.id,
    token,
    loadServers,
    startServerRealtime,
    stopServerRealtime,
    resetServerStore
  ]);

  return null;
}