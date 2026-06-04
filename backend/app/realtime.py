from __future__ import annotations

from datetime import datetime
from typing import Dict, Set
from urllib.parse import parse_qs

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select

from app.config import JWT_ALGORITHM, JWT_SECRET
from app.db import AsyncSessionLocal
from app.models import Channel, Friendship, Message, Server, ServerMember, User

ws_router = APIRouter()


class ChannelConnectionManager:
    def __init__(self):
        # channel_id -> offene WebSockets
        self.channels: Dict[int, Set[WebSocket]] = {}

        # websocket -> channel_id
        self.socket_channels: Dict[WebSocket, int] = {}

        # websocket -> user_id
        self.socket_users: Dict[WebSocket, int] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        self.socket_users[websocket] = user_id

    def disconnect(self, websocket: WebSocket):
        channel_id = self.socket_channels.pop(websocket, None)

        if channel_id is not None:
            sockets = self.channels.get(channel_id)

            if sockets:
                sockets.discard(websocket)

                if not sockets:
                    self.channels.pop(channel_id, None)

        self.socket_users.pop(websocket, None)

    async def join_channel(self, websocket: WebSocket, channel_id: int):
        old_channel = self.socket_channels.get(websocket)

        if old_channel is not None:
            old_sockets = self.channels.get(old_channel)

            if old_sockets:
                old_sockets.discard(websocket)

                if not old_sockets:
                    self.channels.pop(old_channel, None)

        self.socket_channels[websocket] = channel_id

        if channel_id not in self.channels:
            self.channels[channel_id] = set()

        self.channels[channel_id].add(websocket)

    async def broadcast_channel(self, channel_id: int, payload: dict):
        sockets = list(self.channels.get(channel_id, set()))
        dead: list[WebSocket] = []

        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws)

    async def broadcast_all(self, payload: dict):
        sockets = list(self.socket_users.keys())
        dead: list[WebSocket] = []

        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws)

    async def send_to_user(self, user_id: int, payload: dict):
        sockets = [
            ws
            for ws, uid in self.socket_users.items()
            if uid == user_id
        ]

        dead: list[WebSocket] = []

        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws)

    def online_user_ids(self) -> set[int]:
        return set(self.socket_users.values())

    def is_user_online(self, user_id: int) -> bool:
        return user_id in self.online_user_ids()


manager = ChannelConnectionManager()


def get_token_from_query(query_string: str) -> str:
    try:
        qs = parse_qs(query_string)
        return qs.get("token", [""])[0]
    except Exception:
        return ""


async def get_user_from_token(token: str) -> User | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(User).where(User.id == user_id)
        )

        return result.scalar_one_or_none()


