import { create } from "zustand";
import { API_URL, api } from "./api";
import { useAppStore, appFormatTime, appGetErrorMessage } from "./store";
import type {
  Channel,
  ChannelMessage,
  Server,
  ServerDetail,
  ServerMember
} from "./types";

/* ============================================================================
   Helpers
   ============================================================================ */

function wsUrlFromApi(apiUrl: string) {
  const u = new URL(apiUrl);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/ws";
  return u.toString();
}

function getToken() {
  return localStorage.getItem("token");
}

function setGlobalInfo(info: string | null) {
  useAppStore.setState({ info });
}

function setGlobalError(error: string | null) {
  useAppStore.setState({ error });
}

function setGlobalLoading(loading: boolean) {
  useAppStore.setState({ loading });
}

function getCurrentUserId() {
  return useAppStore.getState().user?.id ?? null;
}

/* ============================================================================
   Events
   ============================================================================ */

type ServerEvent =
  | { type: "server:updated"; server: Server }
  | { type: "server:deleted"; server_id: number }
  | {
      type: "server:member_added";
      server_id: number;
      user_id: number;
      member?: ServerMember;
      server?: Server;
    }
  | {
      type: "server:member_removed";
      server_id: number;
      user_id: number;
    }
  | {
      type: "server:channel_created";
      server_id: number;
      channel: Channel;
    }
  | {
      type: "server:channel_deleted";
      server_id: number;
      channel_id: number;
    }
  | {
      type: "server:role_updated";
      server_id: number;
      user_id: number;
      role: string;
      member?: ServerMember;
    }
  | {
      type: "channel:message_new";
      server_id: number;
      channel_id: number;
      message: ChannelMessage;
    }
  | { type: string; [key: string]: any };

/* ============================================================================
   Store Type
   ============================================================================ */

type ServerState = {
  servers: Server[];
  activeServerId: number | null;
  serverDetail: ServerDetail | null;

  serverChannels: Channel[];
  activeChannelId: number | null;
  channelMessages: ChannelMessage[];

  createServerOpen: boolean;

  socket: WebSocket | null;

  setCreateServerOpen: (open: boolean) => void;

  startServerRealtime: () => void;
  stopServerRealtime: () => void;
  handleServerEvent: (event: ServerEvent) => void;

  resetServerStore: () => void;

  loadServers: () => Promise<void>;
  selectServer: (serverId: number | null) => Promise<void>;
  createServer: (
    name: string,
    description: string,
    avatar?: File | null
  ) => Promise<void>;

  loadServerChannels: () => Promise<void>;
  selectChannel: (channelId: number) => Promise<void>;
  createChannel: (name: string) => Promise<void>;
  deleteChannel: (channelId: number) => Promise<void>;

  loadChannelMessages: (channelId: number) => Promise<void>;
  sendChannelMessage: (content: string) => Promise<void>;

  addMemberToServer: (userId: number) => Promise<void>;
  removeMemberFromServer: (userId: number) => Promise<void>;
  deleteActiveServer: () => Promise<void>;

  updateServerSettings: (
    serverId: number,
    name: string,
    description: string
  ) => Promise<void>;
  uploadServerSettingsAvatar: (
    serverId: number,
    file: File
  ) => Promise<void>;
};

