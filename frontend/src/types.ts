export type User = {
  id: number;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
};

export type Friend = {
  id: number;
  username: string;
  online: boolean;
  avatar_url?: string | null;
};

export type FriendRequest = {
  id: number;
  sender_id: number;
  sender_username: string;
  created_at: string;
};

export type DirectMessage = {
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

/* -----------------------------
   Server / Channels
----------------------------- */

export type Server = {
  id: number;
  name: string;
  owner_id: number;
  avatar_url?: string | null;
  description?: string | null;
};

export type ServerMember = {
  id: number;
  user_id: number;
  username: string;
  avatar_url?: string | null;
  role: string; // "owner" | "member"
};

export type ServerDetail = Server & {
  members: ServerMember[];
};

export type Channel = {
  id: number;
  server_id: number;
  name: string;
};

export type ChannelMessage = {
  id: number;
  channel_id: number;
  author_id: number;
  author: string;
  content: string;
  created_at: string;
};

export type UserPublic = {
  id: number;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
};