import { Check, Hash, Plus, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppStore } from "../store";
import { useServerStore } from "../store_2";
import type { Channel } from "../types";
import { API_URL } from "../api";
import { ServerSettingsButton } from "./ServerSettingsButton";

function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

type ChannelSidebarProps = {
  open?: boolean;
  onOpenServerSettings: () => void;
  onClose?: () => void;
};

export function ChannelSidebar({ onOpenServerSettings, onClose }: ChannelSidebarProps) {
  const [username, setUsername] = useState("");
  const [newChannelName, setNewChannelName] = useState("");

  /* App Store: User, Friends, DM */
  const user = useAppStore((s) => s.user);
  const friends = useAppStore((s) => s.friends);
  const requests = useAppStore((s) => s.requests);
  const activeFriendId = useAppStore((s) => s.activeFriendId);
  const unreadByFriend = useAppStore((s) => s.unreadByFriend);

  const sendFriendRequest = useAppStore((s) => s.sendFriendRequest);
  const acceptRequest = useAppStore((s) => s.acceptRequest);
  const declineRequest = useAppStore((s) => s.declineRequest);
  const openDm = useAppStore((s) => s.openDm);
  const openProfile = useAppStore((s) => s.openProfile);
  const removeFriend = useAppStore((s) => s.removeFriend);

  const error = useAppStore((s) => s.error);
  const info = useAppStore((s) => s.info);

  /* Server Store: Server, Channels, Members */
  const activeServerId = useServerStore((s) => s.activeServerId);
  const serverDetail = useServerStore((s) => s.serverDetail);
  const serverChannels = useServerStore((s) => s.serverChannels);
  const activeChannelId = useServerStore((s) => s.activeChannelId);

  const selectChannel = useServerStore((s) => s.selectChannel);
  const createChannel = useServerStore((s) => s.createChannel);
  const deleteChannel = useServerStore((s) => s.deleteChannel);
  const addMemberToServer = useServerStore((s) => s.addMemberToServer);
  const removeMemberFromServer = useServerStore((s) => s.removeMemberFromServer);

  async function handleAddFriend() {
    await sendFriendRequest(username);
    setUsername("");
  }

  async function onCreateChannel() {
    const name = newChannelName.trim();
    if (!name) return;

    await createChannel(name);
    setNewChannelName("");
  }

  const isServerMode = Boolean(activeServerId);

  const myRole = useMemo(() => {
    if (!isServerMode || !serverDetail || !user) return "member";

    const member = serverDetail.members.find((m) => m.user_id === user.id);
    return member?.role ?? "member";
  }, [isServerMode, serverDetail, user]);

  const canManageServer = myRole === "owner" || myRole === "admin";

  const inviteableFriends = useMemo(() => {
    if (!isServerMode || !serverDetail) return [];

    const memberIds = new Set(serverDetail.members.map((m) => m.user_id));
    return friends.filter((f) => !memberIds.has(f.id));
  }, [isServerMode, serverDetail, friends]);

  /* ==========================================================================
     Server Mode
     ========================================================================== */

  if (isServerMode) {
    return (
      <aside className="channel-sidebar">
        <header className="server-header server-header-with-action">
          <strong>{serverDetail?.name ?? "Server"}</strong>
          <ServerSettingsButton onClick={onOpenServerSettings} />
        </header>

        <section className="channel-section">
          {serverDetail?.description ? (
            <div className="side-info">{serverDetail.description}</div>
          ) : null}

          {info && <div className="side-info">{info}</div>}
          {error && <div className="side-error">{error}</div>}

          <p className="section-title">Channels</p>

          {serverChannels.length === 0 ? (
            <div className="empty-small">Keine Channels</div>
          ) : (
            serverChannels.map((ch: Channel) => (
              <div
                key={ch.id}
                className={
                  "friend-row " + (activeChannelId === ch.id ? "active" : "")
                }
              >
                <button
                  className="friend-item"
                  type="button"
                  onClick={() => {
                    void selectChannel(ch.id);
                    onClose?.();
                  }}
                >
                  <div
                    className="friend-avatar"
                    style={{ width: 28, height: 28 }}
                  >
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 10,
                        background: "#313338"
                      }}
                    >
                      <Hash size={14} />
                    </span>
                  </div>

                  <span className="friend-name-row">
                    <span className="friend-name">{ch.name}</span>
                  </span>
                </button>

                {canManageServer && (
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

          {canManageServer && (
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

                    <button
                      title="Hinzufügen"
                      onClick={() => void addMemberToServer(f.id)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                ))
              )}
            </>
          )}

          <p className="section-title">Mitglieder</p>

          {serverDetail?.members?.length ? (
            serverDetail.members.map((m) => {
              const canKick =
                canManageServer && m.role !== "owner" && m.user_id !== user?.id;

              return (
                <div key={m.id} className="request-row">
                  <span>
                    {m.username}{" "}
                    {m.role === "owner"
                      ? "(Owner)"
                      : m.role === "admin"
                        ? "(Admin)"
                        : ""}
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

  /* ==========================================================================
     DM Mode
     ========================================================================== */

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

        {requests.length === 0 && (
          <div className="empty-small">Keine Anfragen</div>
        )}

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

        {friends.length === 0 && (
          <div className="empty-small">Noch keine Freunde</div>
        )}

        {friends.map((friend) => {
          const avatar = assetUrl(friend.avatar_url ?? null);
          const unread = unreadByFriend?.[friend.id] ?? 0;

          return (
            <div
              key={friend.id}
              className={
                "friend-row " + (activeFriendId === friend.id ? "active" : "")
              }
            >
              <button
                className="friend-item"
                onClick={() => {
                  void openDm(friend.id);
                  onClose?.();
                }}
                type="button"
              >
                <div
                  className="friend-avatar"
                  onClick={(e) => {
                    e.stopPropagation();
                    void openProfile(friend.id);
                  }}
                  title="Profil ansehen"
                  role="button"
                >
                  {avatar ? (
                    <img src={avatar} alt="avatar" />
                  ) : (
                    <span>{friend.username.slice(0, 2).toUpperCase()}</span>
                  )}

                  <span
                    className={
                      "status-dot " + (friend.online ? "online" : "offline")
                    }
                  />
                </div>

                <span className="friend-name-row">
                  <span className="friend-name">{friend.username}</span>

                  {unread > 0 && (
                    <span className="friend-unread">{unread}</span>
                  )}
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