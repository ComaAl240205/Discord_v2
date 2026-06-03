import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  MoreHorizontal,
  Pin,
  Reply,
  Send,
  Trash2,
  X
} from "lucide-react";
import { useAppStore } from "../store";
import type { DirectMessage } from "../types";
import { API_URL } from "../api";

/* ============================================================================
   Helpers
   ============================================================================ */

/**
 * Baut eine absolute URL für Assets (Avatar etc.).
 * Wichtig: gibt **undefined** zurück (nicht null),
 * damit React <img src> nicht rot wird.
 */
function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

/**
 * Kleiner Helfer für sichere String‑Initialen.
 */
function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

/* ============================================================================
   Component
   ============================================================================ */

export function ChatPanel() {
  /* --------------------------------------------------------------------------
     Local UI State
     -------------------------------------------------------------------------- */

  // Texteingabe
  const [text, setText] = useState("");

  // Kontextmenü (Message Actions)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  /* --------------------------------------------------------------------------
     Refs
     -------------------------------------------------------------------------- */

  // Timer für "typing stopped"
  const typingTimer = useRef<number | null>(null);

  // Scroll‑Anker unten
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Message‑Refs zum Scrollen auf einzelne Nachrichten
  const messageRefs = useRef<Record<number, HTMLElement | null>>({});

  /* --------------------------------------------------------------------------
     Store State
     -------------------------------------------------------------------------- */

  const user = useAppStore((s) => s.user);
  const friends = useAppStore((s) => s.friends);
  const activeFriendId = useAppStore((s) => s.activeFriendId);
  const dmMessages = useAppStore((s) => s.dmMessages);
  const dmTypingByFriend = useAppStore((s) => s.dmTypingByFriend);
  const replyToMessage = useAppStore((s) => s.replyToMessage);

  /* --------------------------------------------------------------------------
     Store Actions
     -------------------------------------------------------------------------- */

  const sendDm = useAppStore((s) => s.sendDm);
  const sendDmTyping = useAppStore((s) => s.sendDmTyping);
  const setReplyToMessage = useAppStore((s) => s.setReplyToMessage);
  const deleteDm = useAppStore((s) => s.deleteDm);
  const togglePinDm = useAppStore((s) => s.togglePinDm);

  /* --------------------------------------------------------------------------
     Derived State (Memoized)
     -------------------------------------------------------------------------- */

  /**
   * Aktiver Chat‑Partner
   */
  const activeFriend = useMemo(() => {
    return friends.find((f) => f.id === activeFriendId) ?? null;
  }, [friends, activeFriendId]);

  /**
   * Name der tippenden Person (Realtime)
   */
  const typingName = useMemo(() => {
    if (!activeFriendId) return null;
    return dmTypingByFriend[activeFriendId] ?? null;
  }, [dmTypingByFriend, activeFriendId]);

  /**
   * Angepinnte Nachrichten
   */
  const pinnedMessages = useMemo(() => {
    return dmMessages.filter((m) => m.pinned);
  }, [dmMessages]);

  /* --------------------------------------------------------------------------
     Effects
     -------------------------------------------------------------------------- */

  /**
   * Automatisch nach unten scrollen,
   * wenn neue Nachrichten kommen oder Chat wechselt.
   */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [dmMessages.length, activeFriendId]);

  /**
   * Cleanup: Typing‑Timer abbrechen beim Unmount / Chat‑Wechsel
   */
  useEffect(() => {
    return () => {
      sendDmTyping(false);
      if (typingTimer.current) {
        window.clearTimeout(typingTimer.current);
        typingTimer.current = null;
      }
    };
  }, [activeFriendId, sendDmTyping]);

  /* --------------------------------------------------------------------------
     Handlers
     -------------------------------------------------------------------------- */

  /**
   * Nachricht absenden
   */
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

  /**
   * Texteingabe + Typing‑Status
   */
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

  /**
   * Scrollt zu einer bestimmten Nachricht (Reply / Pin)
   */
  const scrollToMessage = useCallback((messageId: number) => {
    const el = messageRefs.current[messageId];
    if (!el) return;

    el.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    el.classList.add("message-flash");
    window.setTimeout(() => {
      el.classList.remove("message-flash");
    }, 1200);
  }, []);

  /**
   * Action‑Menü pro Nachricht
   */
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
    [
      openMenuId,
      setReplyToMessage,
      togglePinDm,
      deleteDm
    ]
  );

  /* --------------------------------------------------------------------------
     Empty State (kein Chat ausgewählt)
     -------------------------------------------------------------------------- */

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

  /* --------------------------------------------------------------------------
     Render
     -------------------------------------------------------------------------- */

  return (
    <main className="chat-panel">
      {/* --------------------------------------------------
         Header (bewusst OHNE Avatar)
         -------------------------------------------------- */}
      <header className="chat-header">
        <strong>{activeFriend.username}</strong>
        <span className="chat-header-status">
          {activeFriend.online ? "Online" : "Offline"}
        </span>
      </header>

      {/* --------------------------------------------------
         Pinned Messages
         -------------------------------------------------- */}
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

      {/* --------------------------------------------------
         Messages
         -------------------------------------------------- */}
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
              {/* Avatar – KEIN Online‑Dot im Chat */}
              <div className="avatar">
                {avatar ? (
                  <img src={avatar} alt="avatar" />
                ) : (
                  initials(displayName)
                )}
              </div>

              <div className="message-body">
                {/* Reply Preview */}
                {message.reply_to_id && (
                  <button
                    className="reply-preview"
                    type="button"
                    onClick={() =>
                      scrollToMessage(message.reply_to_id!)
                    }
                  >
                    <Reply size={12} />
                    <strong>
                      {message.reply_preview_author ?? "Nachricht"}
                    </strong>
                    <span>
                      {message.reply_preview_content ?? "Antwort"}
                    </span>
                  </button>
                )}

                {/* Meta */}
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

                {/* Content */}
                <p>{message.content}</p>
              </div>

              {renderActions(message, own)}
            </article>
          );
        })}

        <div ref={bottomRef} />
      </section>

      {/* --------------------------------------------------
         Typing Indicator
         -------------------------------------------------- */}
      <div className="typing-indicator">
        {typingName ? `${typingName} schreibt...` : ""}
      </div>

      {/* --------------------------------------------------
         Reply Compose
         -------------------------------------------------- */}
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

      {/* --------------------------------------------------
         Message Input
         -------------------------------------------------- */}
      <form
        className="message-input-wrap"
        onSubmit={handleSubmit}
      >
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