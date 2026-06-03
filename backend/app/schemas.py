from datetime import datetime
from pydantic import BaseModel, Field


# -----------------------------
# Auth
# -----------------------------

class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6, max_length=200)


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


# -----------------------------
# User
# -----------------------------

class UserOut(BaseModel):
    id: int
    username: str
    avatar_url: str | None = None
    bio: str | None = None


class UserPublic(BaseModel):
    id: int
    username: str
    avatar_url: str | None = None
    bio: str | None = None


class UserUpdate(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    bio: str | None = Field(default=None, max_length=280)


# -----------------------------
# Servers
# -----------------------------

class ServerCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=280)
    avatar_url: str | None = None


class ServerOut(BaseModel):
    id: int
    name: str
    owner_id: int
    avatar_url: str | None = None
    description: str | None = None


class ServerMemberOut(BaseModel):
    id: int
    user_id: int
    username: str
    avatar_url: str | None = None
    role: str


class ServerDetailOut(BaseModel):
    id: int
    name: str
    owner_id: int
    avatar_url: str | None = None
    description: str | None = None
    members: list[ServerMemberOut]


# -----------------------------
# Channels
# -----------------------------

class ChannelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class ChannelOut(BaseModel):
    id: int
    server_id: int
    name: str


# -----------------------------
# Channel Messages
# -----------------------------

class MessageCreate(BaseModel):
    channel_id: int
    content: str = Field(min_length=1, max_length=5000)


class MessageOut(BaseModel):
    id: int
    channel_id: int
    author_id: int
    author: str
    content: str
    created_at: datetime


# -----------------------------
# Friends
# -----------------------------

class FriendRequestCreate(BaseModel):
    username: str = Field(min_length=3, max_length=32)


class FriendRequestOut(BaseModel):
    id: int
    sender_id: int
    sender_username: str
    created_at: datetime


class FriendOut(BaseModel):
    id: int
    username: str
    online: bool = False
    avatar_url: str | None = None


# -----------------------------
# Direct Messages
# -----------------------------

class DirectMessageCreate(BaseModel):
    receiver_id: int
    content: str = Field(min_length=1, max_length=5000)
    reply_to_id: int | None = None


class DirectMessageOut(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    sender_username: str
    sender_avatar_url: str | None = None
    content: str
    created_at: datetime

    reply_to_id: int | None = None
    reply_preview_author: str | None = None
    reply_preview_content: str | None = None

    pinned: bool = False
    pinned_at: datetime | None = None
    pinned_by_id: int | None = None
