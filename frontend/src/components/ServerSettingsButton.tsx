import { Settings } from "lucide-react";

export function ServerSettingsButton(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="create-server-close"
      title="Server Einstellungen"
      onClick={props.onClick}
    >
      <Settings size={18} />
    </button>
  );
}