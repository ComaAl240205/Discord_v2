import React, { useState } from "react";
import { ServerSidebar } from "./ServerSidebar";
import { ChannelSidebar } from "./ChannelSidebar";
import { ChatPanel } from "./ChatPanel";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getInitialSidebarWidth() {
  const saved = Number(localStorage.getItem("friendSidebarWidth"));

  if (!Number.isFinite(saved)) {
    return 280;
  }

  return clamp(saved, 240, 420);
}

export function DiscordLayout() {
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);

  function startResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();

    function onMove(moveEvent: MouseEvent) {
      const next = clamp(moveEvent.clientX - 72, 240, 420);

      setSidebarWidth(next);
      localStorage.setItem("friendSidebarWidth", String(next));
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("is-resizing");
    }

    document.body.classList.add("is-resizing");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
      <ChannelSidebar />
      <div className="layout-resizer" onMouseDown={startResize} />
      <ChatPanel />
    </div>
  );
}