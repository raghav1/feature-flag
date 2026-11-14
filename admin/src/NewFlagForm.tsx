import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "./api";
import { keys } from "./queries";

/** onDone(key) after creating, onDone(null) on cancel. */
export function NewFlagForm({ onDone }: { onDone: (key: string | null) => void }) {
  const queryClient = useQueryClient();
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: () => api.createFlag(key.trim(), description.trim()),
    onSuccess: async (flag) => {
      await queryClient.invalidateQueries({ queryKey: keys.flags });
      onDone(flag.key);
    },
  });
  const keyError =
    create.error instanceof ApiError ? create.error.fieldErrors.find((f) => f.field === "key")?.message : undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <form className="new-flag" onSubmit={submit}>
      <label>
        Key
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="checkout-v2" autoFocus />
      </label>
      <label>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it controls" />
      </label>
      {create.isError && (
        <p className="error" role="alert">
          {keyError ? `Key ${keyError}.` : create.error.message}
        </p>
      )}
      <p className="muted small">Lowercase letters, digits and dashes. The key can't be changed later. New flags start OFF everywhere.</p>
      <div className="row">
        <button type="submit" className="primary" disabled={!key.trim() || create.isPending}>
          Create
        </button>
        <button type="button" onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
