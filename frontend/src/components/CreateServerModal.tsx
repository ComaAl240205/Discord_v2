import { useEffect, useMemo, useState } from "react";
import { Camera, X } from "lucide-react";
import { useAppStore } from "../store";
import { useServerStore } from "../store_2";

export function CreateServerModal() {
  const open = useServerStore((s) => s.createServerOpen);
  const setOpen = useServerStore((s) => s.setCreateServerOpen);
  const createServer = useServerStore((s) => s.createServer);

  const loading = useAppStore((s) => s.loading);
  const error = useAppStore((s) => s.error);
  const info = useAppStore((s) => s.info);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);

  const previewUrl = useMemo(() => {
    if (!avatar) return null;
    return URL.createObjectURL(avatar);
  }, [avatar]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  if (!open) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const cleanName = name.trim();
    if (!cleanName) return;

    await createServer(cleanName, desc, avatar);

    setName("");
    setDesc("");
    setAvatar(null);
    setOpen(false);
  }

  function onFile(file: File | null) {
    if (!file) return;

    const allowed = ["image/png", "image/jpeg"];
    if (!allowed.includes(file.type)) return;

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) return;

    setAvatar(file);
  }

  const descLeft = 280 - desc.length;

  return (
    <div className="settings-backdrop" onClick={() => setOpen(false)}>
      <section
        className="create-server-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="create-server-header">
          <div className="create-server-title">
            <strong>Server erstellen</strong>
            <span>Erstelle deinen eigenen Server und lade Freunde ein.</span>
          </div>

          <button
            type="button"
            className="create-server-close"
            onClick={() => setOpen(false)}
            title="Schließen"
          >
            <X size={18} />
          </button>
        </header>

        <div className="create-server-divider" />

        <form className="create-server-form" onSubmit={submit}>
          <div className="create-server-top">
            <div className="server-avatar-preview">
              {previewUrl ? (
                <img src={previewUrl} alt="Server Avatar" />
              ) : (
                <span className="server-avatar-fallback">S</span>
              )}

              <label className="server-avatar-pick" title="Serverbild auswählen">
                <Camera size={16} />
                <input
                  type="file"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="create-server-fields">
              <label htmlFor="serverName">Servername</label>

              <input
                id="serverName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Alexandru's Hangout"
                autoComplete="off"
                maxLength={80}
              />

              <div className="create-server-desc-row">
                <label htmlFor="serverDesc">Beschreibung</label>
                <span className="create-server-counter">{descLeft}</span>
              </div>

              <textarea
                id="serverDesc"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Worum geht es in deinem Server?"
                maxLength={280}
              />

              <div className="create-server-hints">
                <span>PNG/JPG · max. 2MB</span>
                <span>Name max. 80 · Beschreibung max. 280</span>
              </div>
            </div>
          </div>

          {error && <div className="create-server-error">{error}</div>}
          {info && <div className="create-server-info">{info}</div>}

          <button
            type="submit"
            className="create-server-submit"
            disabled={loading || !name.trim()}
          >
            {loading ? "Erstellt..." : "Erstellen"}
          </button>
        </form>
      </section>
    </div>
  );
}