/* ============================================================================
   Store
   ============================================================================ */

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  activeServerId: null,
  serverDetail: null,

  serverChannels: [],
  activeChannelId: null,
  channelMessages: [],

  createServerOpen: false,

  socket: null,

  setCreateServerOpen(open) {
    set({ createServerOpen: open });
    setGlobalError(null);
    setGlobalInfo(null);
  },

  /* ==========================================================================
     Server Realtime
     ========================================================================== */

  startServerRealtime() {
    const token = getToken();
    if (!token) return;

    // Initial load ist okay. Das ist KEIN Polling.
    // Polling wäre: nach jedem Event wieder loadServers/getServer.
    void get().loadServers();

    const current = get().socket;

    if (
      current &&
      (current.readyState === WebSocket.OPEN ||
        current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const url = wsUrlFromApi(API_URL);
    const wsUrl = `${url}?token=${encodeURIComponent(token)}`;

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("✅ Server WebSocket connected");
    };

    socket.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data) as ServerEvent;
        get().handleServerEvent(event);
      } catch (err) {
        console.error("Server WebSocket parse error:", err);
      }
    };

    socket.onerror = (err) => {
      console.error("Server WebSocket error:", err);
    };

    socket.onclose = () => {
      const currentSocket = get().socket;

      if (currentSocket === socket) {
        set({ socket: null });
      }

      console.log("❌ Server WebSocket closed");
    };

    set({ socket });
  },

  stopServerRealtime() {
    const socket = get().socket;

    if (socket) {
      socket.onclose = null;
      socket.close();
    }

    set({ socket: null });
  },

  handleServerEvent(event) {
    const state = get();
    const meId = getCurrentUserId();

    if (event.type === "server:updated") {
      const updated = event.server;

      set({
        servers: state.servers.map((srv) =>
          srv.id === updated.id ? { ...srv, ...updated } : srv
        ),
        serverDetail:
          state.serverDetail && state.serverDetail.id === updated.id
            ? { ...state.serverDetail, ...updated }
            : state.serverDetail
      });

      return;
    }

    if (event.type === "server:deleted") {
      const sid = event.server_id;
      const shouldReset = state.activeServerId === sid;

      set({
        servers: state.servers.filter((srv) => srv.id !== sid),
        activeServerId: shouldReset ? null : state.activeServerId,
        serverDetail: shouldReset ? null : state.serverDetail,
        serverChannels: shouldReset ? [] : state.serverChannels,
        activeChannelId: shouldReset ? null : state.activeChannelId,
        channelMessages: shouldReset ? [] : state.channelMessages
      });

      return;
    }

    if (event.type === "server:member_added") {
      const member = event.member;
      const server = event.server;

      // Wenn ich selbst eingeladen wurde, Server direkt in Liste aufnehmen.
      if (meId && event.user_id === meId && server) {
        const serverExists = state.servers.some((s) => s.id === server.id);

        set({
          servers: serverExists ? state.servers : [...state.servers, server]
        });
      }

      // Wenn aktueller Server offen ist, Member direkt einfügen.
      if (state.activeServerId === event.server_id && member) {
        const currentDetail = get().serverDetail;
        if (!currentDetail) return;

        const memberExists = currentDetail.members.some(
          (m) => m.user_id === member.user_id
        );

        set({
          serverDetail: {
            ...currentDetail,
            members: memberExists
              ? currentDetail.members
              : [...currentDetail.members, member]
          }
        });
      }

      return;
    }

    if (event.type === "server:member_removed") {
      const sid = event.server_id;
      const uid = event.user_id;

      // Wenn ich entfernt wurde, Server lokal entfernen.
      if (meId && uid === meId) {
        const shouldReset = state.activeServerId === sid;

        set({
          servers: state.servers.filter((srv) => srv.id !== sid),
          activeServerId: shouldReset ? null : state.activeServerId,
          serverDetail: shouldReset ? null : state.serverDetail,
          serverChannels: shouldReset ? [] : state.serverChannels,
          activeChannelId: shouldReset ? null : state.activeChannelId,
          channelMessages: shouldReset ? [] : state.channelMessages
        });

        return;
      }

      // Sonst Member aus Detail entfernen.
      if (state.activeServerId === sid && state.serverDetail) {
        set({
          serverDetail: {
            ...state.serverDetail,
            members: state.serverDetail.members.filter(
              (m) => m.user_id !== uid
            )
          }
        });
      }

      return;
    }

    if (event.type === "server:channel_created") {
      if (state.activeServerId !== event.server_id) return;

      const exists = state.serverChannels.some((c) => c.id === event.channel.id);
      if (exists) return;

      set({
        serverChannels: [...state.serverChannels, event.channel]
      });

      return;
    }

    if (event.type === "server:channel_deleted") {
      if (state.activeServerId !== event.server_id) return;

      const resetActive = state.activeChannelId === event.channel_id;

      set({
        serverChannels: state.serverChannels.filter(
          (c) => c.id !== event.channel_id
        ),
        activeChannelId: resetActive ? null : state.activeChannelId,
        channelMessages: resetActive ? [] : state.channelMessages
      });

      return;
    }

    if (event.type === "server:role_updated") {
      if (state.activeServerId !== event.server_id) return;
      if (!state.serverDetail) return;
      if (!event.member) return;

      set({
        serverDetail: {
          ...state.serverDetail,
          members: state.serverDetail.members.map((m) =>
            m.user_id === event.user_id ? event.member as ServerMember : m
          )
        }
      });

      return;
    }

    if (event.type === "channel:message_new") {
      if (state.activeServerId !== event.server_id) return;
      if (state.activeChannelId !== event.channel_id) return;

      const exists = state.channelMessages.some((m) => m.id === event.message.id);
      if (exists) return;

      const mapped: ChannelMessage = {
        ...event.message,
        created_at: appFormatTime(String(event.message.created_at ?? ""))
      };

      set({
        channelMessages: [...state.channelMessages, mapped]
      });

      return;
    }
  },

  resetServerStore() {
    const socket = get().socket;

    if (socket) {
      socket.onclose = null;
      socket.close();
    }

    set({
      servers: [],
      activeServerId: null,
      serverDetail: null,
      serverChannels: [],
      activeChannelId: null,
      channelMessages: [],
      createServerOpen: false,
      socket: null
    });
  },

  /* ==========================================================================
     Servers
     ========================================================================== */

  async loadServers() {
    try {
      const rows = (await api.listServers()) as Server[];
      set({ servers: rows });
    } catch (err) {
      setGlobalError(appGetErrorMessage(err, "Server konnten nicht geladen werden"));
    }
  },

  async selectServer(serverId) {
    if (!serverId) {
      set({
        activeServerId: null,
        serverDetail: null,
        serverChannels: [],
        activeChannelId: null,
        channelMessages: []
      });
      return;
    }

    try {
      set({
        activeServerId: serverId,
        serverDetail: null,
        serverChannels: [],
        activeChannelId: null,
        channelMessages: []
      });

      useAppStore.setState({
        activeFriendId: null,
        dmMessages: [],
        replyToMessage: null,
        error: null,
        info: null
      });

      const detail = (await api.getServer(serverId)) as ServerDetail;
      set({ serverDetail: detail });

      await get().loadServerChannels();
    } catch (err) {
      setGlobalError(appGetErrorMessage(err, "Server konnte nicht geladen werden"));
    }
  },

  async createServer(name, description, avatar) {
    const cleanName = (name ?? "").trim();
    const cleanDesc = (description ?? "").trim();

    if (!cleanName) {
      setGlobalError("Servername fehlt");
      return;
    }

    try {
      setGlobalLoading(true);
      setGlobalError(null);
      setGlobalInfo(null);

      const created = (await api.createServer(cleanName, cleanDesc || null)) as Server;

      if (avatar) {
        await api.uploadServerAvatar(created.id, avatar);
      }

      // Eigene Aktion: initial sync okay.
      await get().loadServers();
      await get().selectServer(created.id);

      setGlobalInfo("Server erstellt");
    } catch (err) {
      setGlobalError(appGetErrorMessage(err, "Server konnte nicht erstellt werden"));
    } finally {
      setGlobalLoading(false);
    }
  },

  async deleteActiveServer() {
    const serverId = get().activeServerId;
    if (!serverId) return;

    try {
      setGlobalError(null);
      setGlobalInfo(null);

      await apiDeleteServer(serverId);

      // Kein loadServers mehr. server:deleted Event aktualisiert alle Clients.
      set({
        activeServerId: null,
        serverDetail: null,
        serverChannels: [],
        activeChannelId: null,
        channelMessages: []
      });

      setGlobalInfo("Server gelöscht");
    } catch (err) {
      setGlobalError(appGetErrorMessage(err, "Server konnte nicht gelöscht werden"));
    }
  },

  /* ==========================================================================
     Channels
     ========================================================================== */

  async loadServerChannels() {
    const serverId = get().activeServerId;
    if (!serverId) return;

    try {
      const rows = (await api.listServerChannels(serverId)) as Channel[];

      set({ serverChannels: rows });

      if (!get().activeChannelId && rows.length > 0) {
        await get().selectChannel(rows[0].id);
      }
    } catch (err) {
      setGlobalError(appGetErrorMessage(err, "Channels konnten nicht geladen werden"));
    }
  },

  async selectChannel(channelId) {
    set({
      activeChannelId: channelId,
      channelMessages: []
    });

    setGlobalError(null);
    setGlobalInfo(null);

    await get().loadChannelMessages(channelId);
  },

  async createChannel(name) {
    const serverId = get().activeServerId;
    if (!serverId) return;

    const clean = name.trim();
    if (!clean) return;

    try {
      setGlobalError(null);
      setGlobalInfo(null);

      await apiCreateChannel(serverId, clean);

      // Kein loadServerChannels mehr. server:channel_created kommt per WS.
      setGlobalInfo("Channel erstellt");
    } catch (err) {
      setGlobalError(appGetErrorMessage(err, "Channel konnte nicht erstellt werden"));
    }
  },

  async deleteChannel(channelId) {
    try {
      setGlobalError(null);
      setGlobalInfo(null);

      await apiDeleteChannel(channelId);

      if (get().activeChannelId === channelId) {
        set({
          activeChannelId: null,
          channelMessages: []
        });
      }

      // Kein loadServerChannels mehr. server:channel_deleted kommt per WS.
      setGlobalInfo("Channel gelöscht");
    } catch (err) {
      setGlobalError(appGetErrorMessage(err, "Channel konnte nicht gelöscht werden"));
    }
  },

  /* ==========================================================================
     Channel Messages
     ========================================================================== */

  async loadChannelMessages(channelId) {
    try {
      const rows = (await api.channelMessages(channelId)) as ChannelMessage[];

      const mapped = rows.map((m) => ({
        ...m,
        created_at: appFormatTime(String(m.created_at ?? ""))
      }));

      set({ channelMessages: mapped });
    } catch (err) {
      setGlobalError(appGetErrorMessage(err, "Channel Messages konnten nicht geladen werden"));
    }
  },

  async sendChannelMessage(content) {
    const channelId = get().activeChannelId;
    if (!channelId) return;

    const clean = content.trim();
    if (!clean) return;

    try {
      // Nicht lokal append.
      // Backend sendet channel:message_new an alle inklusive Sender.
      await api.sendChannelMessage(channelId, clean);
    } catch (err) {
      setGlobalError(appGetErrorMessage(err, "Nachricht konnte nicht gesendet werden"));
    }
  },

  /* ==========================================================================
     Members
     ========================================================================== */

  async addMemberToServer(userId) {
    const serverId = get().activeServerId;
    if (!serverId) return;

    try {
      setGlobalError(null);
      setGlobalInfo(null);

      await apiInviteMember(serverId, userId);

      // Kein api.getServer mehr. server:member_added enthält member.
      setGlobalInfo("Mitglied hinzugefügt");
    } catch (err) {
      setGlobalError(appGetErrorMessage(err, "Mitglied konnte nicht hinzugefügt werden"));
    }
  },

  async removeMemberFromServer(userId) {
    const serverId = get().activeServerId;
    if (!serverId) return;

    try {
      setGlobalError(null);
      setGlobalInfo(null);

      await apiKickMember(serverId, userId);

      // Kein api.getServer mehr. server:member_removed aktualisiert direkt.
      setGlobalInfo("Mitglied entfernt");
    } catch (err) {
      setGlobalError(appGetErrorMessage(err, "Mitglied konnte nicht entfernt werden"));
    }
  },

  /* ==========================================================================
     Server Settings
     ========================================================================== */

  async updateServerSettings(serverId, name, description) {
    await apiUpdateServerSettings(serverId, name, description);
  },

  async uploadServerSettingsAvatar(serverId, file) {
    await apiUploadServerSettingsAvatar(serverId, file);
  }
}));

