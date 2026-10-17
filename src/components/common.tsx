"use client";

import Link from "next/link";
import { ReactNode } from "react";
import { KnowledgeData, findRecord } from "@/lib/knowledge";
import { ENTITIES, EntityType } from "@/lib/schema";

export function detailHref(type: EntityType, id: string): string {
  return `${ENTITIES[type].route}/view?id=${encodeURIComponent(id)}`;
}

export function editHref(type: EntityType, id?: string): string {
  return `${ENTITIES[type].route}/edit${id ? `?id=${encodeURIComponent(id)}` : ""}`;
}

/** IDから関連データへのリンク。未登録のIDは警告表示する。 */
export function RefLink({ data, type, id }: { data: KnowledgeData; type: EntityType; id: string }) {
  const rec = findRecord(data, type, id);
  if (!rec) {
    return (
      <span className="ref missing" title={`未登録の${ENTITIES[type].shortLabel}IDです`}>
        <span className="mono">{id}</span> （未登録）
      </span>
    );
  }
  return (
    <Link className="ref" href={detailHref(type, id)}>
      <span className="mono">{id}</span> {String(rec.name)}
    </Link>
  );
}

export function RefList({ data, type, ids, empty = "なし" }: { data: KnowledgeData; type: EntityType; ids: string[]; empty?: string }) {
  if (ids.length === 0) return empty ? <p className="muted">{empty}</p> : null;
  return (
    <ul className="ref-list">
      {ids.map((id) => (
        <li key={id}>
          <RefLink data={data} type={type} id={id} />
        </li>
      ))}
    </ul>
  );
}

export function Loading() {
  return <p className="muted">読み込み中…</p>;
}

export function PageHeader({ title, children, lead }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

/** テキストをファイルとしてダウンロードさせる */
export function downloadText(fileName: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("ja-JP");
}
