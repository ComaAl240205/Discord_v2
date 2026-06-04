import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  ArrowLeft,
  Hash,
  MoreHorizontal,
  Pin,
  Reply,
  Send,
  Trash2,
  X
} from "lucide-react";
import { useAppStore } from "../store";
import { useServerStore } from "../store_2";
import type { ChannelMessage, DirectMessage } from "../types";
import { API_URL } from "../api";

function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function ChatPanel() {
  const activeServerId = useServerStore((s) => s.activeServerId);
  return activeServerId ? <ChatPanelServer /> : <ChatPanelDM />;
}

/* =========================
   SERVER CHANNEL CHAT
========================= */

function ChatPanelServer() {
  const user = useAppStore((s) => s.user);

  const serverDetail = useServerStore((s) => s.serverDetail);
  const serverChannels = useServerStore((s) => s.serverChannels);
  const activeChannelId = useServerStore((s) => s.activeChannelId);
  const channelMessages = useServerStore((s) => s.channelMessages);
  const sendChannelMessage = useServerStore((s) => s.sendChannelMessage);

  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeChannel = useMemo(() => {
    if (!activeChannelId) return null;
    return serverChannels.find((c) => c.id === activeChannelId) ?? null;
  }, [serverChannels, activeChannelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [channelMessages.length, activeChannelId]);

  function goBackToChannels() {
    setText("");

    useServerStore.setState({
      activeChannelId: null,
      channelMessages: []
    });
  }

  if (!activeChannelId || !activeChannel) {
    return (
      <main className="chat-panel empty-chat">
        <div className="empty-chat-inner">
          <h2>Wähle einen Channel aus</h2>
          <p>Links im Server einen Channel anklicken.</p>
        </div>
      </main>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const clean = text.trim();
    if (!clean) return;

    await sendChannelMessage(clean);
    setText("");
  }

  return (
    <main className="chat-panel">
      <header className="chat-header">
        <button
          type="button"
          className="mobile-back-btn"
          onClick={goBackToChannels}
          title="Zurück"
          aria-label="Zurück zu Channels"
        >
          <ArrowLeft size={20} />
        </button>

        <strong
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis"
          }}
        >
          <Hash size={16} />
          {activeChannel.name}
        </strong>

        <span className="chat-header-status">{serverDetail?.name ?? ""}</span>
      </header>

      <section className="messages">
        {channelMessages.length === 0 && (
          <div className="empty-dm-info">
            <p>Das ist der Anfang des Channels.</p>
          </div>
        )}

        {channelMessages.map((m: ChannelMessage) => {
          const own = m.author_id === user?.id;
          const displayName = own ? "Du" : m.author;

          return (
            <article
              key={m.id}
              className={
                "message-row message-hover-row " + (own ? "own-message " : "")
              }
            >
              <div className="avatar">{initials(displayName)}</div>

              <div className="message-body">
                <div className="message-meta">
                  <strong>{displayName}</strong>
                  <span>{m.created_at}</span>
                </div>

                <p>{m.content}</p>
              </div>
            </article>
          );
        })}

        <div ref={bottomRef} />
      </section>

      <div className="typing-indicator" />

      <form className="message-input-wrap" onSubmit={handleSubmit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Nachricht in #${activeChannel.name}`}
          autoComplete="off"
        />

        <button type="submit" title="Senden">
          <Send size={18} />
        </button>
      </form>
    </main>
  );
}

/* =========================
   DM CHAT
========================= */

function ChatPanelDM() {
  const [text, setText] = useState("");
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const typingTimer = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<number, HTMLElement | null>>({});

  const user = useAppStore((s) => s.user);
  const friends = useAppStore((s) => s.friends);
  const activeFriendId = useAppStore((s) => s.activeFriendId);
  const dmMessages = useAppStore((s) => s.dmMessages);
  const dmTypingByFriend = useAppStore((s) => s.dmTypingByFriend);
  const replyToMessage = useAppStore((s) => s.replyToMessage);

  const sendDm = useAppStore((s) => s.sendDm);
  const sendDmTyping = useAppStore((s) => s.sendDmTyping);
  const setReplyToMessage = useAppStore((s) => s.setReplyToMessage);
  const deleteDm = useAppStore((s) => s.deleteDm);
  const togglePinDm = useAppStore((s) => s.togglePinDm);

  const activeFriend = useMemo(() => {
    return friends.find((f) => f.id === activeFriendId) ?? null;
  }, [friends, activeFriendId]);

  const typingName = useMemo(() => {
    if (!activeFriendId) return null;
    return dmTypingByFriend[activeFriendId] ?? null;
  }, [dmTypingByFriend, activeFriendId]);

  const pinnedMessages = useMemo(
    () => dmMessages.filter((m) => m.pinned),
    [dmMessages]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [dmMessages.length, activeFriendId]);

  useEffect(() => {
    return () => {
      sendDmTyping(false);

      if (typingTimer.current) {
        window.clearTimeout(typingTimer.current);
        typingTimer.current = null;
      }
    };
  }, [activeFriendId, sendDmTyping]);

  function goBackToFriends() {
    sendDmTyping(false);

    if (typingTimer.current) {
      window.clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }

    setText("");
    setOpenMenuId(null);

    useAppStore.setState({
      activeFriendId: null,
      dmMessages: [],
      replyToMessage: null
    });
  }

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      const clean = text.trim();
      if (!clean || !activeFriendId) return;

      await sendDm(clean);
      setText("");
      sendDmTyping(false);

      if (typingTimer.current) {
        window.clearTimeout(typingTimer.current);
        typingTimer.current = null;
      }
    },
    [text, activeFriendId, sendDm, sendDmTyping]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setText(value);

      const isTyping = value.trim().length > 0;
      sendDmTyping(isTyping);

      if (typingTimer.current) {
        window.clearTimeout(typingTimer.current);
        typingTimer.current = null;
      }

      if (isTyping) {
        typingTimer.current = window.setTimeout(() => {
          sendDmTyping(false);
          typingTimer.current = null;
        }, 1200);
      }
    },
    [sendDmTyping]
  );

  const scrollToMessage = useCallback((messageId: number) => {
    const el = messageRefs.current[messageId];
    if (!el) return;

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    el.classList.add("message-flash");

    window.setTimeout(() => {
      el.classList.remove("message-flash");
    }, 1200);
  }, []);

  const renderActions = useCallback(
    (message: DirectMessage, own: boolean) => {
      return (
        <div className="message-actions">
          <button
            type="button"
            title="Optionen"
            onClick={() =>
              setOpenMenuId(openMenuId === message.id ? null : message.id)
            }
          >
            <MoreHorizontal size={18} />
          </button>

          {openMenuId === message.id && (
            <div className="message-menu">
              <button
                type="button"
                onClick={() => {
                  setReplyToMessage(message);
                  setOpenMenuId(null);
                }}
              >
                <Reply size={14} />
                Antworten
              </button>

              <button
                type="button"
                onClick={() => {
                  togglePinDm(message.id);
                  setOpenMenuId(null);
                }}
              >
                <Pin size={14} />
                {message.pinned ? "Entpinnen" : "Anpinnen"}
              </button>

              {own && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    deleteDm(message.id);
                    setOpenMenuId(null);
                  }}
                >
                  <Trash2 size={14} />
                  Löschen
                </button>
              )}
            </div>
          )}
        </div>
      );
    },
    [openMenuId, setReplyToMessage, togglePinDm, deleteDm]
  );

  if (!activeFriend) {
    return (
      <main className="chat-panel empty-chat">
        <div className="empty-chat-inner">
          <h2>Wähle einen Freund aus</h2>
          <p>Oder sende links eine Freundschaftsanfrage.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="chat-panel">
      <header className="chat-header">
        <button
          type="button"
          className="mobile-back-btn"
          onClick={goBackToFriends}
          title="Zurück"
          aria-label="Zurück zu Freunden"
        >
          <ArrowLeft size={20} />
        </button>

        <strong>{activeFriend.username}</strong>

        <span className="chat-header-status">
          {activeFriend.online ? "Online" : "Offline"}
        </span>
      </header>

      {pinnedMessages.length > 0 && (
        <section className="pinned-bar">
          <div className="pinned-title">
            <Pin size={14} />
            Angepinnt
          </div>

          <div className="pinned-list">
            {pinnedMessages.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => scrollToMessage(m.id)}
              >
                <strong>{m.sender_username}</strong>
                <span>{m.content.slice(0, 80)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="messages">
        {dmMessages.length === 0 && (
          <div className="empty-dm-info">
            <p>Das ist der Anfang eures Chats.</p>
          </div>
        )}

        {dmMessages.map((message) => {
          const own = message.sender_id === user?.id;
          const displayName = own ? "Du" : message.sender_username;
          const avatar = assetUrl(message.sender_avatar_url);

          return (
            <article
              key={message.id}
              ref={(el) => {
                messageRefs.current[message.id] = el;
              }}
              className={
                "message-row message-hover-row " +
                (own ? "own-message " : "") +
                (message.pinned ? "pinned-message" : "")
              }
            >
              <div className="avatar">
                {avatar ? <img src={avatar} alt="avatar" /> : initials(displayName)}
              </div>

              <div className="message-body">
                {message.reply_to_id && (
                  <button
                    className="reply-preview"
                    type="button"
                    onClick={() => scrollToMessage(message.reply_to_id!)}
                  >
                    <Reply size={12} />
                    <strong>{message.reply_preview_author ?? "Nachricht"}</strong>
                    <span>{message.reply_preview_content ?? "Antwort"}</span>
                  </button>
                )}

                <div className="message-meta">
                  <strong>{displayName}</strong>
                  <span>{message.created_at}</span>

                  {message.pinned && (
                    <span className="pinned-chip">
                      <Pin size={12} />
                      pinned
                    </span>
                  )}
                </div>

                <p>{message.content}</p>
              </div>

              {renderActions(message, own)}
            </article>
          );
        })}

        <div ref={bottomRef} />
      </section>

      <div className="typing-indicator">
        {typingName ? `${typingName} schreibt...` : ""}
      </div>

      {replyToMessage && (
        <div className="reply-compose">
          <div>
            <strong>
              Antwort an{" "}
              {replyToMessage.sender_id === user?.id
                ? "dich"
                : replyToMessage.sender_username}
            </strong>

            <p>{replyToMessage.content}</p>
          </div>

          <button
            type="button"
            title="Antwort abbrechen"
            onClick={() => setReplyToMessage(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <form className="message-input-wrap" onSubmit={handleSubmit}>
        <input
          value={text}
          onChange={handleInputChange}
          placeholder={`Nachricht an @${activeFriend.username}`}
          autoComplete="off"
        />

        <button type="submit" title="Senden">
          <Send size={18} />
        </button>
      </form>
    </main>
  );
}