/* ============================================================================
   Legacy named exports
   ============================================================================ */

export function startServerRealtime() {
  useServerStore.getState().startServerRealtime();
}

export function stopServerRealtime() {
  useServerStore.getState().stopServerRealtime();
}

export function resetServerStore() {
  useServerStore.getState().resetServerStore();
}

export async function updateServerSettings(
  serverId: number,
  name: string,
  description: string
) {
  await useServerStore.getState().updateServerSettings(serverId, name, description);
}

export async function uploadServerSettingsAvatar(serverId: number, file: File) {
  await useServerStore.getState().uploadServerSettingsAvatar(serverId, file);
}

export async function inviteMember2(serverId: number, userId: number) {
  await apiInviteMember(serverId, userId);
}

export async function createChannel2(serverId: number, name: string) {
  await apiCreateChannel(serverId, name);
}

export async function deleteChannel2(channelId: number) {
  await apiDeleteChannel(channelId);
}

export async function deleteServer2(serverId: number) {
  await apiDeleteServer(serverId);
}

/* ============================================================================
   routes_2 API calls
   ============================================================================ */

async function apiUpdateServerSettings(
  serverId: number,
  name: string,
  description: string
) {
  const token = getToken();

  const res = await fetch(`${API_URL}/servers/${serverId}/settings`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ name, description })
  });

  if (!res.ok) throw new Error(await res.text());
}

