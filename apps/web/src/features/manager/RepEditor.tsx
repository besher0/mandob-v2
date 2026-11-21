"use client";
import { useEffect, useRef } from "react";
import { useResource, ResourceState } from "../rep/useResource";
import type { RepEditorOptions } from "./rep-editor.types";
import { RepEditorForm } from "./RepEditorForm";
import s from "./ManagerApp.module.css";
export function RepEditor({
  repId,
  token,
  onClose,
  onSaved,
}: {
  repId?: string;
  token: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const resource = useResource<RepEditorOptions>(
    repId ? `/manager/reps/${repId}/options` : "/manager/rep-options",
    token,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className={`${s.dialog} ${s.editorDialog}`}
      ref={dialog}
      onCancel={onClose}
    >
      <div className={s.sectionHead}>
        <h3>{repId ? "تعديل المندوب" : "إضافة مندوب جديد"}</h3>
        <button aria-label="إغلاق" onClick={onClose}>
          ×
        </button>
      </div>
      {resource.data ? (
        <RepEditorForm data={resource.data} token={token} onSaved={onSaved} onClose={onClose} />
      ) : (
        <ResourceState error={resource.error} retry={resource.reload} />
      )}

    </dialog>
  );
}
