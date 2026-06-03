import { useEffect, useRef } from "react";
import { DiscordLayout } from "./components/DiscordLayout";
import { AuthScreen } from "./components/AuthScreen";
import { SettingsModal } from "./components/SettingsModal";
import { useAppStore } from "./store";

export default function App() {
  const user = useAppStore((s) => s.user);
  const bootstrap = useAppStore((s) => s.bootstrap);

  // Verhindert doppelten bootstrap in React StrictMode / Dev
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (bootstrappedRef.current) return;

    bootstrappedRef.current = true;
    void bootstrap();
  }, [bootstrap]);

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <>
      <DiscordLayout />
      <SettingsModal />
    </>
  );
}