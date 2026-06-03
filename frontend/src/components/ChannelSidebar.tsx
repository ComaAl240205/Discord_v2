import { Check, Hash, Plus, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppStore } from "../store";
import type { Channel } from "../types";
import { API_URL } from "../api";

function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

export function ChannelSidebar() {
  const [username, setUsername] = useState("");
  const [newChannelName, setNewChannelName] = useState("");

  const user = useAppStore((s) => s.user);

  // DM
  const friends = useAppStore((s) => s.friends);
  const requests = useAppStore((s) => s.requests);
  const activeFriendId = useAppStore((s) => s.activeFriendId);
  const unreadByFriend = useAppStore((s) => s.unreadByFriend);

  // Server
  const activeServerId = useAppStore((s) => s.activeServerId);
  const serverDetail = useAppStore((s) => s.serverDetail);
  const serverChannels = useAppStore((s) => s.serverChannels);
  const activeChannelId = useAppStore((s) => s.activeChannelId);

  // Actions
  const sendFriendRequest = useAppStore((s) => s.sendFriendRequest);
  const acceptRequest = useAppStore((s) => s.acceptRequest);
  const declineRequest = useAppStore((s) => s.declineRequest);
  const openDm = useAppStore((s) => s.openDm);
  const openProfile = useAppStore((s) => s.openProfile);
  const removeFriend = useAppStore((s) => s.removeFriend);

  const addMemberToServer = useAppStore((s) => s.addMemberToServer);
  const removeMemberFromServer = useAppStore((s) => s.removeMemberFromServer);
  const deleteActiveServer = useAppStore((s) => s.deleteActiveServer);

  const loadServerChannels = useAppStore((s) => s.loadServerChannels);
  const selectChannel = useAppStore((s) => s.selectChannel);
  const createChannel = useAppStore((s) => s.createChannel);
  const deleteChannel = useAppStore((s) => s.deleteChannel);

  const error = useAppStore((s) => s.error);
  const info = useAppStore((s) => s.info);

  async function handleAddFriend() {
    await sendFriendRequest(username);
    setUsername("");
  }

  const isServerMode = Boolean(activeServerId);

  const isOwner = useMemo(() => {
    if (!isServerMode || !serverDetail || !user) return false;
    return serverDetail.owner_id === user.id;
  }, [isServerMode, serverDetail, user]);

  const inviteableFriends = useMemo(() => {
    if (!isServerMode || !serverDetail) return [];
    const memberIds = new Set(serverDetail.members.map((m) => m.user_id));
    return friends.filter((f) => !memberIds.has(f.id));
  }, [isServerMode, serverDetail, friends]);

  async function onCreateChannel() {
    const name = newChannelName.trim();
    if (!name) return;
    await createChannel(name);
    setNewChannelName("");
    await loadServerChannels();
  }

  if (isServerMode) {
    return (
      <aside className="channel-sidebar">
        <header className="server-header">
          <strong>{serverDetail?.name ?? "Server"}</strong>
        </header>

        <section className="channel-section">
          {serverDetail?.description ? <div className="side-info">{serverDetail.description}</div> : null}
          {info && <div className="side-info">{info}</div>}
          {error && <div className="side-error">{error}</div>}

          <p className="section-title">Channels</p>

          {serverChannels.length === 0 ? (
            <div className="empty-small">Keine Channels</div>
          ) : (
            serverChannels.map((ch: Channel) => (
              <div
                key={ch.id}
                className={"friend-row " + (activeChannelId === ch.id ? "active" : "")}
              >
                <button
                  className="friend-item"
                  type="button"
                  onClick={() => void selectChannel(ch.id)}
                >
                  <div className="friend-avatar" style={{ width: 28, height: 28 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 10, background: "#313338" }}>
                      <Hash size={14} />
                    </span>
                  </div>

                  <span className="friend-name-row">
                    <span className="friend-name">{ch.name}</span>
                  </span>
                </button>

                {isOwner && (
                  <button
                    type="button"
                    className="friend-remove"
                    title="Channel löschen"
                    onClick={() => void deleteChannel(ch.id)}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))
          )}

          {isOwner && (
            <>
              <p className="section-title">Channel erstellen</p>

              <div className="friend-add-box">
                <input
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="channel-name"
                  autoComplete="off"
                />
                <button onClick={() => void onCreateChannel()} title="Erstellen">
                  <Plus size={17} />
                </button>
              </div>

              <p className="section-title">Freunde hinzufügen</p>

              {inviteableFriends.length === 0 ? (
                <div className="empty-small">Keine Freunde verfügbar</div>
              ) : (
                inviteableFriends.map((f) => (
                  <div key={f.id} className="request-row">
                    <span>{f.username}</span>
                    <button title="Hinzufügen" onClick={() => void addMemberToServer(f.id)}>
                      <Plus size={14} />
                    </button>
                  </div>
                ))
              )}

              <p className="section-title">Server</p>
              <button className="server-danger-btn" onClick={() => void deleteActiveServer()}>
                Server löschen
              </button>
            </>
          )}

          <p className="section-title">Mitglieder</p>

          {serverDetail?.members?.length ? (
            serverDetail.members.map((m) => {
              const canKick = isOwner && m.role !== "owner";
              return (
                <div key={m.id} className="request-row">
                  <span>
                    {m.username} {m.role === "owner" ? "(Owner)" : ""}
                  </span>

                  {canKick ? (
                    <button
                      title="Entfernen"
                      onClick={() => void removeMemberFromServer(m.user_id)}
                      style={{ background: "#da373c" }}
                    >
                      <X size={14} />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              );
            })
          ) : (
            <div className="empty-small">Keine Mitglieder</div>
          )}
        </section>
      </aside>
    );
  }

  return (
    <aside className="channel-sidebar">
      <header className="server-header">
        <strong>Freunde</strong>
      </header>

      <section className="channel-section">
        <p className="section-title">Freund hinzufügen</p>

        <div className="friend-add-box">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="off"
          />

          <button onClick={handleAddFriend} title="Anfrage senden">
            <UserPlus size={17} />
          </button>
        </div>

        {info && <div className="side-info">{info}</div>}
        {error && <div className="side-error">{error}</div>}

        <p className="section-title">Anfragen</p>

        {requests.length === 0 && <div className="empty-small">Keine Anfragen</div>}

        {requests.map((req) => (
          <div key={req.id} className="request-row">
            <span>{req.sender_username}</span>

            <button onClick={() => acceptRequest(req.id)} title="Annehmen">
              <Check size={15} />
            </button>

            <button onClick={() => declineRequest(req.id)} title="Ablehnen">
              <X size={15} />
            </button>
          </div>
        ))}

        <p className="section-title">Direktnachrichten</p>

        {friends.length === 0 && <div className="empty-small">Noch keine Freunde</div>}

        {friends.map((friend) => {
          const avatar = assetUrl(friend.avatar_url ?? null);
          const unread = unreadByFriend?.[friend.id] ?? 0;

          return (
            <div
              key={friend.id}
              className={"friend-row " + (activeFriendId === friend.id ? "active" : "")}
            >
              <button className="friend-item" onClick={() => void openDm(friend.id)} type="button">
                <div
                  className="friend-avatar"
                  onClick={(e) => {
                    e.stopPropagation();
                    void openProfile(friend.id);
                  }}
                  title="Profil ansehen"
                  role="button"
                >
                  {avatar ? <img src={avatar} alt="avatar" /> : <span>{friend.username.slice(0, 2).toUpperCase()}</span>}
                  <span className={"status-dot " + (friend.online ? "online" : "offline")} />
                </div>

                <span className="friend-name-row">
                  <span className="friend-name">{friend.username}</span>
                  {unread > 0 && <span className="friend-unread">{unread}</span>}
                </span>
              </button>

              <button
                type="button"
                className="friend-remove"
                title="Freund entfernen"
                onClick={() => void removeFriend(friend.id)}
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </section>
    </aside>
  );
}