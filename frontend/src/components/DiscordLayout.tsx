import React, { useState } from "react";
import { ServerSidebar } from "./ServerSidebar";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChatPanel } from "./ChatPanel";
import { CreateServerModal } from "./CreateServerModal";
import { ToastStack } from "./Toast";
import { ServerRealtimeBridge } from "./ServerRealtimeBridge";
import { ServerSettingsModal } from "./ServerSettingsModal";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getInitialSidebarWidth() {
  const saved = Number(localStorage.getItem("friendSidebarWidth"));
  if (!Number.isFinite(saved)) return 280;
  return clamp(saved, 240, 420);
}

export function DiscordLayout() {
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);

  function startResize(event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) {
    event.preventDefault();

    function onMove(moveEvent: MouseEvent | TouchEvent) {
      const x = moveEvent instanceof TouchEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const next = clamp(x - 72, 240, 420);
      setSidebarWidth(next);
      localStorage.setItem("friendSidebarWidth", String(next));
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
      document.body.classList.remove("is-resizing");
    }

    document.body.classList.add("is-resizing");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  }

  return (
    <div
      className="discord-app"
      style={
        {
          "--channel-width": `${sidebarWidth}px`
        } as React.CSSProperties
      }
    >
      <ServerSidebar />

      <ChannelSidebar
        onOpenServerSettings={() => setServerSettingsOpen(true)}
      />

      <div className="layout-resizer" onMouseDown={startResize} onTouchStart={startResize} />

      <ChatPanel />

      <CreateServerModal />

      <ToastStack />

      <ServerRealtimeBridge />

      <ServerSettingsModal
        open={serverSettingsOpen}
        onClose={() => setServerSettingsOpen(false)}
      />
    </div>
  );
}