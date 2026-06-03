export const API_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

function getToken() {
  return localStorage.getItem("token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, 15000);

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
      throw new Error("Request timeout. Dev Tunnel hat nicht rechtzeitig geantwortet.");
    }

    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const api = {
  // -----------------------------
  // Auth
  // -----------------------------
  register(username: string, password: string) {
    return request<{
      id: number;
      username: string;
      avatar_url?: string | null;
    }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username,
        password
      })
    });
  },

  login(username: string, password: string) {
    return request<{
      access_token: string;
      token_type: string;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username,
        password
      })
    });
  },

  me() {
    return request<{
      id: number;
      username: string;
      avatar_url?: string | null;
    }>("/auth/me");
  },

  // -----------------------------
  // Settings / User
  // -----------------------------
updateMe(username: string) {
  return request<{
    id: number;
    username: string;
    avatar_url?: string | null;
  }>("/users/me", {
    method: "PATCH",
    body: JSON.stringify({ username })
  });
},

async uploadAvatar(file: File) {
  const token = localStorage.getItem("token");
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

  return res.json() as Promise<{
    id: number;
    username: string;
    avatar_url?: string | null;
  }>;
},

  // -----------------------------
  // Friends
  // -----------------------------
  friends() {
    return request<
      {
        id: number;
        username: string;
        online: boolean;
        avatar_url?: string | null;
      }[]
    >("/friends");
  },

  friendRequests() {
    return request<
      {
        id: number;
        sender_id: number;
        sender_username: string;
        created_at: string;
      }[]
    >("/friends/requests");
  },

  sendFriendRequest(username: string) {
    return request<{
      status: string;
    }>("/friends/request", {
      method: "POST",
      body: JSON.stringify({
        username
      })
    });
  },

  acceptFriendRequest(id: number) {
    return request<{
      status: string;
    }>(`/friends/requests/${id}/accept`, {
      method: "POST"
    });
  },

  declineFriendRequest(id: number) {
    return request<{
      status: string;
    }>(`/friends/requests/${id}/decline`, {
      method: "POST"
    });
  },

  // -----------------------------
  // Direct Messages
  // -----------------------------
  directMessages(friendId: number) {
    return request<
      {
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
      }[]
    >(`/dm/${friendId}`);
  },

  sendDirectMessage(
    receiverId: number,
    content: string,
    replyToId?: number | null
  ) {
    return request<{
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
    }>("/dm", {
      method: "POST",
      body: JSON.stringify({
        receiver_id: receiverId,
        content,
        reply_to_id: replyToId ?? null
      })
    });
  },

  deleteDirectMessage(messageId: number) {
    return request<{
      status: string;
    }>(`/dm/${messageId}`, {
      method: "DELETE"
    });
  },

  togglePinDirectMessage(messageId: number) {
    return request<{
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
    }>(`/dm/${messageId}/pin`, {
      method: "POST"
    });
  }
};