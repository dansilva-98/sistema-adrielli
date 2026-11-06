"use client";

import Link from "next/link";

import {
  addAnotherContentLabel,
  BACK_TO_LIST_LABEL,
  PUBLISH_ON_SITE_LABEL,
  type ContentKind,
} from "@/modules/content/list-copy";

export function ContentFormChrome({
  kind,
  listHref,
  createHref,
  title,
  editing,
}: {
  kind: ContentKind;
  listHref: string;
  createHref: string;
  title: string;
  editing: boolean;
}) {
  return (
    <>
      <h2 className="text-xl">{title}</h2>
      {editing ? (
        <p className="flex flex-wrap gap-4 text-sm">
          <Link href={listHref}>{BACK_TO_LIST_LABEL}</Link>
          <Link href={createHref}>{addAnotherContentLabel(kind)}</Link>
        </p>
      ) : null}
    </>
  );
}

export function PublishOnSiteField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {PUBLISH_ON_SITE_LABEL}
    </label>
  );
}
