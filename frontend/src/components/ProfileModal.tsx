import { X } from "lucide-react";
import { useAppStore } from "../store";
import { API_URL } from "../api";

function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

export function ProfileModal() {
  const open = useAppStore((s) => s.profileOpen);
  const profile = useAppStore((s) => s.profileUser);
  const close = useAppStore((s) => s.closeProfile);

  if (!open || !profile) return null;

  const avatar = assetUrl(profile.avatar_url);

  return (
    <div className="settings-backdrop" onClick={close}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
        <header className="profile-header">
          <strong>Profil</strong>
          <button type="button" onClick={close}>
            <X size={18} />
          </button>
        </header>

        <div className="profile-body">
          <div className="profile-avatar">
            {avatar ? (
              <img src={avatar} alt="avatar" />
            ) : (
              <span>{profile.username.slice(0, 2).toUpperCase()}</span>
            )}
          </div>

          <h3>{profile.username}</h3>

          <p className="profile-bio">
            {profile.bio ? profile.bio : "Keine Beschreibung vorhanden."}
          </p>
        </div>
      </div>
    </div>
  );
}