from datetime import datetime
from pydantic import BaseModel, Field

class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6, max_length=200)

class LoginIn(BaseModel):
    username: str
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: int
    username: str
    avatar_url: str | None = None

class ServerOut(BaseModel):
    id: int
    name: str
    owner_id: int

class ChannelOut(BaseModel):
    id: int
    server_id: int
    name: str

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

class UserUpdate(BaseModel):
    username: str = Field(min_length=3, max_length=32)