async def user_can_access_channel(user_id: int, channel_id: int) -> bool:
    """
    Prüft, ob der User Mitglied im Server des Channels ist.
    Wichtig: Nicht nur Owner, sondern alle Server-Member dürfen lesen/schreiben.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Channel)
            .join(Server, Server.id == Channel.server_id)
            .join(ServerMember, ServerMember.server_id == Server.id)
            .where(
                Channel.id == channel_id,
                ServerMember.user_id == user_id,
            )
        )

        channel = result.scalar_one_or_none()
        return channel is not None


async def get_channel_server_id(channel_id: int) -> int | None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Channel.server_id).where(Channel.id == channel_id)
        )

        return result.scalar_one_or_none()


async def get_server_member_user_ids(server_id: int) -> list[int]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ServerMember.user_id).where(ServerMember.server_id == server_id)
        )

        return list(result.scalars().all())


async def users_are_friends(user_id: int, friend_id: int) -> bool:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Friendship).where(
                Friendship.user_id == user_id,
                Friendship.friend_id == friend_id,
            )
        )

        return result.scalar_one_or_none() is not None


@ws_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    query_string = websocket.scope.get("query_string", b"").decode()
    token = get_token_from_query(query_string)

    user = await get_user_from_token(token)

    if not user:
        await websocket.close(code=1008)
        return

    await manager.connect(websocket, user.id)

    # Presence live an alle.
    await manager.broadcast_all({
        "type": "presence:update",
        "userId": user.id,
        "online": True,
    })

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            # -------------------------------------------------------
            # Channel join
            # -------------------------------------------------------
            if msg_type == "channel:join":
                try:
                    channel_id = int(data.get("channel_id"))
                except (TypeError, ValueError):
                    continue

                if not await user_can_access_channel(user.id, channel_id):
                    await websocket.send_json({
                        "type": "error",
                        "message": "No access to channel",
                    })
                    continue

                await manager.join_channel(websocket, channel_id)

                await websocket.send_json({
                    "type": "channel:joined",
                    "channel_id": channel_id,
                })

            # -------------------------------------------------------
            # Channel message via WebSocket
            # Optional. Dein REST /messages Endpoint kann weiterhin genutzt werden.
            # Beide Wege senden am Ende channel:message_new.
            # -------------------------------------------------------
            elif msg_type == "message:create":
                try:
                    channel_id = int(data.get("channel_id"))
                except (TypeError, ValueError):
                    continue

                content = str(data.get("content") or "").strip()

                if not content:
                    continue

                if len(content) > 5000:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Message too long",
                    })
                    continue

                if not await user_can_access_channel(user.id, channel_id):
                    await websocket.send_json({
                        "type": "error",
                        "message": "No access to channel",
                    })
                    continue

                async with AsyncSessionLocal() as db:
                    channel_result = await db.execute(
                        select(Channel).where(Channel.id == channel_id)
                    )
                    channel = channel_result.scalar_one_or_none()

                    if not channel:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Channel not found",
                        })
                        continue

                    msg = Message(
                        channel_id=channel_id,
                        author_id=user.id,
                        content=content,
                    )

                    db.add(msg)
                    await db.commit()
                    await db.refresh(msg)

                    payload = {
                        "type": "channel:message_new",
                        "server_id": channel.server_id,
                        "channel_id": msg.channel_id,
                        "message": {
                            "id": msg.id,
                            "channel_id": msg.channel_id,
                            "author_id": user.id,
                            "author": user.username,
                            "content": msg.content,
                            "created_at": (
                                msg.created_at.isoformat()
                                if msg.created_at
                                else datetime.utcnow().isoformat()
                            ),
                        },
                    }

                    members_result = await db.execute(
                        select(ServerMember.user_id).where(
                            ServerMember.server_id == channel.server_id
                        )
                    )
                    member_user_ids = list(members_result.scalars().all())

                for member_user_id in member_user_ids:
                    await manager.send_to_user(member_user_id, payload)

            # -------------------------------------------------------
            # Channel typing
            # -------------------------------------------------------
            elif msg_type == "typing":
                try:
                    channel_id = int(data.get("channel_id"))
                except (TypeError, ValueError):
                    continue

                is_typing = bool(data.get("is_typing", False))

                if not await user_can_access_channel(user.id, channel_id):
                    continue

                server_id = await get_channel_server_id(channel_id)
                if not server_id:
                    continue

                member_user_ids = await get_server_member_user_ids(server_id)

                payload = {
                    "type": "channel:typing",
                    "server_id": server_id,
                    "channel_id": channel_id,
                    "user_id": user.id,
                    "username": user.username,
                    "is_typing": is_typing,
                }

                for member_user_id in member_user_ids:
                    if member_user_id != user.id:
                        await manager.send_to_user(member_user_id, payload)

            # -------------------------------------------------------
            # DM typing
            # -------------------------------------------------------
            elif msg_type == "dm:typing":
                try:
                    receiver_id = int(data.get("receiver_id"))
                except (TypeError, ValueError):
                    continue

                is_typing = bool(data.get("is_typing", False))

                if not await users_are_friends(user.id, receiver_id):
                    continue

                await manager.send_to_user(
                    receiver_id,
                    {
                        "type": "dm:typing",
                        "userId": user.id,
                        "username": user.username,
                        "isTyping": is_typing,
                    },
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket)

        await manager.broadcast_all({
            "type": "presence:update",
            "userId": user.id,
            "online": manager.is_user_online(user.id),
        })