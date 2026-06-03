from __future__ import annotations

from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.db import get_db
from app.models import (
    Channel,
    DirectMessage,
    FriendRequest,
    Friendship,
    Message,
    Server,
    ServerMember,
    User,
)
from app.realtime import manager
from app.schemas import (
    ChannelCreate,
    ChannelOut,
    DirectMessageCreate,
    DirectMessageOut,
    FriendOut,
    FriendRequestCreate,
    FriendRequestOut,
    LoginIn,
    MessageCreate,
    MessageOut,
    RegisterIn,
    ServerCreate,
    ServerDetailOut,
    ServerMemberOut,
    ServerOut,
    TokenOut,
    UserOut,
    UserPublic,
    UserUpdate,
)

router = APIRouter()


# -------------------------------------------------------
# Helpers
# -------------------------------------------------------

async def build_dm_out(msg: DirectMessage, db: AsyncSession) -> DirectMessageOut:
    sender_result = await db.execute(select(User).where(User.id == msg.sender_id))
    sender = sender_result.scalar_one_or_none()

    reply_author = None
    reply_content = None

    if msg.reply_to_id:
        reply_result = await db.execute(
            select(DirectMessage, User.username)
            .join(User, User.id == DirectMessage.sender_id)
            .where(DirectMessage.id == msg.reply_to_id)
        )
        reply_row = reply_result.first()
        if reply_row:
            reply_msg, reply_username = reply_row
            reply_author = reply_username
            reply_content = reply_msg.content[:120]

    return DirectMessageOut(
        id=msg.id,
        sender_id=msg.sender_id,
        receiver_id=msg.receiver_id,
        sender_username=sender.username if sender else "Unknown",
        sender_avatar_url=sender.avatar_url if sender else None,
        content=msg.content,
        created_at=msg.created_at,
        reply_to_id=msg.reply_to_id,
        reply_preview_author=reply_author,
        reply_preview_content=reply_content,
        pinned=bool(msg.pinned),
        pinned_at=msg.pinned_at,
        pinned_by_id=msg.pinned_by_id,
    )


