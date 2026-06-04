import { create } from "zustand";
import { api } from "./api";
import { connectSocket, disconnectSocket, sendSocket } from "./socket";
import type {
  DirectMessage,
  Friend,
  FriendRequest,
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
  return message.sender_id === currentUserId
    ? message.receiver_id
    : message.sender_id;
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

  activeFriendId: number | null;
  dmMessages: DirectMessage[];
  dmTypingByFriend: Record<number, string | null>;
  replyToMessage: DirectMessage | null;
  unreadByFriend: Record<number, number>;

  settingsOpen: boolean;

  loading: boolean;
  error: string | null;
  info: string | null;

  toasts: Toast[];
  addToast: (title: string, body: string) => void;
  removeToast: (id: number) => void;

  profileOpen: boolean;
  profileUser: UserPublic | null;

  bootstrapping: boolean;
  friendsLoading: boolean;
  requestsLoading: boolean;

  bootstrap: () => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;

  connectRealtime: () => void;
  handleRealtimeEvent: (event: any) => void;

  loadFriends: () => Promise<void>;
  loadRequests: () => Promise<void>;

  sendFriendRequest: (username: string) => Promise<void>;
  acceptRequest: (id: number) => Promise<void>;
  declineRequest: (id: number) => Promise<void>;
  removeFriend: (friendId: number) => Promise<void>;

  openDm: (friendId: number) => Promise<void>;
  sendDm: (content: string) => Promise<void>;
  sendDmTyping: (isTyping: boolean) => void;

  setReplyToMessage: (message: DirectMessage | null) => void;
  deleteDm: (messageId: number) => Promise<void>;
  togglePinDm: (messageId: number) => Promise<void>;

  setSettingsOpen: (open: boolean) => void;
  updateUsername: (username: string, bio?: string | null) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;

  openProfile: (userId: number) => Promise<void>;
  closeProfile: () => void;
};

