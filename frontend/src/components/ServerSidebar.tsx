import { LogOut, Plus, Settings } from "lucide-react";
import { useAppStore } from "../store";

export function ServerSidebar() {
  const logout = useAppStore((s) => s.logout);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const user = useAppStore((s) => s.user);

  return (
    <aside className="server-sidebar">
      {/* Direktnachrichten */}
      <button className="server-logo" title="Direktnachrichten">
        {user?.username.slice(0, 1).toUpperCase() ?? "D"}
      </button>

      <div className="server-divider" />

      {/* Plus Button */}
      <button
        className="server-icon"
        title="Server erstellen / Leute einladen"
        onClick={() => alert("Server / Invite kommt als nächstes 👀")}
      >
        <Plus size={22} />
      </button>

      <div className="server-spacer" />

      {/* Settings */}
      <button
        className="server-icon"
        title="Einstellungen"
        onClick={() => setSettingsOpen(true)}
      >
        <Settings size={18} />
      </button>

      {/* Logout */}
      <button className="server-icon logout" onClick={logout}>
        <LogOut size={18} />
      </button>
    </aside>
  );
}