async def ensure_friendship(user_id: int, friend_id: int, db: AsyncSession) -> None:
    result = await db.execute(
        select(Friendship).where(
            Friendship.user_id == user_id,
            Friendship.friend_id == friend_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not friends")


async def ensure_server_member(server_id: int, user_id: int, db: AsyncSession) -> ServerMember:
    result = await db.execute(
        select(ServerMember).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == user_id,
        )
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=403, detail="Not a member")
    return m


async def ensure_server_owner(server_id: int, user_id: int, db: AsyncSession) -> ServerMember:
    m = await ensure_server_member(server_id, user_id, db)
    if m.role != "owner":
        raise HTTPException(status_code=403, detail="Only owner")
    return m


async def ensure_channel_member(channel_id: int, user_id: int, db: AsyncSession) -> int:
    ch_res = await db.execute(select(Channel).where(Channel.id == channel_id))
    ch = ch_res.scalar_one_or_none()
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    await ensure_server_member(ch.server_id, user_id, db)
    return ch.server_id


# -------------------------------------------------------
# Auth
# -------------------------------------------------------

@router.post("/auth/register", response_model=UserOut)
async def register(data: RegisterIn, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.username == data.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(username=data.username, password_hash=hash_password(data.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Default Server + Owner membership + default channel
    server = Server(
        name=f"{user.username}s Server",
        owner_id=user.id,
        avatar_url=None,
        description=None,
    )
    db.add(server)
    await db.commit()
    await db.refresh(server)

    db.add(ServerMember(server_id=server.id, user_id=user.id, role="owner"))
    await db.commit()

    channel = Channel(name="general", server_id=server.id)
    db.add(channel)
    await db.commit()

    return UserOut(
        id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
        bio=user.bio,
    )


@router.post("/auth/login", response_model=TokenOut)
async def login(data: LoginIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid login")

    return TokenOut(access_token=create_access_token(user))


@router.get("/auth/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut(
        id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
        bio=user.bio,
    )


# -------------------------------------------------------
# Servers
# -------------------------------------------------------

@router.post("/servers", response_model=ServerOut)
async def create_server(
    data: ServerCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    srv = Server(
        name=data.name.strip(),
        owner_id=user.id,
        avatar_url=data.avatar_url,
        description=(data.description or "").strip() or None,
    )
    db.add(srv)
    await db.commit()
    await db.refresh(srv)

    db.add(ServerMember(server_id=srv.id, user_id=user.id, role="owner"))
    await db.commit()

    ch = Channel(name="general", server_id=srv.id)
    db.add(ch)
    await db.commit()

    return ServerOut(
        id=srv.id,
        name=srv.name,
        owner_id=srv.owner_id,
        avatar_url=srv.avatar_url,
        description=srv.description,
    )


@router.get("/servers", response_model=list[ServerOut])
async def list_servers(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Server)
        .join(ServerMember, ServerMember.server_id == Server.id)
        .where(ServerMember.user_id == user.id)
        .order_by(Server.name.asc())
    )
    servers = result.scalars().all()

    return [
        ServerOut(
            id=s.id,
            name=s.name,
            owner_id=s.owner_id,
            avatar_url=s.avatar_url,
            description=s.description,
        )
        for s in servers
    ]


@router.get("/servers/{server_id}", response_model=ServerDetailOut)
async def get_server_detail(
    server_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_server_member(server_id, user.id, db)

    srv_res = await db.execute(select(Server).where(Server.id == server_id))
    srv = srv_res.scalar_one_or_none()
    if not srv:
        raise HTTPException(status_code=404, detail="Server not found")

    members_res = await db.execute(
        select(ServerMember, User.username, User.avatar_url)
        .join(User, User.id == ServerMember.user_id)
        .where(ServerMember.server_id == server_id)
        .order_by(User.username.asc())
    )
    rows = members_res.all()

    members = [
        ServerMemberOut(
            id=m.id,
            user_id=m.user_id,
            username=username,
            avatar_url=avatar_url,
            role=m.role,
        )
        for m, username, avatar_url in rows
    ]

    return ServerDetailOut(
        id=srv.id,
        name=srv.name,
        owner_id=srv.owner_id,
        avatar_url=srv.avatar_url,
        description=srv.description,
        members=members,
    )


@router.get("/servers/{server_id}/channels", response_model=list[ChannelOut])
async def list_channels(
    server_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_server_member(server_id, user.id, db)

    result = await db.execute(select(Channel).where(Channel.server_id == server_id))
    channels = result.scalars().all()

    return [
        ChannelOut(id=c.id, server_id=c.server_id, name=c.name)
        for c in channels
    ]


@router.post("/servers/{server_id}/channels", response_model=ChannelOut)
async def create_channel(
    server_id: int,
    data: ChannelCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_server_owner(server_id, user.id, db)

    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Channel name required")

    ch = Channel(name=name, server_id=server_id)
    db.add(ch)
    await db.commit()
    await db.refresh(ch)

    return ChannelOut(id=ch.id, server_id=ch.server_id, name=ch.name)


@router.delete("/channels/{channel_id}")
async def delete_channel(
    channel_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ch_res = await db.execute(select(Channel).where(Channel.id == channel_id))
    ch = ch_res.scalar_one_or_none()
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    await ensure_server_owner(ch.server_id, user.id, db)

    await db.delete(ch)
    await db.commit()
    return {"status": "deleted"}


@router.post("/servers/{server_id}/members")
async def add_server_member(
    server_id: int,
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    friend_id = int(payload.get("user_id", 0))
    if not friend_id:
        raise HTTPException(status_code=400, detail="user_id required")

    await ensure_server_owner(server_id, user.id, db)

    fr = await db.execute(
        select(Friendship).where(
            Friendship.user_id == user.id,
            Friendship.friend_id == friend_id,
        )
    )
    if not fr.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not friends")

    exists = await db.execute(
        select(ServerMember).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == friend_id,
        )
    )
    if exists.scalar_one_or_none():
        return {"status": "already-member"}

    db.add(ServerMember(server_id=server_id, user_id=friend_id, role="member"))
    await db.commit()

    return {"status": "added"}


@router.delete("/servers/{server_id}/members/{member_user_id}")
async def remove_server_member(
    server_id: int,
    member_user_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if member_user_id != user.id:
        await ensure_server_owner(server_id, user.id, db)

    target = await db.execute(
        select(ServerMember).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == member_user_id,
        )
    )
    m = target.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")

    if m.role == "owner":
        raise HTTPException(status_code=400, detail="Owner cannot be removed")

    await db.delete(m)
    await db.commit()
    return {"status": "removed"}


@router.delete("/servers/{server_id}")
async def delete_server(
    server_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    srv_res = await db.execute(select(Server).where(Server.id == server_id))
    srv = srv_res.scalar_one_or_none()
    if not srv:
        raise HTTPException(status_code=404, detail="Server not found")

    if srv.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only owner")

    await db.delete(srv)
    await db.commit()
    return {"status": "deleted"}


@router.post("/servers/{server_id}/avatar", response_model=ServerOut)
async def upload_server_avatar(
    server_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_server_owner(server_id, user.id, db)

    allowed_types = {"image/png": ".png", "image/jpeg": ".jpg"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only PNG and JPG images are allowed")

    content = await file.read()
    max_size = 2 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="Avatar must be smaller than 2MB")

    upload_root = Path(__file__).resolve().parents[1] / "uploads"
    server_dir = upload_root / "servers"
    server_dir.mkdir(parents=True, exist_ok=True)

    ext = allowed_types[file.content_type]
    filename = f"server_{server_id}_{uuid4().hex}{ext}"
    file_path = server_dir / filename
    file_path.write_bytes(content)

    srv_res = await db.execute(select(Server).where(Server.id == server_id))
    srv = srv_res.scalar_one_or_none()
    if not srv:
        raise HTTPException(status_code=404, detail="Server not found")

    srv.avatar_url = f"/uploads/servers/{filename}"
    await db.commit()
    await db.refresh(srv)

    return ServerOut(
        id=srv.id,
        name=srv.name,
        owner_id=srv.owner_id,
        avatar_url=srv.avatar_url,
        description=srv.description,
    )


# -------------------------------------------------------
# Channel Messages
# -------------------------------------------------------

@router.get("/channels/{channel_id}/messages", response_model=list[MessageOut])
async def list_messages(
    channel_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_channel_member(channel_id, user.id, db)

    result = await db.execute(
        select(Message, User.username)
        .join(User, User.id == Message.author_id)
        .where(Message.channel_id == channel_id)
        .order_by(Message.created_at.asc())
        .limit(100)
    )
    rows = result.all()

    return [
        MessageOut(
            id=msg.id,
            channel_id=msg.channel_id,
            author_id=msg.author_id,
            author=username,
            content=msg.content,
            created_at=msg.created_at,
        )
        for msg, username in rows
    ]


@router.post("/messages", response_model=MessageOut)
async def create_message(
    data: MessageCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_channel_member(data.channel_id, user.id, db)

    msg = Message(
        channel_id=data.channel_id,
        author_id=user.id,
        content=data.content,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    return MessageOut(
        id=msg.id,
        channel_id=msg.channel_id,
        author_id=user.id,
        author=user.username,
        content=msg.content,
        created_at=msg.created_at,
    )


# -------------------------------------------------------
# Friends
# -------------------------------------------------------

@router.post("/friends/request")
async def send_friend_request(
    data: FriendRequestCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == data.username))
    receiver = result.scalar_one_or_none()

    if not receiver:
        raise HTTPException(status_code=404, detail="User not found")

    if receiver.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot add yourself")

    existing_friend = await db.execute(
        select(Friendship).where(
            Friendship.user_id == user.id,
            Friendship.friend_id == receiver.id,
        )
    )
    if existing_friend.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already friends")

    existing_request = await db.execute(
        select(FriendRequest).where(
            FriendRequest.sender_id == user.id,
            FriendRequest.receiver_id == receiver.id,
            FriendRequest.status == "pending",
        )
    )
    if existing_request.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Request already sent")

    reverse_request = await db.execute(
        select(FriendRequest).where(
            FriendRequest.sender_id == receiver.id,
            FriendRequest.receiver_id == user.id,
            FriendRequest.status == "pending",
        )
    )
    if reverse_request.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="This user already sent you a request")

    req = FriendRequest(sender_id=user.id, receiver_id=receiver.id, status="pending")
    db.add(req)
    await db.commit()
    await db.refresh(req)

    await manager.send_to_user(
        receiver.id,
        {
            "type": "friend_request:new",
            "request": {
                "id": req.id,
                "sender_id": user.id,
                "sender_username": user.username,
                "created_at": req.created_at.isoformat(),
            },
        },
    )
    return {"status": "sent"}


@router.get("/friends/requests", response_model=list[FriendRequestOut])
async def list_friend_requests(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FriendRequest, User.username)
        .join(User, User.id == FriendRequest.sender_id)
        .where(
            FriendRequest.receiver_id == user.id,
            FriendRequest.status == "pending",
        )
        .order_by(FriendRequest.created_at.desc())
    )
    rows = result.all()

    return [
        FriendRequestOut(
            id=req.id,
            sender_id=req.sender_id,
            sender_username=username,
            created_at=req.created_at,
        )
        for req, username in rows
    ]


@router.post("/friends/requests/{request_id}/accept")
async def accept_friend_request(
    request_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FriendRequest).where(
            FriendRequest.id == request_id,
            FriendRequest.receiver_id == user.id,
            FriendRequest.status == "pending",
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    req.status = "accepted"
    db.add(Friendship(user_id=req.receiver_id, friend_id=req.sender_id))
    db.add(Friendship(user_id=req.sender_id, friend_id=req.receiver_id))
    await db.commit()

    await manager.send_to_user(
        req.sender_id,
        {"type": "friend_request:accepted", "friend": {"id": user.id, "username": user.username}},
    )
    return {"status": "accepted"}


@router.post("/friends/requests/{request_id}/decline")
async def decline_friend_request(
    request_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FriendRequest).where(
            FriendRequest.id == request_id,
            FriendRequest.receiver_id == user.id,
            FriendRequest.status == "pending",
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    req.status = "declined"
    await db.commit()
    return {"status": "declined"}


@router.get("/friends", response_model=list[FriendOut])
async def list_friends(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .join(Friendship, Friendship.friend_id == User.id)
        .where(Friendship.user_id == user.id)
        .order_by(User.username.asc())
    )
    friends = result.scalars().all()

    return [
        FriendOut(
            id=f.id,
            username=f.username,
            online=manager.is_user_online(f.id),
            avatar_url=f.avatar_url,
        )
        for f in friends
    ]


@router.delete("/friends/{friend_id}")
async def remove_friend(
    friend_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if friend_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")

    rel1 = await db.execute(
        select(Friendship).where(
            Friendship.user_id == user.id,
            Friendship.friend_id == friend_id,
        )
    )
    rel2 = await db.execute(
        select(Friendship).where(
            Friendship.user_id == friend_id,
            Friendship.friend_id == user.id,
        )
    )

    r1 = rel1.scalar_one_or_none()
    r2 = rel2.scalar_one_or_none()
    if not r1 or not r2:
        raise HTTPException(status_code=404, detail="Not friends")

    await db.delete(r1)
    await db.delete(r2)
    await db.commit()

    await manager.send_to_user(friend_id, {"type": "friend:removed", "userId": user.id})
    return {"status": "removed"}


# -------------------------------------------------------
# Direct Messages
# -------------------------------------------------------

@router.get("/dm/{friend_id}", response_model=list[DirectMessageOut])
async def list_direct_messages(
    friend_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_friendship(user.id, friend_id, db)

    result = await db.execute(
        select(DirectMessage)
        .where(
            or_(
                and_(DirectMessage.sender_id == user.id, DirectMessage.receiver_id == friend_id),
                and_(DirectMessage.sender_id == friend_id, DirectMessage.receiver_id == user.id),
            )
        )
        .order_by(DirectMessage.created_at.asc())
        .limit(100)
    )
    messages = result.scalars().all()
    return [await build_dm_out(msg, db) for msg in messages]


@router.post("/dm", response_model=DirectMessageOut)
async def create_direct_message(
    data: DirectMessageCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await ensure_friendship(user.id, data.receiver_id, db)

    if data.reply_to_id:
        reply_check = await db.execute(
            select(DirectMessage).where(
                DirectMessage.id == data.reply_to_id,
                or_(
                    and_(DirectMessage.sender_id == user.id, DirectMessage.receiver_id == data.receiver_id),
                    and_(DirectMessage.sender_id == data.receiver_id, DirectMessage.receiver_id == user.id),
                ),
            )
        )
        if not reply_check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Invalid reply target")

    msg = DirectMessage(
        sender_id=user.id,
        receiver_id=data.receiver_id,
        content=data.content,
        reply_to_id=data.reply_to_id,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    out = await build_dm_out(msg, db)
    payload_message = out.model_dump(mode="json")
    payload = {"type": "dm:new", "message": payload_message}

    await manager.send_to_user(data.receiver_id, payload)
    await manager.send_to_user(user.id, payload)

    return out


@router.delete("/dm/{message_id}")
async def delete_direct_message(
    message_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(DirectMessage).where(DirectMessage.id == message_id))
    msg = result.scalar_one_or_none()

    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    if msg.sender_id != user.id:
        raise HTTPException(status_code=403, detail="Only own messages can be deleted")

    receiver_id = msg.receiver_id
    sender_id = msg.sender_id

    await db.delete(msg)
    await db.commit()

    payload = {"type": "dm:delete", "messageId": message_id}
    await manager.send_to_user(receiver_id, payload)
    await manager.send_to_user(sender_id, payload)

    return {"status": "deleted"}


@router.post("/dm/{message_id}/pin", response_model=DirectMessageOut)
async def toggle_pin_direct_message(
    message_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(DirectMessage).where(DirectMessage.id == message_id))
    msg = result.scalar_one_or_none()

    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    other_id = msg.receiver_id if msg.sender_id == user.id else msg.sender_id
    await ensure_friendship(user.id, other_id, db)

    msg.pinned = not bool(msg.pinned)

    if msg.pinned:
        msg.pinned_at = datetime.utcnow()
        msg.pinned_by_id = user.id
    else:
        msg.pinned_at = None
        msg.pinned_by_id = None

    await db.commit()
    await db.refresh(msg)

    out = await build_dm_out(msg, db)
    payload_message = out.model_dump(mode="json")
    payload = {"type": "dm:pin", "message": payload_message}

    await manager.send_to_user(msg.sender_id, payload)
    await manager.send_to_user(msg.receiver_id, payload)

    return out


# -------------------------------------------------------
# Users
# -------------------------------------------------------

@router.patch("/users/me", response_model=UserOut)
async def update_me(
    data: UserUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    new_username = data.username.strip()
    if len(new_username) < 3:
        raise HTTPException(status_code=400, detail="Username too short")

    if new_username != user.username:
        existing = await db.execute(select(User).where(User.username == new_username))
        existing_user = existing.scalar_one_or_none()
        if existing_user and existing_user.id != user.id:
            raise HTTPException(status_code=400, detail="Username already exists")
        user.username = new_username

    bio_clean = (data.bio or "").strip()
    user.bio = bio_clean if bio_clean else None

    await db.commit()
    await db.refresh(user)

    await manager.broadcast_all({
        "type": "profile:update",
        "user": {
            "id": user.id,
            "username": user.username,
            "avatar_url": user.avatar_url,
            "bio": user.bio,
        },
    })

    return UserOut(
        id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
        bio=user.bio,
    )


@router.post("/users/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    allowed_types = {"image/png": ".png", "image/jpeg": ".jpg"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only PNG and JPG images are allowed")

    content = await file.read()
    max_size = 2 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(status_code=400, detail="Avatar must be smaller than 2MB")

    upload_root = Path(__file__).resolve().parents[1] / "uploads"
    avatar_dir = upload_root / "avatars"
    avatar_dir.mkdir(parents=True, exist_ok=True)

    ext = allowed_types[file.content_type]
    filename = f"user_{user.id}_{uuid4().hex}{ext}"
    file_path = avatar_dir / filename
    file_path.write_bytes(content)

    user.avatar_url = f"/uploads/avatars/{filename}"
    await db.commit()
    await db.refresh(user)

    await manager.broadcast_all({
        "type": "profile:update",
        "user": {
            "id": user.id,
            "username": user.username,
            "avatar_url": user.avatar_url,
            "bio": user.bio,
        },
    })

    return UserOut(
        id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
        bio=user.bio,
    )


@router.get("/users/{user_id}", response_model=UserPublic)
async def get_user_public(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()

    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    return UserPublic(
        id=u.id,
        username=u.username,
        avatar_url=u.avatar_url,
        bio=u.bio,
    )