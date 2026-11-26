import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useId, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { api, type IdKind } from "./api";
import { ago } from "./format";
import { addIds } from "./rules";

interface IdListInputProps {
  /** Which seen IDs to suggest and check. Absent (attribute values): no suggestions and no "never seen" note. */
  kind?: IdKind;
  ids: string[];
  /** Typed text not yet turned into chips. Owned by the draft, so Save includes it. */
  pending: string;
  onChange: (ids: string[], pending: string) => void;
  disabled: boolean;
  /** Accessible name, e.g. "Rule 1 user IDs". */
  label: string;
  placeholder: string;
}

/**
 * Chips for a rule's user or customer IDs. Suggests IDs the flag service has actually seen, keeps malformed
 * entries in the box (the rule editor explains why and blocks saving), and marks IDs it has never seen. Those are still allowed: you may target someone before their
 * first visit, but they're often typos.
 */
export function IdListInput({ kind, ids, pending, onChange, disabled, label, placeholder }: IdListInputProps) {
  const listId = useId();
  const text = pending;
  const [open, setOpen] = useState(false);
  // -1: nothing highlighted, so Enter adds exactly what was typed, never a longer suggestion.
  const [active, setActive] = useState(-1);
  const query = useDeferredValue(text.trim());

  const suggestions = useQuery({
    queryKey: ["contexts", kind, query],
    queryFn: () => (kind ? api.suggestIds(kind, query) : Promise.resolve([])),
    enabled: kind !== undefined && open && !disabled,
    staleTime: 30_000,
  });
  const options = (suggestions.data ?? []).filter((s) => !ids.includes(s.value));
  const showList = open && options.length > 0;

  const sortedIds = [...ids].sort();
  const unseenQuery = useQuery({
    queryKey: ["contexts-unseen", kind, sortedIds],
    queryFn: () => (kind ? api.unseenIds(kind, sortedIds) : Promise.resolve({ unseen: [] })),
    enabled: kind !== undefined && ids.length > 0,
    staleTime: 30_000,
  });
  const unseen = new Set(unseenQuery.data?.unseen ?? []);
  const unseenHere = ids.filter((id) => unseen.has(id));

  /** Adds typed or pasted text; malformed entries stay in the box so they can be fixed. */
  function commit(input: string) {
    const result = addIds(ids, input);
    onChange(result.ids, result.rejected.join(" "));
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setOpen(true);
        setActive((a) => Math.min(a + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(a - 1, -1));
        break;
      case "Enter":
      case "Tab": {
        const highlighted = showList && active >= 0 ? options[active] : undefined;
        if (highlighted) {
          e.preventDefault();
          commit(highlighted.value);
        } else if (e.key === "Enter" && text.trim()) {
          e.preventDefault();
          commit(text);
        }
        break;
      }
      case ",":
      case " ":
        if (text.trim()) {
          e.preventDefault();
          commit(text);
        }
        break;
      case "Backspace":
        if (!text && ids.length > 0) onChange(ids.slice(0, -1), "");
        break;
      case "Escape":
        setOpen(false);
        setActive(-1);
        break;
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    commit(`${text} ${e.clipboardData.getData("text")}`);
  }

  return (
    <div className="id-list">
      <div className={disabled ? "id-input disabled" : "id-input"}>
        {ids.map((id) => (
          <span
            key={id}
            className={unseen.has(id) ? "chip unseen" : "chip"}
            title={unseen.has(id) ? "The flag service has never evaluated this ID. Still allowed." : undefined}
          >
            {id}
            {!disabled && (
              <button type="button" aria-label={`Remove ${id}`} onClick={() => onChange(ids.filter((x) => x !== id), text)}>
                ×
              </button>
            )}
          </span>
        ))}
        {!disabled && (
          <input
            role="combobox"
            aria-label={label}
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            value={text}
            placeholder={ids.length === 0 ? placeholder : ""}
            onChange={(e) => {
              onChange(ids, e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            // No commit on blur: typed text is already part of the draft, and changing the layout here could make
            // a click on Save land on nothing.
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
        )}
        {showList && (
          <ul className="suggestions" role="listbox" id={listId} aria-label={`Seen ${kind} IDs`}>
            {options.map((option, i) => (
              <li
                key={option.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : undefined}
                // mousedown, not click: keeps focus in the input so blur doesn't commit the half-typed text first
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(option.value);
                }}
              >
                {option.value}
                <span className="muted small"> seen {ago(option.lastSeen)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {unseenHere.length > 0 && (
        <p className="warning small">
          Never seen by the flag service: {unseenHere.join(", ")}. Still allowed: check for a typo, or ignore this if
          they just haven't visited yet.
        </p>
      )}
    </div>
  );
}
