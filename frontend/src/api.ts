export const API_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

function getToken() {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${API_URL}${cleanPath}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {})
      }
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Request failed");
    }

    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timeout.");
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/* =======================
   Response Types
======================= */

type UserOut = {
  id: number;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
};

type TokenOut = {
  access_token: string;
  token_type: string;
};

type FriendOut = {
  id: number;
  username: string;
  online: boolean;
  avatar_url?: string | null;
};

type FriendRequestOut = {
  id: number;
  sender_id: number;
  sender_username: string;
  created_at: string;
};

type DirectMessageOut = {
  id: number;
  sender_id: number;
  receiver_id: number;
  sender_username: string;
  sender_avatar_url?: string | null;
  content: string;
  created_at: string;

  reply_to_id?: number | null;
  reply_preview_author?: string | null;
  reply_preview_content?: string | null;

  pinned?: boolean;
  pinned_at?: string | null;
  pinned_by_id?: number | null;
};

type UserPublic = {
  id: number;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
};

type ServerOut = {
  id: number;
  name: string;
  owner_id: number;
  avatar_url?: string | null;
  description?: string | null;
};

type ServerDetailOut = ServerOut & {
  members: {
    id: number;
    user_id: number;
    username: string;
    avatar_url?: string | null;
    role: string;
  }[];
};

type ChannelOut = {
  id: number;
  server_id: number;
  name: string;
};

type ChannelMessageOut = {
  id: number;
  channel_id: number;
  author_id: number;
  author: string;
  content: string;
  created_at: string;
};

export const api = {
  // Auth
  register(username: string, password: string) {
    return request<UserOut>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  },

  login(username: string, password: string) {
    return request<TokenOut>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
  },

  me() {
    return request<UserOut>("/auth/me");
  },

  // Settings / User
  updateMe(username: string, bio?: string | null) {
    return request<UserOut>("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ username, bio: bio ?? null })
    });
  },

  async uploadAvatar(file: File) {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_URL}/users/me/avatar`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Avatar upload failed");
    }

    return (await res.json()) as UserOut;
  },

  getUser(userId: number) {
    return request<UserPublic>(`/users/${userId}`);
  },

  // Friends
  friends() {
    return request<FriendOut[]>("/friends");
  },

  friendRequests() {
    return request<FriendRequestOut[]>("/friends/requests");
  },

  sendFriendRequest(username: string) {
    return request<{ status: string }>("/friends/request", {
      method: "POST",
      body: JSON.stringify({ username })
    });
  },

  acceptFriendRequest(id: number) {
    return request<{ status: string }>(`/friends/requests/${id}/accept`, {
      method: "POST"
    });
  },

  declineFriendRequest(id: number) {
    return request<{ status: string }>(`/friends/requests/${id}/decline`, {
      method: "POST"
    });
  },

  removeFriend(friendId: number) {
    return request<{ status: string }>(`/friends/${friendId}`, {
      method: "DELETE"
    });
  },

  // Direct Messages
  directMessages(friendId: number) {
    return request<DirectMessageOut[]>(`/dm/${friendId}`);
  },

  sendDirectMessage(receiverId: number, content: string, replyToId?: number | null) {
    return request<DirectMessageOut>("/dm", {
      method: "POST",
      body: JSON.stringify({
        receiver_id: receiverId,
        content,
        reply_to_id: replyToId ?? null
      })
    });
  },

  deleteDirectMessage(messageId: number) {
    return request<{ status: string }>(`/dm/${messageId}`, {
      method: "DELETE"
    });
  },

  togglePinDirectMessage(messageId: number) {
    return request<DirectMessageOut>(`/dm/${messageId}/pin`, {
      method: "POST"
    });
  },

  // Servers
  createServer(name: string, description?: string | null) {
    return request<ServerOut>("/servers", {
      method: "POST",
      body: JSON.stringify({
        name,
        description: description ?? null,
        avatar_url: null
      })
    });
  },

  listServers() {
    return request<ServerOut[]>("/servers");
  },

  getServer(serverId: number) {
    return request<ServerDetailOut>(`/servers/${serverId}`);
  },

  addServerMember(serverId: number, userId: number) {
    return request<{ status: string }>(`/servers/${serverId}/members`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId })
    });
  },

  deleteServer(serverId: number) {
    return request<{ status: string }>(`/servers/${serverId}`, {
      method: "DELETE"
    });
  },

  removeServerMember(serverId: number, userId: number) {
    return request<{ status: string }>(`/servers/${serverId}/members/${userId}`, {
      method: "DELETE"
    });
  },

  async uploadServerAvatar(serverId: number, file: File) {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(`${API_URL}/servers/${serverId}/avatar`, {
      method: "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Server avatar upload failed");
    }

    return (await res.json()) as ServerOut;
  },

  // Server Channels
  listServerChannels(serverId: number) {
    return request<ChannelOut[]>(`/servers/${serverId}/channels`);
  },

  createServerChannel(serverId: number, name: string) {
    return request<ChannelOut>(`/servers/${serverId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name })
    });
  },

  deleteChannel(channelId: number) {
    return request<{ status: string }>(`/channels/${channelId}`, {
      method: "DELETE"
    });
  },

  // Channel Messages
  channelMessages(channelId: number) {
    return request<ChannelMessageOut[]>(`/channels/${channelId}/messages`);
  },

  sendChannelMessage(channelId: number, content: string) {
    return request<ChannelMessageOut>("/messages", {
      method: "POST",
      body: JSON.stringify({ channel_id: channelId, content })
    });
  }
};