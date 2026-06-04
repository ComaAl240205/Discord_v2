from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models import Channel, Friendship, Message, Server, ServerMember, User
from app.realtime import manager

router_2 = APIRouter()


# -----------------------------
# Schemas (local, damit schemas.py nicht angefasst werden muss)
# -----------------------------

class ServerSettingsUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str | None = Field(default=None, max_length=280)


class ChannelCreate2(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class InviteMember2(BaseModel):
    user_id: int


class RoleUpdate2(BaseModel):
    role: str = Field(pattern="^(admin|member)$")


# -----------------------------
# Helpers
# -----------------------------

async def _get_server(db: AsyncSession, server_id: int) -> Server:
    res = await db.execute(select(Server).where(Server.id == server_id))
    srv = res.scalar_one_or_none()
    if not srv:
        raise HTTPException(status_code=404, detail="Server not found")
    return srv


async def _get_members(db: AsyncSession, server_id: int) -> list[ServerMember]:
    res = await db.execute(select(ServerMember).where(ServerMember.server_id == server_id))
    return list(res.scalars().all())


async def _get_member(db: AsyncSession, server_id: int, user_id: int) -> ServerMember | None:
    res = await db.execute(
        select(ServerMember).where(
            ServerMember.server_id == server_id,
            ServerMember.user_id == user_id,
        )
    )
    return res.scalar_one_or_none()


def _is_admin_role(role: str) -> bool:
    return role in ("owner", "admin")


async def _require_admin(db: AsyncSession, server_id: int, user_id: int) -> ServerMember:
    m = await _get_member(db, server_id, user_id)
    if not m:
        raise HTTPException(status_code=403, detail="Not a member")
    if not _is_admin_role(m.role):
        raise HTTPException(status_code=403, detail="Only owner/admin")
    return m


async def _require_owner(db: AsyncSession, server_id: int, user_id: int) -> ServerMember:
    m = await _get_member(db, server_id, user_id)
    if not m:
        raise HTTPException(status_code=403, detail="Not a member")
    if m.role != "owner":
        raise HTTPException(status_code=403, detail="Only owner")
    return m


async def _broadcast_to_server(db: AsyncSession, server_id: int, payload: dict) -> None:
    members = await _get_members(db, server_id)
    for m in members:
        await manager.send_to_user(m.user_id, payload)

async def _build_member_payload(db: AsyncSession, member: ServerMember) -> dict:
    user_res = await db.execute(select(User).where(User.id == member.user_id))
    u = user_res.scalar_one_or_none()

    return {
        "id": member.id,
        "user_id": member.user_id,
        "username": u.username if u else "Unknown",
        "avatar_url": u.avatar_url if u else None,
        "role": member.role,
    }


async def _build_server_payload(db: AsyncSession, server_id: int) -> dict:
    srv = await _get_server(db, server_id)

    return {
        "id": srv.id,
        "name": srv.name,
        "owner_id": srv.owner_id,
        "avatar_url": srv.avatar_url,
        "description": srv.description,
    }


# -----------------------------
# Realtime Events (Types)
# server:updated
# server:deleted
# server:member_added
# server:member_removed
# server:channel_created
# server:channel_deleted
# server:role_updated
# -----------------------------


@router_2.patch("/servers/{server_id}/settings")
async def update_server_settings(
    server_id: int,
    data: ServerSettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, server_id, user.id)

    srv = await _get_server(db, server_id)
    srv.name = data.name.strip()
    srv.description = (data.description or "").strip() or None

    await db.commit()
    await db.refresh(srv)

    payload = {
        "type": "server:updated",
        "server": {
            "id": srv.id,
            "name": srv.name,
            "description": srv.description,
            "avatar_url": srv.avatar_url,
            "owner_id": srv.owner_id,
        },
    }
    await _broadcast_to_server(db, srv.id, payload)

    return {"status": "updated"}


@router_2.post("/servers/{server_id}/settings/avatar")
async def update_server_avatar(
    server_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, server_id, user.id)

    allowed_types = {"image/png": ".png", "image/jpeg": ".jpg"}
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Only PNG/JPG allowed")

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Avatar must be smaller than 2MB")

    upload_root = Path(__file__).resolve().parents[1] / "uploads"
    server_dir = upload_root / "servers"
    server_dir.mkdir(parents=True, exist_ok=True)

    ext = allowed_types[file.content_type]
    filename = f"server_{server_id}_{uuid4().hex}{ext}"
    file_path = server_dir / filename
    file_path.write_bytes(content)

    srv = await _get_server(db, server_id)
    srv.avatar_url = f"/uploads/servers/{filename}"

    await db.commit()
    await db.refresh(srv)

    payload = {
        "type": "server:updated",
        "server": {
            "id": srv.id,
            "name": srv.name,
            "description": srv.description,
            "avatar_url": srv.avatar_url,
            "owner_id": srv.owner_id,
        },
    }
    await _broadcast_to_server(db, srv.id, payload)

    return {"status": "updated"}


@router_2.post("/servers/{server_id}/members/invite")
async def invite_member(
    server_id: int,
    data: InviteMember2,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, server_id, user.id)

    friend_id = int(data.user_id)
    if friend_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot invite yourself")

    fr = await db.execute(
        select(Friendship).where(
            Friendship.user_id == user.id,
            Friendship.friend_id == friend_id,
        )
    )
    if not fr.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not friends")

    exists = await _get_member(db, server_id, friend_id)
    if exists:
        return {"status": "already-member"}

    member = ServerMember(server_id=server_id, user_id=friend_id, role="member")
    db.add(member)
    await db.commit()
    await db.refresh(member)

    member_payload = await _build_member_payload(db, member)
    server_payload = await _build_server_payload(db, server_id)

    payload = {
        "type": "server:member_added",
        "server_id": server_id,
        "user_id": friend_id,
        "member": member_payload,
        "server": server_payload,
    }

    await _broadcast_to_server(db, server_id, payload)

    return {"status": "added", "member": member_payload}


@router_2.delete("/servers/{server_id}/members/{member_user_id}")
async def kick_member(
    server_id: int,
    member_user_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, server_id, user.id)

    target = await _get_member(db, server_id, member_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    if target.role == "owner":
        raise HTTPException(status_code=400, detail="Owner cannot be removed")

    await db.delete(target)
    await db.commit()

    payload = {
        "type": "server:member_removed",
        "server_id": server_id,
        "user_id": member_user_id,
    }
    await _broadcast_to_server(db, server_id, payload)

    return {"status": "removed"}


@router_2.post("/servers/{server_id}/channels/create")
async def create_channel_2(
    server_id: int,
    data: ChannelCreate2,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_admin(db, server_id, user.id)

    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Channel name required")

    ch = Channel(server_id=server_id, name=name)
    db.add(ch)
    await db.commit()
    await db.refresh(ch)

    payload = {
        "type": "server:channel_created",
        "server_id": server_id,
        "channel": {"id": ch.id, "server_id": ch.server_id, "name": ch.name},
    }
    await _broadcast_to_server(db, server_id, payload)

    return {"status": "created", "channel": payload["channel"]}


@router_2.delete("/channels_2/{channel_id}")
async def delete_channel_2(
    channel_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ch_res = await db.execute(select(Channel).where(Channel.id == channel_id))
    ch = ch_res.scalar_one_or_none()
    if not ch:
        raise HTTPException(status_code=404, detail="Channel not found")

    await _require_admin(db, ch.server_id, user.id)

    server_id = ch.server_id
    await db.delete(ch)
    await db.commit()

    payload = {
        "type": "server:channel_deleted",
        "server_id": server_id,
        "channel_id": channel_id,
    }
    await _broadcast_to_server(db, server_id, payload)

    return {"status": "deleted"}


@router_2.patch("/servers/{server_id}/roles/{member_user_id}")
async def set_role_2(
    server_id: int,
    member_user_id: int,
    data: RoleUpdate2,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_owner(db, server_id, user.id)

    target = await _get_member(db, server_id, member_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    if target.role == "owner":
        raise HTTPException(status_code=400, detail="Owner role cannot be changed")

    target.role = data.role
    await db.commit()
    await db.refresh(target)

    member_payload = await _build_member_payload(db, target)

    payload = {
        "type": "server:role_updated",
        "server_id": server_id,
        "user_id": member_user_id,
        "role": data.role,
        "member": member_payload,
    }

    await _broadcast_to_server(db, server_id, payload)

    return {"status": "updated", "member": member_payload}


@router_2.delete("/servers/{server_id}/delete_2")
async def delete_server_2(
    server_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Nur Owner darf Server löschen
    await _require_owner(db, server_id, user.id)

    # Server muss existieren
    srv = await _get_server(db, server_id)

    # Vor dem Löschen alle Member-IDs merken,
    # damit wir danach noch Realtime-Event senden können.
    members = await _get_members(db, server_id)
    member_user_ids = [m.user_id for m in members]

    # Alle Channel IDs dieses Servers holen
    channel_ids_result = await db.execute(
        select(Channel.id).where(Channel.server_id == server_id)
    )
    channel_ids = list(channel_ids_result.scalars().all())

    # WICHTIG:
    # Erst Messages löschen, dann Channels, dann Members, dann Server.
    # Sonst versucht SQLAlchemy ggf. channel.server_id auf NULL zu setzen.
    if channel_ids:
        await db.execute(
            delete(Message).where(Message.channel_id.in_(channel_ids))
        )

    await db.execute(
        delete(Channel).where(Channel.server_id == server_id)
    )

    await db.execute(
        delete(ServerMember).where(ServerMember.server_id == server_id)
    )

    await db.execute(
        delete(Server).where(Server.id == server_id)
    )

    await db.commit()

    payload = {
        "type": "server:deleted",
        "server_id": server_id,
    }

    # Nach dem Commit an alle alten Server-Mitglieder schicken.
    for member_user_id in member_user_ids:
        await manager.send_to_user(member_user_id, payload)

    return {"status": "deleted"}