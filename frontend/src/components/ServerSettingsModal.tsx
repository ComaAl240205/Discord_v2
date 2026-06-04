import { useEffect, useMemo, useState } from "react";
import { Camera, Trash2, X } from "lucide-react";
import { useAppStore } from "../store";
import { useServerStore } from "../store_2";
import { API_URL } from "../api";

type ServerSettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

export function ServerSettingsModal({
  open,
  onClose
}: ServerSettingsModalProps) {
  const user = useAppStore((s) => s.user);

  const activeServerId = useServerStore((s) => s.activeServerId);
  const serverDetail = useServerStore((s) => s.serverDetail);
  const updateServerSettings = useServerStore((s) => s.updateServerSettings);
  const uploadServerSettingsAvatar = useServerStore(
    (s) => s.uploadServerSettingsAvatar
  );
  const deleteActiveServer = useServerStore((s) => s.deleteActiveServer);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!serverDetail) return;

    setName(serverDetail.name ?? "");
    setDesc(serverDetail.description ?? "");
    setLocalError(null);
  }, [open, serverDetail]);

  const avatar = assetUrl(serverDetail?.avatar_url ?? null);

  const myRole = useMemo(() => {
    if (!user || !serverDetail) return "member";

    const member = serverDetail.members.find((x) => x.user_id === user.id);
    return member?.role ?? "member";
  }, [user, serverDetail]);

  const canEdit = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  if (!open || !activeServerId || !serverDetail) return null;

  async function save() {
    const serverId = activeServerId;

    if (!serverId) return;

    const cleanName = name.trim();

    if (!cleanName) {
      setLocalError("Servername fehlt");
      return;
    }

    setLocalError(null);

    try {
      setBusy(true);
      await updateServerSettings(serverId, cleanName, desc.trim());
      onClose();
    } catch (e: any) {
      setLocalError(e?.message ?? "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function onPickAvatar(file: File | null) {
    const serverId = activeServerId;

    if (!serverId) return;
    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg"];

    if (!allowedTypes.includes(file.type)) {
      setLocalError("Nur PNG/JPG erlaubt");
      return;
    }

    const maxSize = 2 * 1024 * 1024;

    if (file.size > maxSize) {
      setLocalError("Maximal 2MB erlaubt");
      return;
    }

    setLocalError(null);

    try {
      setBusy(true);
      await uploadServerSettingsAvatar(serverId, file);
    } catch (e: any) {
      setLocalError(e?.message ?? "Fehler");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    setLocalError(null);

    try {
      setBusy(true);
      await deleteActiveServer();
      onClose();
    } catch (e: any) {
      setLocalError(e?.message ?? "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <section
        className="create-server-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="create-server-header">
          <div className="create-server-title">
            <strong>Server Einstellungen</strong>

            <span>
              {canEdit ? "Owner/Admin" : "Mitglied"} ·{" "}
              {canEdit ? "Bearbeiten erlaubt" : "Nur lesen"}
            </span>
          </div>

          <button
            type="button"
            className="create-server-close"
            onClick={onClose}
            title="Schließen"
          >
            <X size={18} />
          </button>
        </header>

        <div className="create-server-divider" />

        <div className="create-server-top">
          <div className="server-avatar-preview">
            {avatar ? (
                <img src={avatar} alt="Server Avatar" />
            ) : (
              <span className="server-avatar-fallback">S</span>
            )}

            {canEdit && (
              <label
                className="server-avatar-pick"
                title="Serverbild ändern"
              >
                <Camera size={16} />

                <input
                  type="file"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          <div className="create-server-fields">
            <label htmlFor="serverSettingsName">Servername</label>

            <input
              id="serverSettingsName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit || busy}
              maxLength={80}
            />

            <label htmlFor="serverSettingsDesc">Beschreibung</label>

            <textarea
              id="serverSettingsDesc"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              disabled={!canEdit || busy}
              maxLength={280}
            />

            {localError && (
              <div className="create-server-error">{localError}</div>
            )}

            {canEdit && (
              <button
                type="button"
                className="create-server-submit"
                disabled={busy || !name.trim()}
                onClick={save}
              >
                {busy ? "Speichert..." : "Speichern"}
              </button>
            )}

            {isOwner && (
              <button
                type="button"
                className="server-danger-btn"
                disabled={busy}
                onClick={onDelete}
              >
                <Trash2 size={16} />
                Server löschen
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}