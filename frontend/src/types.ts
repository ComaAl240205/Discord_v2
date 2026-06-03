export type User = {
  id: number;
  username: string;
  avatar_url?: string | null;
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