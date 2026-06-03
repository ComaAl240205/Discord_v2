import { LogOut, Plus, Settings } from "lucide-react";
import { useAppStore } from "../store";
import { API_URL } from "../api";

function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

export function ServerSidebar() {
  const logout = useAppStore((s) => s.logout);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const setCreateServerOpen = useAppStore((s) => s.setCreateServerOpen);

  const user = useAppStore((s) => s.user);

  const servers = useAppStore((s) => s.servers);
  const activeServerId = useAppStore((s) => s.activeServerId);
  const selectServer = useAppStore((s) => s.selectServer);

  return (
    <aside className="server-sidebar">
      <button
        className={"server-logo " + (activeServerId === null ? "active" : "")}
        title="Direktnachrichten"
        onClick={() => void selectServer(null)}
      >
        {user?.username.slice(0, 1).toUpperCase() ?? "D"}
      </button>

      <div className="server-divider" />

      {servers.map((s) => {
        const avatar = assetUrl(s.avatar_url ?? null);

        return (
          <button
            key={s.id}
            className={"server-icon " + (activeServerId === s.id ? "active" : "")}
            title={s.name}
            onClick={() => void selectServer(s.id)}
          >
            {avatar ? (
              <img src={avatar} alt="server" style={{ width: 28, height: 28, borderRadius: 10, objectFit: "cover" }} />
            ) : (
              s.name.slice(0, 2).toUpperCase()
            )}
          </button>
        );
      })}

      <button
        className="server-icon"
        title="Server erstellen"
        onClick={() => setCreateServerOpen(true)}
      >
        <Plus size={22} />
      </button>

      <div className="server-spacer" />

      <button
        className="server-icon"
        title="Einstellungen"
        onClick={() => setSettingsOpen(true)}
      >
        <Settings size={18} />
      </button>

      <button className="server-icon logout" onClick={logout}>
        <LogOut size={18} />
      </button>
    </aside>
  );
}