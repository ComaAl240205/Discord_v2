import { create } from "zustand";
import { api } from "./api";
import { connectSocket, disconnectSocket, sendSocket } from "./socket";
import type { DirectMessage, Friend, FriendRequest, User } from "./types";

/* ============================================================================
   Helpers
   ============================================================================ */

/**
 * Formatiert Backend-Zeitwerte für die Anzeige im Chat.
 * Wenn der Wert kein gültiges Datum ist, wird der Originalwert zurückgegeben.
 */
function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Fügt einen Cache-Buster an Avatar-URLs an.
 *
 * Warum?
 * Browser cachen Bilder aggressiv. Wenn jemand sein Profilbild ersetzt,
 * kann der Browser sonst noch das alte Bild anzeigen.
 *
 * Wichtig:
 * - Backend speichert weiterhin nur "/uploads/avatars/..."
 * - Frontend darf für Anzeige "?v=..." anhängen
 */
function withAvatarCacheBuster(path?: string | null) {
  if (!path) return null;

  const clean = String(path);

  // Wenn schon ein Cache-Buster existiert, nicht doppelt anhängen.
  if (clean.includes("?v=") || clean.includes("&v=")) {
    return clean;
  }

  return `${clean}?v=${Date.now()}`;
}

/**
 * Normalisiert User-Daten aus Backend/Realtime-Events.
 */
function normalizeUser(raw: any): User {
  return {
    id: Number(raw.id),
    username: String(raw.username ?? ""),
    avatar_url: raw.avatar_url ?? null
  };
}

/**
 * Normalisiert Friend-Daten aus Backend.
 */
function normalizeFriend(raw: any): Friend {
  return {
    id: Number(raw.id),
    username: String(raw.username ?? ""),
    online: Boolean(raw.online),
    avatar_url: raw.avatar_url ?? null
  };
}

/**
 * Normalisiert FriendRequest-Daten.
 */
function normalizeFriendRequest(raw: any): FriendRequest {
  return {
    id: Number(raw.id),
    sender_id: Number(raw.sender_id),
    sender_username: String(raw.sender_username ?? ""),
    created_at: String(raw.created_at ?? "")
  };
}

/**
 * Normalisiert DirectMessage-Daten.
 * Wichtig: sender_avatar_url wird hier sauber übernommen.
 */
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

/**
 * Liefert die ID der anderen Person in einer DM.
 */
function getOtherUserId(message: DirectMessage, currentUserId?: number | null) {
  if (!currentUserId) return null;

  return message.sender_id === currentUserId
    ? message.receiver_id
    : message.sender_id;
}

/**
 * Gibt eine saubere Error-Message zurück.
 */
function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) {
    return err.message;
  }

  return fallback;
}

/* ============================================================================
   Store Type
   ============================================================================ */

