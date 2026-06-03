import { Check, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { useAppStore } from "../store";
import { API_URL } from "../api";

function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

export function ChannelSidebar() {
  const [username, setUsername] = useState("");

  const friends = useAppStore((s) => s.friends);
  const requests = useAppStore((s) => s.requests);
  const activeFriendId = useAppStore((s) => s.activeFriendId);

  const sendFriendRequest = useAppStore((s) => s.sendFriendRequest);
  const acceptRequest = useAppStore((s) => s.acceptRequest);
  const declineRequest = useAppStore((s) => s.declineRequest);
  const openDm = useAppStore((s) => s.openDm);

  const error = useAppStore((s) => s.error);
  const info = useAppStore((s) => s.info);

  async function handleAddFriend() {
    await sendFriendRequest(username);
    setUsername("");
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

          <button onClick={handleAddFriend}>
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

            <button onClick={() => acceptRequest(req.id)}>
              <Check size={15} />
            </button>

            <button onClick={() => declineRequest(req.id)}>
              <X size={15} />
            </button>
          </div>
        ))}

        <p className="section-title">Direktnachrichten</p>

        {friends.length === 0 && (
          <div className="empty-small">Noch keine Freunde</div>
        )}

        {friends.map((friend) => {
          const avatar = assetUrl(friend.avatar_url);

          return (
            <button
              key={friend.id}
              className={
                "friend-item " +
                (activeFriendId === friend.id ? "active" : "")
              }
              onClick={() => openDm(friend.id)}
            >
              <div className="friend-avatar">
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

              <span className="friend-name">{friend.username}</span>
            </button>
          );
        })}
      </section>
    </aside>
  );
}