async function apiUploadServerSettingsAvatar(serverId: number, file: File) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/servers/${serverId}/settings/avatar`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  });

  if (!res.ok) throw new Error(await res.text());
}

async function apiInviteMember(serverId: number, userId: number) {
  const token = getToken();

  const res = await fetch(`${API_URL}/servers/${serverId}/members/invite`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ user_id: userId })
  });

  if (!res.ok) throw new Error(await res.text());
}

async function apiKickMember(serverId: number, userId: number) {
  const token = getToken();

  const res = await fetch(`${API_URL}/servers/${serverId}/members/${userId}`, {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!res.ok) throw new Error(await res.text());
}

async function apiCreateChannel(serverId: number, name: string) {
  const token = getToken();

  const res = await fetch(`${API_URL}/servers/${serverId}/channels/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ name })
  });

  if (!res.ok) throw new Error(await res.text());
}

async function apiDeleteChannel(channelId: number) {
  const token = getToken();

  const res = await fetch(`${API_URL}/channels_2/${channelId}`, {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!res.ok) throw new Error(await res.text());
}

async function apiDeleteServer(serverId: number) {
  const token = getToken();

  const res = await fetch(`${API_URL}/servers/${serverId}/delete_2`, {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });

  if (!res.ok) throw new Error(await res.text());
}