type AppState = {
  /* --------------------------------------------------------------------------
     Auth/User
     -------------------------------------------------------------------------- */

  user: User | null;
  token: string | null;

  /* --------------------------------------------------------------------------
     Friends / Requests
     -------------------------------------------------------------------------- */

  friends: Friend[];
  requests: FriendRequest[];

  /* --------------------------------------------------------------------------
     DM State
     -------------------------------------------------------------------------- */

  activeFriendId: number | null;
  dmMessages: DirectMessage[];

  /**
   * friendId -> Name der Person, die gerade schreibt.
   */
  dmTypingByFriend: Record<number, string | null>;

  /**
   * Nachricht, auf die gerade geantwortet wird.
   */
  replyToMessage: DirectMessage | null;

  /* --------------------------------------------------------------------------
     UI State
     -------------------------------------------------------------------------- */

  settingsOpen: boolean;

  loading: boolean;
  error: string | null;
  info: string | null;

  /**
   * Verhindert doppelte /auth/me, /friends, /friends/requests Requests.
   * Besonders wichtig bei React StrictMode und Dev Tunnels.
   */
  bootstrapping: boolean;

  /**
   * Kleine Lade-Guards gegen mehrfaches Laden.
   */
  friendsLoading: boolean;
  requestsLoading: boolean;

  /* --------------------------------------------------------------------------
     Auth Actions
     -------------------------------------------------------------------------- */

  bootstrap: () => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;

  /* --------------------------------------------------------------------------
     Realtime Actions
     -------------------------------------------------------------------------- */

  connectRealtime: () => void;
  handleRealtimeEvent: (event: any) => void;

  /* --------------------------------------------------------------------------
     Friend Actions
     -------------------------------------------------------------------------- */

  loadFriends: () => Promise<void>;
  loadRequests: () => Promise<void>;

  sendFriendRequest: (username: string) => Promise<void>;
  acceptRequest: (id: number) => Promise<void>;
  declineRequest: (id: number) => Promise<void>;

  /* --------------------------------------------------------------------------
     DM Actions
     -------------------------------------------------------------------------- */

  openDm: (friendId: number) => Promise<void>;
  sendDm: (content: string) => Promise<void>;
  sendDmTyping: (isTyping: boolean) => void;

  setReplyToMessage: (message: DirectMessage | null) => void;
  deleteDm: (messageId: number) => Promise<void>;
  togglePinDm: (messageId: number) => Promise<void>;

  /* --------------------------------------------------------------------------
     Settings Actions
     -------------------------------------------------------------------------- */

  setSettingsOpen: (open: boolean) => void;
  updateUsername: (username: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
};

/* ============================================================================
   Store
   ============================================================================ */

export const useAppStore = create<AppState>((set, get) => ({
  /* --------------------------------------------------------------------------
     Initial State
     -------------------------------------------------------------------------- */

  user: null,
  token: localStorage.getItem("token"),

  friends: [],
  requests: [],

  activeFriendId: null,
  dmMessages: [],

  dmTypingByFriend: {},
  replyToMessage: null,

  settingsOpen: false,

  loading: false,
  error: null,
  info: null,

  bootstrapping: false,
  friendsLoading: false,
  requestsLoading: false,

  /* ==========================================================================
     Auth
     ========================================================================== */

  async bootstrap() {
    const token = localStorage.getItem("token");

    if (!token) return;

    // Wichtig gegen doppelte Requests durch React StrictMode / Dev Tunnels.
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

      set({
        user
      });

      get().connectRealtime();

      await Promise.all([
        get().loadFriends(),
        get().loadRequests()
      ]);
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
        settingsOpen: false,
        loading: false,
        error: null,
        info: null,
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
      set({
        error: "Username oder Passwort fehlt"
      });

      return;
    }

    set({
      loading: true,
      error: null,
      info: null
    });

    try {
      await api.register(cleanUsername, password);

      // Nach Register direkt einloggen.
      const tokenData = await api.login(cleanUsername, password);

      localStorage.setItem("token", tokenData.access_token);

      const user = normalizeUser(await api.me());

      set({
        token: tokenData.access_token,
        user
      });

      get().connectRealtime();

      await Promise.all([
        get().loadFriends(),
        get().loadRequests()
      ]);
    } catch (err) {
      set({
        error: getErrorMessage(err, "Register failed")
      });
    } finally {
      set({
        loading: false
      });
    }
  },

  async login(username, password) {
    const cleanUsername = username.trim();

    if (!cleanUsername || !password) {
      set({
        error: "Username oder Passwort fehlt"
      });

      return;
    }

    set({
      loading: true,
      error: null,
      info: null
    });

    try {
      const tokenData = await api.login(cleanUsername, password);

      localStorage.setItem("token", tokenData.access_token);

      const user = normalizeUser(await api.me());

      set({
        token: tokenData.access_token,
        user
      });

      get().connectRealtime();

      await Promise.all([
        get().loadFriends(),
        get().loadRequests()
      ]);
    } catch (err) {
      set({
        error: getErrorMessage(err, "Login failed")
      });
    } finally {
      set({
        loading: false
      });
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
      settingsOpen: false,
      loading: false,
      error: null,
      info: null,
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
    /* ------------------------------------------------------------------------
       Presence
       ------------------------------------------------------------------------ */

    if (event.type === "presence:update") {
      const userId = Number(event.userId);

      if (!Number.isFinite(userId)) return;

      set({
        friends: get().friends.map((friend) =>
          friend.id === userId
            ? {
                ...friend,
                online: Boolean(event.online)
              }
            : friend
        )
      });

      return;
    }

    /* ------------------------------------------------------------------------
       Profile Update
       ------------------------------------------------------------------------ */

    if (event.type === "profile:update") {
      const updated = event.user;

      if (!updated?.id) return;

      const updatedUser = normalizeUser(updated);
      const currentUser = get().user;

      set({
        user:
          currentUser?.id === updatedUser.id
            ? {
                ...currentUser,
                username: updatedUser.username,
                avatar_url: updatedUser.avatar_url ?? null
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
        )
      });

      return;
    }

    /* ------------------------------------------------------------------------
       Typing
       ------------------------------------------------------------------------ */

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

    /* ------------------------------------------------------------------------
       Friend Request New
       ------------------------------------------------------------------------ */

    if (event.type === "friend_request:new") {
      const req = normalizeFriendRequest(event.request);

      const exists = get().requests.some((r) => r.id === req.id);

      if (exists) return;

      set({
        requests: [
          req,
          ...get().requests
        ],
        info: `${req.sender_username} hat dir eine Anfrage gesendet`
      });

      return;
    }

    /* ------------------------------------------------------------------------
       Friend Request Accepted
       ------------------------------------------------------------------------ */

    if (event.type === "friend_request:accepted") {
      void get().loadFriends();

      set({
        info: "Freundschaftsanfrage wurde angenommen"
      });

      return;
    }

    /* ------------------------------------------------------------------------
       DM New
       ------------------------------------------------------------------------ */

    if (event.type === "dm:new") {
      const incoming = normalizeDm(event.message);

      const currentUserId = get().user?.id;
      const otherUserId = getOtherUserId(incoming, currentUserId);

      if (!otherUserId) return;

      if (get().activeFriendId !== otherUserId) return;

      const exists = get().dmMessages.some((m) => m.id === incoming.id);

      if (exists) return;

      set({
        dmMessages: [
          ...get().dmMessages,
          incoming
        ],
        dmTypingByFriend: {
          ...get().dmTypingByFriend,
          [otherUserId]: null
        }
      });

      return;
    }

    /* ------------------------------------------------------------------------
       DM Delete
       ------------------------------------------------------------------------ */

    if (event.type === "dm:delete") {
      const messageId = Number(event.messageId);

      if (!Number.isFinite(messageId)) return;

      set({
        dmMessages: get().dmMessages.filter((m) => m.id !== messageId),
        replyToMessage:
          get().replyToMessage?.id === messageId
            ? null
            : get().replyToMessage
      });

      return;
    }

    /* ------------------------------------------------------------------------
       DM Pin
       ------------------------------------------------------------------------ */

    if (event.type === "dm:pin") {
      const incoming = normalizeDm(event.message);

      set({
        dmMessages: get().dmMessages.map((m) =>
          m.id === incoming.id
            ? incoming
            : m
        )
      });

      return;
    }

    /* ------------------------------------------------------------------------
       Error
       ------------------------------------------------------------------------ */

    if (event.type === "error") {
      set({
        error: event.message || "WebSocket error"
      });
    }
  },

  /* ==========================================================================
     Friends
     ========================================================================== */

  async loadFriends() {
    if (get().friendsLoading) return;

    try {
      set({
        friendsLoading: true
      });

      const rows = await api.friends();

      set({
        friends: rows.map(normalizeFriend)
      });
    } catch (err) {
      set({
        error: getErrorMessage(err, "Freunde konnten nicht geladen werden")
      });
    } finally {
      set({
        friendsLoading: false
      });
    }
  },

  async loadRequests() {
    if (get().requestsLoading) return;

    try {
      set({
        requestsLoading: true
      });

      const rows = await api.friendRequests();

      set({
        requests: rows.map(normalizeFriendRequest)
      });
    } catch (err) {
      set({
        error: getErrorMessage(err, "Anfragen konnten nicht geladen werden")
      });
    } finally {
      set({
        requestsLoading: false
      });
    }
  },

  async sendFriendRequest(username) {
    const clean = username.trim();

    if (!clean) {
      set({
        error: "Username fehlt"
      });

      return;
    }

    try {
      set({
        error: null,
        info: null
      });

      await api.sendFriendRequest(clean);

      set({
        info: "Anfrage gesendet"
      });
    } catch (err) {
      set({
        error: getErrorMessage(err, "Anfrage fehlgeschlagen")
      });
    }
  },

  async acceptRequest(id) {
    try {
      set({
        error: null,
        info: null
      });

      await api.acceptFriendRequest(id);

      set({
        requests: get().requests.filter((r) => r.id !== id),
        info: "Freundschaftsanfrage angenommen"
      });

      await get().loadFriends();
    } catch (err) {
      set({
        error: getErrorMessage(err, "Accept failed")
      });
    }
  },

  async declineRequest(id) {
    try {
      set({
        error: null,
        info: null
      });

      await api.declineFriendRequest(id);

      set({
        requests: get().requests.filter((r) => r.id !== id),
        info: "Freundschaftsanfrage abgelehnt"
      });
    } catch (err) {
      set({
        error: getErrorMessage(err, "Decline failed")
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
      info: null
    });

    try {
      const rows = await api.directMessages(friendId);

      set({
        dmMessages: rows.map(normalizeDm)
      });
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

      const msg = normalizeDm(
        await api.sendDirectMessage(
          friendId,
          text,
          replyTo?.id ?? null
        )
      );

      const exists = get().dmMessages.some((m) => m.id === msg.id);

      if (exists) {
        set({
          replyToMessage: null,
          dmTypingByFriend: {
            ...get().dmTypingByFriend,
            [friendId]: null
          }
        });

        return;
      }

      set({
        dmMessages: [
          ...get().dmMessages,
          msg
        ],
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
    set({
      replyToMessage: message
    });
  },

  async deleteDm(messageId) {
    try {
      await api.deleteDirectMessage(messageId);

      set({
        dmMessages: get().dmMessages.filter((m) => m.id !== messageId),
        replyToMessage:
          get().replyToMessage?.id === messageId
            ? null
            : get().replyToMessage
      });
    } catch (err) {
      set({
        error: getErrorMessage(err, "Nachricht konnte nicht gelöscht werden")
      });
    }
  },

  async togglePinDm(messageId) {
    try {
      const updated = normalizeDm(
        await api.togglePinDirectMessage(messageId)
      );

      set({
        dmMessages: get().dmMessages.map((m) =>
          m.id === updated.id
            ? updated
            : m
        )
      });
    } catch (err) {
      set({
        error: getErrorMessage(err, "Pin konnte nicht geändert werden")
      });
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

  async updateUsername(username) {
    const clean = username.trim();

    if (!clean) {
      set({
        error: "Username fehlt"
      });

      return;
    }

    try {
      set({
        loading: true,
        error: null,
        info: null
      });

      /**
       * Wichtig:
       * Diese Funktion muss PATCH /users/me aufrufen.
       * Wenn hier "File field required" kommt, zeigt api.updateMe falsch auf /users/me/avatar.
       */
      const updated = normalizeUser(await api.updateMe(clean));
      const currentUser = get().user;

      const nextUser: User = currentUser
        ? {
            ...currentUser,
            username: updated.username,
            avatar_url: updated.avatar_url ?? currentUser.avatar_url ?? null
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

        info: "Username geändert"
      });
    } catch (err) {
      set({
        error: getErrorMessage(err, "Username konnte nicht geändert werden")
      });
    } finally {
      set({
        loading: false
      });
    }
  },

  async uploadAvatar(file) {
    const allowedTypes = ["image/png", "image/jpeg"];

    if (!allowedTypes.includes(file.type)) {
      set({
        error: "Nur PNG oder JPG erlaubt"
      });

      return;
    }

    const maxSize = 2 * 1024 * 1024;

    if (file.size > maxSize) {
      set({
        error: "Profilbild darf maximal 2MB groß sein"
      });

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

      /**
       * Cache-Buster:
       * Wenn Browser das alte Avatarbild cached,
       * erzwingen wir clientseitig eine neue Bild-URL.
       */
      const avatarUrl = withAvatarCacheBuster(updated.avatar_url);

      const nextUser: User = currentUser
        ? {
            ...currentUser,
            username: updated.username || currentUser.username,
            avatar_url: avatarUrl
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
      set({
        loading: false
      });
    }
  }
}));