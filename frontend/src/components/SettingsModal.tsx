import { useEffect, useState } from "react";
import { X, Camera } from "lucide-react";
import { useAppStore } from "../store";
import { API_URL } from "../api";

function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

export function SettingsModal() {
  const user = useAppStore((s) => s.user);
  const open = useAppStore((s) => s.settingsOpen);
  const setOpen = useAppStore((s) => s.setSettingsOpen);
  const updateUsername = useAppStore((s) => s.updateUsername);
  const uploadAvatar = useAppStore((s) => s.uploadAvatar);
  const error = useAppStore((s) => s.error);
  const info = useAppStore((s) => s.info);
  const loading = useAppStore((s) => s.loading);

  const [username, setUsername] = useState(user?.username ?? "");

  useEffect(() => {
    if (user?.username) {
      setUsername(user.username);
    }
  }, [user?.username]);

  if (!open || !user) return null;

  const avatar = assetUrl(user.avatar_url);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const clean = username.trim();

    if (!clean) return;

    await updateUsername(clean);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    await uploadAvatar(file);

    e.target.value = "";
  }

  return (
    <div className="settings-backdrop">
      <section className="settings-modal">
        <header className="settings-header">
          <h2>Einstellungen</h2>

          <button type="button" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </header>

        <div className="settings-profile">
          <div className="settings-avatar">
            {avatar ? (
              <img src={avatar} alt="Avatar" />
            ) : (
              <span>{user.username.slice(0, 2).toUpperCase()}</span>
            )}

            <label title="Profilbild ändern">
              <Camera size={16} />
              <input
                type="file"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                onChange={onFile}
              />
            </label>
          </div>

          <p>PNG oder JPG · max. 2MB</p>
        </div>

        <form onSubmit={submit} className="settings-form">
          <label htmlFor="settingsUsername">Username</label>

          <input
            id="settingsUsername"
            name="settingsUsername"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />

          <button type="submit" disabled={loading}>
            {loading ? "Speichert..." : "Speichern"}
          </button>
        </form>

        {info && <div className="settings-info">{info}</div>}
        {error && <div className="settings-error">{error}</div>}
      </section>
    </div>
  );
}