/* ============================================================================
   Store
   ============================================================================ */

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

  /* ==========================================================================
     Toasts
     ========================================================================== */

  addToast(title, body) {
    set({
      toasts: [
        ...get().toasts,
        {
          id: Date.now() + Math.floor(Math.random() * 1000000),
          title,
          body
        }
      ]
    });
  },

  removeToast(id) {
    set({
      toasts: get().toasts.filter((t) => t.id !== id)
    });
  },

  /* ==========================================================================
     Auth
     ========================================================================== */

  async bootstrap() {
    const token = localStorage.getItem("token");
    if (!token) return;
    if (get().bootstrapping) return;

    try {
      set({
        bootstrapping: true,
        loading: true,
        token,
        error: null,
        info: null
      });

      const user = normalizeUser(await api.me());
      set({ user });

      get().connectRealtime();

      // Initial Load ist okay. Das ist kein Polling.
      await Promise.all([get().loadFriends(), get().loadRequests()]);
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
        settingsOpen: false,
        loading: false,
        error: null,
        info: null,
        toasts: [],
        profileOpen: false,
        profileUser: null,
        bootstrapping: false,
        friendsLoading: false,
        requestsLoading: false
      });
    } finally {
      set({
        loading: false,
        bootstrapping: false
      });
    }
  },

  async register(username, password) {
    const cleanUsername = username.trim();

    if (!cleanUsername || !password) {
      set({ error: "Username oder Passwort fehlt" });
      return;
    }

    set({
      loading: true,
      error: null,
      info: null
    });

    try {
      await api.register(cleanUsername, password);

      const tokenData = (await api.login(cleanUsername, password)) as {
        access_token: string;
        token_type: string;
      };

      localStorage.setItem("token", tokenData.access_token);

      const user = normalizeUser(await api.me());

      set({
        token: tokenData.access_token,
        user
      });

      get().connectRealtime();

      // Initial Load nach Login.
      await Promise.all([get().loadFriends(), get().loadRequests()]);
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

    set({
      loading: true,
      error: null,
      info: null
    });

    try {
      const tokenData = (await api.login(cleanUsername, password)) as {
        access_token: string;
        token_type: string;
      };

      localStorage.setItem("token", tokenData.access_token);

      const user = normalizeUser(await api.me());

      set({
        token: tokenData.access_token,
        user
      });

      get().connectRealtime();

      // Initial Load nach Login.
      await Promise.all([get().loadFriends(), get().loadRequests()]);
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
      settingsOpen: false,
      loading: false,
      error: null,
      info: null,
      toasts: [],
      profileOpen: false,
      profileUser: null,
      bootstrapping: false,
      friendsLoading: false,
      requestsLoading: false
    });
  },

  /* ==========================================================================
     Realtime
     ========================================================================== */

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
          friend.id === userId
            ? { ...friend, online: Boolean(event.online) }
            : friend
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
            ? {
                ...friend,
                username: updatedUser.username,
                avatar_url: updatedUser.avatar_url ?? null
              }
            : friend
        ),

        dmMessages: get().dmMessages.map((msg) =>
          msg.sender_id === updatedUser.id
            ? {
                ...msg,
                sender_username: updatedUser.username,
                sender_avatar_url: updatedUser.avatar_url ?? null
              }
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

    if (event.type === "friend:added") {
      const friend = normalizeFriend(event.friend);
      const exists = get().friends.some((f) => f.id === friend.id);

      set({
        friends: exists ? get().friends : [...get().friends, friend],
        requests: event.request_id
          ? get().requests.filter((r) => r.id !== Number(event.request_id))
          : get().requests,
        info: `${friend.username} ist jetzt dein Freund`
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

    // Legacy-Fallback. Kein loadFriends mehr.
    if (event.type === "friend_request:accepted") {
      set({ info: "Freundschaftsanfrage wurde angenommen" });
      return;
    }

    if (event.type === "friend:removed") {
      const removedUserId = Number(event.userId);
      if (!Number.isFinite(removedUserId)) return;

      const active = get().activeFriendId;
      const { [removedUserId]: _removedUnread, ...restUnread } =
        get().unreadByFriend;

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
          dmTypingByFriend: {
            ...get().dmTypingByFriend,
            [otherUserId]: null
          }
        });
      } else {
        const current = get().unreadByFriend[otherUserId] ?? 0;

        set({
          unreadByFriend: {
            ...get().unreadByFriend,
            [otherUserId]: current + 1
          }
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
        replyToMessage:
          get().replyToMessage?.id === messageId ? null : get().replyToMessage
      });

      return;
    }

    if (event.type === "dm:pin") {
      const incoming = normalizeDm(event.message);

      set({
        dmMessages: get().dmMessages.map((m) =>
          m.id === incoming.id ? incoming : m
        )
      });

      return;
    }

    if (event.type === "error") {
      set({ error: event.message || "WebSocket error" });
    }
  },

  /* ==========================================================================
     Friends
     ========================================================================== */

  async loadFriends() {
    if (get().friendsLoading) return;

    try {
      set({ friendsLoading: true });

      const rows = (await api.friends()) as any[];
      set({ friends: rows.map(normalizeFriend) });
    } catch (err) {
      set({
        error: getErrorMessage(err, "Freunde konnten nicht geladen werden")
      });
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
      set({
        error: getErrorMessage(err, "Anfragen konnten nicht geladen werden")
      });
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

      // Kein loadFriends mehr.
      // Backend sendet friend:added per WebSocket.
      set({
        requests: get().requests.filter((r) => r.id !== id),
        info: "Freundschaftsanfrage angenommen"
      });
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

      // Optionaler Sofort-Update für aktuellen Client.
      // Anderer Client bekommt friend:removed per WebSocket.
      const active = get().activeFriendId;
      const { [friendId]: _removedUnread, ...restUnread } =
        get().unreadByFriend;

      set({
        friends: get().friends.filter((f) => f.id !== friendId),
        unreadByFriend: restUnread,
        activeFriendId: active === friendId ? null : active,
        dmMessages: active === friendId ? [] : get().dmMessages,
        replyToMessage: active === friendId ? null : get().replyToMessage,
        info: "Freund entfernt"
      });
    } catch (err) {
      set({
        error: getErrorMessage(err, "Freund konnte nicht entfernt werden")
      });
    }
  },

  /* ==========================================================================
     Direct Messages
     ========================================================================== */

  async openDm(friendId) {
    get().sendDmTyping(false);

    set({
      activeFriendId: friendId,
      dmMessages: [],
      replyToMessage: null,
      error: null,
      info: null,
      unreadByFriend: {
        ...get().unreadByFriend,
        [friendId]: 0
      }
    });

    try {
      // Initial Load beim Öffnen ist okay.
      const rows = (await api.directMessages(friendId)) as any[];
      set({ dmMessages: rows.map(normalizeDm) });
    } catch (err) {
      set({
        error: getErrorMessage(err, "Nachrichten konnten nicht geladen werden")
      });
    }
  },

  async sendDm(content) {
    const text = content.trim();
    const friendId = get().activeFriendId;

    if (!text || !friendId) return;

    try {
      get().sendDmTyping(false);

      const replyTo = get().replyToMessage;

      // Backend sendet dm:new an Sender und Receiver.
      // Wir hängen lokal NICHT zusätzlich an, damit alles über WS läuft.
      await api.sendDirectMessage(friendId, text, replyTo?.id ?? null);

      set({
        replyToMessage: null,
        dmTypingByFriend: {
          ...get().dmTypingByFriend,
          [friendId]: null
        }
      });
    } catch (err) {
      set({
        error: getErrorMessage(err, "Nachricht konnte nicht gesendet werden")
      });
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
      // Backend sendet dm:delete an beide.
    } catch (err) {
      set({
        error: getErrorMessage(err, "Nachricht konnte nicht gelöscht werden")
      });
    }
  },

  async togglePinDm(messageId) {
    try {
      await api.togglePinDirectMessage(messageId);
      // Backend sendet dm:pin an beide.
    } catch (err) {
      set({ error: getErrorMessage(err, "Pin konnte nicht geändert werden") });
    }
  },

  /* ==========================================================================
     Settings
     ========================================================================== */

  setSettingsOpen(open) {
    set({
      settingsOpen: open,
      error: null,
      info: null
    });
  },

  async updateUsername(username, bio) {
    const clean = username.trim();

    if (!clean) {
      set({ error: "Username fehlt" });
      return;
    }

    try {
      set({
        loading: true,
        error: null,
        info: null
      });

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
            ? {
                ...friend,
                username: nextUser.username,
                avatar_url: nextUser.avatar_url ?? null
              }
            : friend
        ),

        dmMessages: get().dmMessages.map((msg) =>
          msg.sender_id === nextUser.id
            ? {
                ...msg,
                sender_username: nextUser.username,
                sender_avatar_url: nextUser.avatar_url ?? null
              }
            : msg
        ),

        info: "Profil gespeichert"
      });
    } catch (err) {
      set({
        error: getErrorMessage(err, "Profil konnte nicht gespeichert werden")
      });
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
      set({
        loading: true,
        error: null,
        info: null
      });

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
        : {
            ...updated,
            avatar_url: avatarUrl
          };

      set({
        user: nextUser,

        friends: get().friends.map((friend) =>
          friend.id === nextUser.id
            ? {
                ...friend,
                username: nextUser.username,
                avatar_url: avatarUrl
              }
            : friend
        ),

        dmMessages: get().dmMessages.map((msg) =>
          msg.sender_id === nextUser.id
            ? {
                ...msg,
                sender_username: nextUser.username,
                sender_avatar_url: avatarUrl
              }
            : msg
        ),

        info: "Profilbild geändert"
      });
    } catch (err) {
      set({
        error: getErrorMessage(err, "Avatar konnte nicht hochgeladen werden")
      });
    } finally {
      set({ loading: false });
    }
  },

  /* ==========================================================================
     Profile
     ========================================================================== */

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
    set({
      profileOpen: false,
      profileUser: null
    });
  }
}));

export function appFormatTime(value: string) {
  return formatTime(value);
}

export function appGetErrorMessage(err: unknown, fallback: string) {
  return getErrorMessage(err, fallback);
}