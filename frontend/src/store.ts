import { create } from "zustand";
import { api } from "./api";
import { connectSocket, disconnectSocket, sendSocket } from "./socket";
import type {
  Channel,
  ChannelMessage,
  DirectMessage,
  Friend,
  FriendRequest,
  Server,
  ServerDetail,
  User,
  UserPublic
} from "./types";

/* ============================================================================
   Helpers
   ============================================================================ */

function formatTime(value: string) {
  if (!value) return value;

  const hasTimezone = value.endsWith("Z") || /[+\-]\d{2}:\d{2}$/.test(value);
  const normalized = hasTimezone ? value : `${value}Z`;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function withAvatarCacheBuster(path?: string | null) {
  if (!path) return null;

  const clean = String(path);
  if (clean.includes("?v=") || clean.includes("&v=")) return clean;

  return `${clean}?v=${Date.now()}`;
}

function normalizeUser(raw: any): User {
  return {
    id: Number(raw.id),
    username: String(raw.username ?? ""),
    avatar_url: raw.avatar_url ?? null,
    bio: raw.bio ?? null
  };
}

function normalizeFriend(raw: any): Friend {
  return {
    id: Number(raw.id),
    username: String(raw.username ?? ""),
    online: Boolean(raw.online),
    avatar_url: raw.avatar_url ?? null
  };
}

function normalizeFriendRequest(raw: any): FriendRequest {
  return {
    id: Number(raw.id),
    sender_id: Number(raw.sender_id),
    sender_username: String(raw.sender_username ?? ""),
    created_at: String(raw.created_at ?? "")
  };
}

function normalizeDm(raw: any): DirectMessage {
  return {
    id: Number(raw.id),
    sender_id: Number(raw.sender_id),
    receiver_id: Number(raw.receiver_id),
    sender_username: String(raw.sender_username ?? ""),
    sender_avatar_url: raw.sender_avatar_url ?? null,
    content: String(raw.content ?? ""),
    created_at: formatTime(String(raw.created_at ?? "")),

    reply_to_id: raw.reply_to_id ?? null,
    reply_preview_author: raw.reply_preview_author ?? null,
    reply_preview_content: raw.reply_preview_content ?? null,

    pinned: Boolean(raw.pinned),
    pinned_at: raw.pinned_at ?? null,
    pinned_by_id: raw.pinned_by_id ?? null
  };
}

function getOtherUserId(message: DirectMessage, currentUserId?: number | null) {
  if (!currentUserId) return null;
  return message.sender_id === currentUserId ? message.receiver_id : message.sender_id;
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function notifyDesktop(title: string, body: string) {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    // eslint-disable-next-line no-new
    new Notification(title, { body });
  } catch {
    // ignore
  }
}

type Toast = {
  id: number;
  title: string;
  body: string;
};

/* ============================================================================
   Store Type
   ============================================================================ */

type AppState = {
  user: User | null;
  token: string | null;

  friends: Friend[];
  requests: FriendRequest[];

  // DM
  activeFriendId: number | null;
  dmMessages: DirectMessage[];
  dmTypingByFriend: Record<number, string | null>;
  replyToMessage: DirectMessage | null;
  unreadByFriend: Record<number, number>;

  // UI
  settingsOpen: boolean;
  loading: boolean;
  error: string | null;
  info: string | null;

  // Toasts
  toasts: Toast[];
  addToast: (title: string, body: string) => void;
  removeToast: (id: number) => void;

  // Profile modal
  profileOpen: boolean;
  profileUser: UserPublic | null;

  // Guards
  bootstrapping: boolean;
  friendsLoading: boolean;
  requestsLoading: boolean;

  // Servers
  servers: Server[];
  activeServerId: number | null;
  serverDetail: ServerDetail | null;

  // Channels
  serverChannels: Channel[];
  activeChannelId: number | null;
  channelMessages: ChannelMessage[];

  // Modal
  createServerOpen: boolean;

  // Auth
  bootstrap: () => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;

  // Realtime
  connectRealtime: () => void;
  handleRealtimeEvent: (event: any) => void;

  // Friends
  loadFriends: () => Promise<void>;
  loadRequests: () => Promise<void>;
  sendFriendRequest: (username: string) => Promise<void>;
  acceptRequest: (id: number) => Promise<void>;
  declineRequest: (id: number) => Promise<void>;
  removeFriend: (friendId: number) => Promise<void>;

  // DMs
  openDm: (friendId: number) => Promise<void>;
  sendDm: (content: string) => Promise<void>;
  sendDmTyping: (isTyping: boolean) => void;
  setReplyToMessage: (message: DirectMessage | null) => void;
  deleteDm: (messageId: number) => Promise<void>;
  togglePinDm: (messageId: number) => Promise<void>;

  // Settings
  setSettingsOpen: (open: boolean) => void;
  updateUsername: (username: string, bio?: string | null) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;

  // Profile
  openProfile: (userId: number) => Promise<void>;
  closeProfile: () => void;

  // Server UI
  setCreateServerOpen: (open: boolean) => void;

  // Server actions
  loadServers: () => Promise<void>;
  selectServer: (serverId: number | null) => Promise<void>;
  createServer: (name: string, description: string, avatar?: File | null) => Promise<void>;
  addMemberToServer: (userId: number) => Promise<void>;
  removeMemberFromServer: (userId: number) => Promise<void>;
  deleteActiveServer: () => Promise<void>;

  // Channel actions
  loadServerChannels: () => Promise<void>;
  selectChannel: (channelId: number) => Promise<void>;
  createChannel: (name: string) => Promise<void>;
  deleteChannel: (channelId: number) => Promise<void>;

  // Channel messages
  loadChannelMessages: (channelId: number) => Promise<void>;
  sendChannelMessage: (content: string) => Promise<void>;
};

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  token: localStorage.getItem("token"),

  friends: [],
  requests: [],

  activeFriendId: null,
  dmMessages: [],
  dmTypingByFriend: {},
  replyToMessage: null,
  unreadByFriend: {},

  settingsOpen: false,
  loading: false,
  error: null,
  info: null,

  toasts: [],
  profileOpen: false,
  profileUser: null,

  bootstrapping: false,
  friendsLoading: false,
  requestsLoading: false,

  servers: [],
  activeServerId: null,
  serverDetail: null,

  serverChannels: [],
  activeChannelId: null,
  channelMessages: [],

  createServerOpen: false,

  /* Toasts */
  addToast(title, body) {
    set({
      toasts: [
        ...get().toasts,
        { id: Date.now() + Math.floor(Math.random() * 1000000), title, body }
      ]
    });
  },

  removeToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },

  /* Auth */
  async bootstrap() {
    const token = localStorage.getItem("token");
    if (!token) return;
    if (get().bootstrapping) return;

    try {
      set({ bootstrapping: true, loading: true, token, error: null, info: null });

      const user = normalizeUser(await api.me());
      set({ user });

      get().connectRealtime();

      await Promise.all([get().loadFriends(), get().loadRequests()]);
      await get().loadServers();
    } catch {
      localStorage.removeItem("token");
      set({
        user: null,
        token: null,
        friends: [],
        requests: [],
        activeFriendId: null,
        dmMessages: [],
        dmTypingByFriend: {},
        replyToMessage: null,
        unreadByFriend: {},
        servers: [],
        activeServerId: null,
        serverDetail: null,
        serverChannels: [],
        activeChannelId: null,
        channelMessages: [],
        settingsOpen: false,
        loading: false,
        error: null,
        info: null,
        toasts: [],
        profileOpen: false,
        profileUser: null,
        bootstrapping: false,
        friendsLoading: false,
        requestsLoading: false,
        createServerOpen: false
      });
    } finally {
      set({ loading: false, bootstrapping: false });
    }
  },

  async register(username, password) {
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      set({ error: "Username oder Passwort fehlt" });
      return;
    }

    set({ loading: true, error: null, info: null });

    try {
      await api.register(cleanUsername, password);
      const tokenData = (await api.login(cleanUsername, password)) as { access_token: string; token_type: string };
      localStorage.setItem("token", tokenData.access_token);

      const user = normalizeUser(await api.me());
      set({ token: tokenData.access_token, user });

      get().connectRealtime();

      await Promise.all([get().loadFriends(), get().loadRequests()]);
      await get().loadServers();
    } catch (err) {
      set({ error: getErrorMessage(err, "Register failed") });
    } finally {
      set({ loading: false });
    }
  },

  async login(username, password) {
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      set({ error: "Username oder Passwort fehlt" });
      return;
    }

    set({ loading: true, error: null, info: null });

    try {
      const tokenData = (await api.login(cleanUsername, password)) as { access_token: string; token_type: string };
      localStorage.setItem("token", tokenData.access_token);

      const user = normalizeUser(await api.me());
      set({ token: tokenData.access_token, user });

      get().connectRealtime();

      await Promise.all([get().loadFriends(), get().loadRequests()]);
      await get().loadServers();
    } catch (err) {
      set({ error: getErrorMessage(err, "Login failed") });
    } finally {
      set({ loading: false });
    }
  },

  logout() {
    disconnectSocket();
    localStorage.removeItem("token");
    set({
      user: null,
      token: null,
      friends: [],
      requests: [],
      activeFriendId: null,
      dmMessages: [],
      dmTypingByFriend: {},
      replyToMessage: null,
      unreadByFriend: {},
      servers: [],
      activeServerId: null,
      serverDetail: null,
      serverChannels: [],
      activeChannelId: null,
      channelMessages: [],
      settingsOpen: false,
      loading: false,
      error: null,
      info: null,
      toasts: [],
      profileOpen: false,
      profileUser: null,
      bootstrapping: false,
      friendsLoading: false,
      requestsLoading: false,
      createServerOpen: false
    });
  },

  /* Realtime */
  connectRealtime() {
    const token = localStorage.getItem("token");
    if (!token) return;

    connectSocket(token, (event) => {
      get().handleRealtimeEvent(event);
    });
  },

  handleRealtimeEvent(event) {
    if (event.type === "presence:update") {
      const userId = Number(event.userId);
      if (!Number.isFinite(userId)) return;

      set({
        friends: get().friends.map((friend) =>
          friend.id === userId ? { ...friend, online: Boolean(event.online) } : friend
        )
      });
      return;
    }

    if (event.type === "profile:update") {
      const updated = event.user;
      if (!updated?.id) return;

      const updatedUser = normalizeUser(updated);
      const currentUser = get().user;
      const currentProfile = get().profileUser;

      set({
        user:
          currentUser?.id === updatedUser.id
            ? {
                ...currentUser,
                username: updatedUser.username,
                avatar_url: updatedUser.avatar_url ?? null,
                bio: updatedUser.bio ?? currentUser.bio ?? null
              }
            : currentUser,

        friends: get().friends.map((friend) =>
          friend.id === updatedUser.id
            ? { ...friend, username: updatedUser.username, avatar_url: updatedUser.avatar_url ?? null }
            : friend
        ),

        dmMessages: get().dmMessages.map((msg) =>
          msg.sender_id === updatedUser.id
            ? { ...msg, sender_username: updatedUser.username, sender_avatar_url: updatedUser.avatar_url ?? null }
            : msg
        ),

        profileUser:
          currentProfile && currentProfile.id === updatedUser.id
            ? {
                ...currentProfile,
                username: updatedUser.username,
                avatar_url: updatedUser.avatar_url ?? null,
                bio: updatedUser.bio ?? currentProfile.bio ?? null
              }
            : currentProfile
      });
      return;
    }

    if (event.type === "dm:typing") {
      const friendId = Number(event.userId);
      if (!Number.isFinite(friendId)) return;

      set({
        dmTypingByFriend: {
          ...get().dmTypingByFriend,
          [friendId]: event.isTyping ? event.username : null
        }
      });
      return;
    }

    if (event.type === "friend_request:new") {
      const req = normalizeFriendRequest(event.request);
      const exists = get().requests.some((r) => r.id === req.id);
      if (exists) return;

      set({
        requests: [req, ...get().requests],
        info: `${req.sender_username} hat dir eine Anfrage gesendet`
      });
      return;
    }

    if (event.type === "friend_request:accepted") {
      void get().loadFriends();
      set({ info: "Freundschaftsanfrage wurde angenommen" });
      return;
    }

    if (event.type === "friend:removed") {
      const removedUserId = Number(event.userId);
      if (!Number.isFinite(removedUserId)) return;

      const active = get().activeFriendId;
      const { [removedUserId]: _removedUnread, ...restUnread } = get().unreadByFriend;

      set({
        friends: get().friends.filter((f) => f.id !== removedUserId),
        unreadByFriend: restUnread,
        activeFriendId: active === removedUserId ? null : active,
        dmMessages: active === removedUserId ? [] : get().dmMessages,
        replyToMessage: active === removedUserId ? null : get().replyToMessage
      });
      return;
    }

    if (event.type === "dm:new") {
      const incoming = normalizeDm(event.message);

      const currentUserId = get().user?.id;
      const otherUserId = getOtherUserId(incoming, currentUserId);
      if (!otherUserId) return;

      const exists = get().dmMessages.some((m) => m.id === incoming.id);
      if (exists) return;

      const activeFriendId = get().activeFriendId;

      if (activeFriendId === otherUserId) {
        set({
          dmMessages: [...get().dmMessages, incoming],
          dmTypingByFriend: { ...get().dmTypingByFriend, [otherUserId]: null }
        });
      } else {
        const current = get().unreadByFriend[otherUserId] ?? 0;

        set({
          unreadByFriend: { ...get().unreadByFriend, [otherUserId]: current + 1 }
        });

        get().addToast(incoming.sender_username, incoming.content);
        notifyDesktop(incoming.sender_username, incoming.content);
      }
      return;
    }

    if (event.type === "dm:delete") {
      const messageId = Number(event.messageId);
      if (!Number.isFinite(messageId)) return;

      set({
        dmMessages: get().dmMessages.filter((m) => m.id !== messageId),
        replyToMessage: get().replyToMessage?.id === messageId ? null : get().replyToMessage
      });
      return;
    }

    if (event.type === "dm:pin") {
      const incoming = normalizeDm(event.message);
      set({ dmMessages: get().dmMessages.map((m) => (m.id === incoming.id ? incoming : m)) });
      return;
    }

    if (event.type === "error") {
      set({ error: event.message || "WebSocket error" });
    }
  },

  /* Friends */
  async loadFriends() {
    if (get().friendsLoading) return;

    try {
      set({ friendsLoading: true });
      const rows = (await api.friends()) as any[];
      set({ friends: rows.map(normalizeFriend) });
    } catch (err) {
      set({ error: getErrorMessage(err, "Freunde konnten nicht geladen werden") });
    } finally {
      set({ friendsLoading: false });
    }
  },

  async loadRequests() {
    if (get().requestsLoading) return;

    try {
      set({ requestsLoading: true });
      const rows = (await api.friendRequests()) as any[];
      set({ requests: rows.map(normalizeFriendRequest) });
    } catch (err) {
      set({ error: getErrorMessage(err, "Anfragen konnten nicht geladen werden") });
    } finally {
      set({ requestsLoading: false });
    }
  },

  async sendFriendRequest(username) {
    const clean = username.trim();
    if (!clean) {
      set({ error: "Username fehlt" });
      return;
    }

    try {
      set({ error: null, info: null });
      await api.sendFriendRequest(clean);
      set({ info: "Anfrage gesendet" });
    } catch (err) {
      set({ error: getErrorMessage(err, "Anfrage fehlgeschlagen") });
    }
  },

  async acceptRequest(id) {
    try {
      set({ error: null, info: null });
      await api.acceptFriendRequest(id);

      set({
        requests: get().requests.filter((r) => r.id !== id),
        info: "Freundschaftsanfrage angenommen"
      });

      await get().loadFriends();
    } catch (err) {
      set({ error: getErrorMessage(err, "Accept failed") });
    }
  },

  async declineRequest(id) {
    try {
      set({ error: null, info: null });
      await api.declineFriendRequest(id);

      set({
        requests: get().requests.filter((r) => r.id !== id),
        info: "Freundschaftsanfrage abgelehnt"
      });
    } catch (err) {
      set({ error: getErrorMessage(err, "Decline failed") });
    }
  },

  async removeFriend(friendId) {
    try {
      set({ error: null, info: null });
      await api.removeFriend(friendId);

      const active = get().activeFriendId;
      const { [friendId]: _removedUnread, ...restUnread } = get().unreadByFriend;

      set({
        friends: get().friends.filter((f) => f.id !== friendId),
        unreadByFriend: restUnread,
        activeFriendId: active === friendId ? null : active,
        dmMessages: active === friendId ? [] : get().dmMessages,
        replyToMessage: active === friendId ? null : get().replyToMessage,
        info: "Freund entfernt"
      });
    } catch (err) {
      set({ error: getErrorMessage(err, "Freund konnte nicht entfernt werden") });
    }
  },

  /* DMs */
  async openDm(friendId) {
    get().sendDmTyping(false);

    set({
      activeFriendId: friendId,
      dmMessages: [],
      replyToMessage: null,
      error: null,
      info: null,
      unreadByFriend: { ...get().unreadByFriend, [friendId]: 0 },

      activeServerId: null,
      serverDetail: null,
      serverChannels: [],
      activeChannelId: null,
      channelMessages: []
    });

    try {
      const rows = (await api.directMessages(friendId)) as any[];
      set({ dmMessages: rows.map(normalizeDm) });
    } catch (err) {
      set({ error: getErrorMessage(err, "Nachrichten konnten nicht geladen werden") });
    }
  },

  async sendDm(content) {
    const text = content.trim();
    const friendId = get().activeFriendId;
    if (!text || !friendId) return;

    try {
      get().sendDmTyping(false);

      const replyTo = get().replyToMessage;
      const msg = normalizeDm(await api.sendDirectMessage(friendId, text, replyTo?.id ?? null));

      const exists = get().dmMessages.some((m) => m.id === msg.id);
      if (exists) {
        set({
          replyToMessage: null,
          dmTypingByFriend: { ...get().dmTypingByFriend, [friendId]: null }
        });
        return;
      }

      set({
        dmMessages: [...get().dmMessages, msg],
        replyToMessage: null,
        dmTypingByFriend: { ...get().dmTypingByFriend, [friendId]: null }
      });
    } catch (err) {
      set({ error: getErrorMessage(err, "Nachricht konnte nicht gesendet werden") });
    }
  },

  sendDmTyping(isTyping) {
    const friendId = get().activeFriendId;
    if (!friendId) return;

    sendSocket({
      type: "dm:typing",
      receiver_id: friendId,
      is_typing: isTyping
    });
  },

  setReplyToMessage(message) {
    set({ replyToMessage: message });
  },

  async deleteDm(messageId) {
    try {
      await api.deleteDirectMessage(messageId);
      set({
        dmMessages: get().dmMessages.filter((m) => m.id !== messageId),
        replyToMessage: get().replyToMessage?.id === messageId ? null : get().replyToMessage
      });
    } catch (err) {
      set({ error: getErrorMessage(err, "Nachricht konnte nicht gelöscht werden") });
    }
  },

  async togglePinDm(messageId) {
    try {
      const updated = normalizeDm(await api.togglePinDirectMessage(messageId));
      set({
        dmMessages: get().dmMessages.map((m) => (m.id === updated.id ? updated : m))
      });
    } catch (err) {
      set({ error: getErrorMessage(err, "Pin konnte nicht geändert werden") });
    }
  },

  /* Settings */
  setSettingsOpen(open) {
    set({ settingsOpen: open, error: null, info: null });
  },

  async updateUsername(username, bio) {
    const clean = username.trim();
    if (!clean) {
      set({ error: "Username fehlt" });
      return;
    }

    try {
      set({ loading: true, error: null, info: null });

      const updated = normalizeUser(await api.updateMe(clean, bio ?? null));
      const currentUser = get().user;

      const nextUser: User = currentUser
        ? {
            ...currentUser,
            username: updated.username,
            avatar_url: updated.avatar_url ?? currentUser.avatar_url ?? null,
            bio: updated.bio ?? currentUser.bio ?? null
          }
        : updated;

      set({
        user: nextUser,
        friends: get().friends.map((friend) =>
          friend.id === nextUser.id
            ? { ...friend, username: nextUser.username, avatar_url: nextUser.avatar_url ?? null }
            : friend
        ),
        dmMessages: get().dmMessages.map((msg) =>
          msg.sender_id === nextUser.id
            ? { ...msg, sender_username: nextUser.username, sender_avatar_url: nextUser.avatar_url ?? null }
            : msg
        ),
        info: "Profil gespeichert"
      });
    } catch (err) {
      set({ error: getErrorMessage(err, "Profil konnte nicht gespeichert werden") });
    } finally {
      set({ loading: false });
    }
  },

  async uploadAvatar(file) {
    const allowedTypes = ["image/png", "image/jpeg"];
    if (!allowedTypes.includes(file.type)) {
      set({ error: "Nur PNG oder JPG erlaubt" });
      return;
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      set({ error: "Profilbild darf maximal 2MB groß sein" });
      return;
    }

    try {
      set({ loading: true, error: null, info: null });

      const updated = normalizeUser(await api.uploadAvatar(file));
      const currentUser = get().user;

      const avatarUrl = withAvatarCacheBuster(updated.avatar_url);

      const nextUser: User = currentUser
        ? {
            ...currentUser,
            username: updated.username || currentUser.username,
            avatar_url: avatarUrl,
            bio: updated.bio ?? currentUser.bio ?? null
          }
        : { ...updated, avatar_url: avatarUrl };

      set({
        user: nextUser,
        friends: get().friends.map((friend) =>
          friend.id === nextUser.id ? { ...friend, username: nextUser.username, avatar_url: avatarUrl } : friend
        ),
        dmMessages: get().dmMessages.map((msg) =>
          msg.sender_id === nextUser.id ? { ...msg, sender_username: nextUser.username, sender_avatar_url: avatarUrl } : msg
        ),
        info: "Profilbild geändert"
      });
    } catch (err) {
      set({ error: getErrorMessage(err, "Avatar konnte nicht hochgeladen werden") });
    } finally {
      set({ loading: false });
    }
  },

  /* Profile */
  async openProfile(userId) {
    try {
      set({ error: null, info: null });

      const profileRaw = (await api.getUser(userId)) as UserPublic;

      set({
        profileOpen: true,
        profileUser: {
          id: Number(profileRaw.id),
          username: String(profileRaw.username ?? ""),
          avatar_url: profileRaw.avatar_url ?? null,
          bio: profileRaw.bio ?? null
        }
      });
    } catch (err) {
      set({ error: getErrorMessage(err, "Profil konnte nicht geladen werden") });
    }
  },

  closeProfile() {
    set({ profileOpen: false, profileUser: null });
  },

  /* Server UI */
  setCreateServerOpen(open) {
    set({ createServerOpen: open, error: null, info: null });
  },

  /* Servers */
  async loadServers() {
    try {
      const rows = (await api.listServers()) as Server[];
      set({ servers: rows });
    } catch (err) {
      set({ error: getErrorMessage(err, "Server konnten nicht geladen werden") });
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
        channelMessages: [],
        error: null,
        info: null,

        activeFriendId: null,
        dmMessages: [],
        replyToMessage: null
      });

      const detail = (await api.getServer(serverId)) as ServerDetail;
      set({ serverDetail: detail });

      await get().loadServerChannels();
    } catch (err) {
      set({ error: getErrorMessage(err, "Server konnte nicht geladen werden") });
    }
  },

  async createServer(name, description, avatar) {
    const cleanName = (name ?? "").trim();
    const cleanDesc = (description ?? "").trim();
    if (!cleanName) {
      set({ error: "Servername fehlt" });
      return;
    }

    try {
      set({ loading: true, error: null, info: null });

      const created = (await api.createServer(cleanName, cleanDesc || null)) as Server;

      if (avatar) {
        await api.uploadServerAvatar(created.id, avatar);
      }

      await get().loadServers();
      await get().selectServer(created.id);

      set({ info: "Server erstellt" });
    } catch (err) {
      set({ error: getErrorMessage(err, "Server konnte nicht erstellt werden") });
    } finally {
      set({ loading: false });
    }
  },

  async addMemberToServer(userId) {
    const serverId = get().activeServerId;
    if (!serverId) return;

    try {
      set({ error: null, info: null });

      await api.addServerMember(serverId, userId);
      const detail = (await api.getServer(serverId)) as ServerDetail;
      set({ serverDetail: detail, info: "Mitglied hinzugefügt" });
    } catch (err) {
      set({ error: getErrorMessage(err, "Mitglied konnte nicht hinzugefügt werden") });
    }
  },

  async removeMemberFromServer(userId) {
    const serverId = get().activeServerId;
    if (!serverId) return;

    try {
      set({ error: null, info: null });

      await api.removeServerMember(serverId, userId);
      const detail = (await api.getServer(serverId)) as ServerDetail;
      set({ serverDetail: detail, info: "Mitglied entfernt" });
    } catch (err) {
      set({ error: getErrorMessage(err, "Mitglied konnte nicht entfernt werden") });
    }
  },

  async deleteActiveServer() {
    const serverId = get().activeServerId;
    if (!serverId) return;

    try {
      set({ error: null, info: null });

      await api.deleteServer(serverId);

      set({
        activeServerId: null,
        serverDetail: null,
        serverChannels: [],
        activeChannelId: null,
        channelMessages: []
      });

      await get().loadServers();
      set({ info: "Server gelöscht" });
    } catch (err) {
      set({ error: getErrorMessage(err, "Server konnte nicht gelöscht werden") });
    }
  },

  /* Channels */
  async loadServerChannels() {
    const serverId = get().activeServerId;
    if (!serverId) return;

    try {
      const rows = (await api.listServerChannels(serverId)) as Channel[];
      set({ serverChannels: rows });

      // auto-select first channel if none selected
      if (!get().activeChannelId && rows.length > 0) {
        await get().selectChannel(rows[0].id);
      }
    } catch (err) {
      set({ error: getErrorMessage(err, "Channels konnten nicht geladen werden") });
    }
  },

  async selectChannel(channelId) {
    set({ activeChannelId: channelId, channelMessages: [], error: null, info: null });
    await get().loadChannelMessages(channelId);
  },

  async createChannel(name) {
    const serverId = get().activeServerId;
    if (!serverId) return;

    const clean = name.trim();
    if (!clean) return;

    try {
      set({ error: null, info: null });
      await api.createServerChannel(serverId, clean);

      await get().loadServerChannels();
      set({ info: "Channel erstellt" });
    } catch (err) {
      set({ error: getErrorMessage(err, "Channel konnte nicht erstellt werden") });
    }
  },

  async deleteChannel(channelId) {
    try {
      set({ error: null, info: null });

      await api.deleteChannel(channelId);

      // if deleting active channel, reset selection
      if (get().activeChannelId === channelId) {
        set({ activeChannelId: null, channelMessages: [] });
      }

      await get().loadServerChannels();
      set({ info: "Channel gelöscht" });
    } catch (err) {
      set({ error: getErrorMessage(err, "Channel konnte nicht gelöscht werden") });
    }
  },

  /* Channel Messages */
  async loadChannelMessages(channelId) {
    try {
      const rows = (await api.channelMessages(channelId)) as ChannelMessage[];

      // reuse formatTime for channel messages
      const mapped = rows.map((m) => ({
        ...m,
        created_at: formatTime(String(m.created_at ?? ""))
      }));

      set({ channelMessages: mapped });
    } catch (err) {
      set({ error: getErrorMessage(err, "Channel Messages konnten nicht geladen werden") });
    }
  },

  async sendChannelMessage(content) {
    const channelId = get().activeChannelId;
    if (!channelId) return;

    const clean = content.trim();
    if (!clean) return;

    try {
      const msg = (await api.sendChannelMessage(channelId, clean)) as ChannelMessage;

      const mapped: ChannelMessage = {
        ...msg,
        created_at: formatTime(String(msg.created_at ?? ""))
      };

      set({ channelMessages: [...get().channelMessages, mapped] });
    } catch (err) {
      set({ error: getErrorMessage(err, "Nachricht konnte nicht gesendet werden") });
    }
  }
}));