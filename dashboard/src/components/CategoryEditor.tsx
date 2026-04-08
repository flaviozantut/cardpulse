/**
 * Inline category editor for transactions.
 *
 * Renders the current category as a clickable label. On click, switches
 * to a combo input (free-text with datalist suggestions) for editing.
 * Saves on Enter/blur, cancels on Escape.
 *
 * When a `categorySource` prop is provided, a small indicator icon is shown
 * next to the category badge to signal how the category was determined:
 * - `auto_learned` — matched a user-taught override (brain icon)
 * - `auto_keyword` — matched the keyword dictionary (wand icon)
 */

import { useState, useRef, useEffect } from "react";
import type { CategorySource } from "../types/dashboard";

interface CategoryEditorProps {
  /** Current category value. */
  category: string;
  /** List of existing categories for auto-suggestions. */
  suggestions: string[];
  /** Callback fired with the new category when the user saves. */
  onSave: (newCategory: string) => void;
  /** Whether a save is currently in progress. */
  isSaving?: boolean;
  /** How the category was determined — shown as a confidence source badge. */
  categorySource?: CategorySource;
}

/** Returns a tooltip and icon character for the category source. */
function SourceBadge({ source }: { source: CategorySource }) {
  if (source === "auto_learned") {
    return (
      <span
        title="Category learned from your corrections"
        className="ml-0.5 text-xs text-emerald-500"
        aria-label="auto-learned"
      >
        ✦
      </span>
    );
  }
  if (source === "auto_keyword") {
    return (
      <span
        title="Category matched by keyword dictionary"
        className="ml-0.5 text-xs text-sky-400"
        aria-label="auto-keyword"
      >
        ✧
      </span>
    );
  }
  return null;
}

export function CategoryEditor({
  category,
  suggestions,
  onSave,
  isSaving = false,
  categorySource,
}: CategoryEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(category);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Sync value when category prop changes (after save)
  useEffect(() => {
    setValue(category);
  }, [category]);

  function handleSave() {
    const trimmed = value.trim();
    setIsEditing(false);

    // Only save if the category actually changed
    if (trimmed && trimmed !== category) {
      onSave(trimmed);
    } else {
      setValue(category);
    }
  }

  function handleCancel() {
    setValue(category);
    setIsEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  }

  if (isSaving) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500"
        data-testid="category-saving"
      >
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500 dark:border-gray-600 dark:border-t-blue-400" />
        Saving...
      </span>
    );
  }

  if (isEditing) {
    return (
      <span className="inline-flex items-center">
        <input
          ref={inputRef}
          type="text"
          list="category-suggestions"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="w-28 rounded border border-blue-400 px-1.5 py-0.5 text-xs text-gray-900 shadow-sm focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-blue-500 dark:bg-gray-800 dark:text-gray-100"
          placeholder="Category..."
          data-testid="category-input"
        />
        <datalist id="category-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs transition-colors ${
        category === "uncategorized"
          ? "bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50"
          : "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:hover:bg-blue-900/50"
      }`}
      title="Click to change category"
      data-testid="category-label"
    >
      {category}
      {categorySource && <SourceBadge source={categorySource} />}
      <svg
        className="h-3 w-3 opacity-50"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125"
        />
      </svg>
    </button>
  );
}
