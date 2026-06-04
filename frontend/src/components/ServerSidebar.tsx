import { LogOut, Plus, Settings } from "lucide-react";
import { useAppStore } from "../store";
import { useServerStore } from "../store_2";
import { API_URL } from "../api";

function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

export function ServerSidebar({ onDmClick }: { onDmClick?: () => void }) {
  const logout = useAppStore((s) => s.logout);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const user = useAppStore((s) => s.user);

  const servers = useServerStore((s) => s.servers);
  const activeServerId = useServerStore((s) => s.activeServerId);
  const selectServer = useServerStore((s) => s.selectServer);
  const setCreateServerOpen = useServerStore((s) => s.setCreateServerOpen);
  const resetServerStore = useServerStore((s) => s.resetServerStore);

  function handleLogout() {
    resetServerStore();
    logout();
  }

  function handleDmClick() {
    void selectServer(null);
    onDmClick?.();
  }

  function handleServerClick(serverId: number) {
    void selectServer(serverId);
    onDmClick?.();
  }

  return (
    <aside className="server-sidebar">
      <button
        className={"server-logo " + (activeServerId === null ? "active" : "")}
        title="Direktnachrichten"
        onClick={handleDmClick}
      >
        {user?.username.slice(0, 1).toUpperCase() ?? "D"}
      </button>

      <div className="server-divider" />

      {servers.map((server) => {
        const avatar = assetUrl(server.avatar_url ?? null);

        return (
          <button
            key={server.id}
            className={
              "server-icon " + (activeServerId === server.id ? "active" : "")
            }
            title={server.name}
            onClick={() => handleServerClick(server.id)}
          >
            {avatar ? (
              <img
                src={avatar}
                alt="server"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 10,
                  objectFit: "cover"
                }}
              />
            ) : (
              server.name.slice(0, 2).toUpperCase()
            )}
          </button>
        );
      })}

      <button
        className="server-icon"
        title="Server erstellen"
        onClick={() => setCreateServerOpen(true)}
      >
        <Plus size={20} />
      </button>

      <div className="server-spacer" />

      <button
        className="server-icon"
        title="Einstellungen"
        onClick={() => setSettingsOpen(true)}
      >
        <Settings size={20} />
      </button>

      <button className="server-icon logout" onClick={handleLogout} title="Abmelden">
        <LogOut size={20} />
      </button>
    </aside>
  );
}