import { useState } from "react";
import { X, Camera } from "lucide-react";
import { useAppStore } from "../store";

export function CreateServerModal() {
  const open = useAppStore((s) => s.createServerOpen);
  const setOpen = useAppStore((s) => s.setCreateServerOpen);
  const createServer = useAppStore((s) => s.createServer);
  const loading = useAppStore((s) => s.loading);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await createServer(name, desc, avatar);
    setName("");
    setDesc("");
    setAvatar(null);
    setOpen(false);
  }

  return (
    <div className="settings-backdrop" onClick={() => setOpen(false)}>
      <section className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <header className="settings-header">
          <h2>Server erstellen</h2>
          <button type="button" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </header>

        <form className="settings-form" onSubmit={submit}>
          <label>Servername</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />

          <label>Beschreibung</label>
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            maxLength={280}
          />

          <label>Serverbild</label>
          <div className="server-avatar-picker">
            <label className="server-avatar-btn">
              <Camera size={16} />
              <span>{avatar ? avatar.name : "Bild auswählen"}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? "Speichert..." : "Erstellen"}
          </button>
        </form>
      </section>
    </div>
  );
}