"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  KnowledgeData,
  downstreamOf,
  findRecord,
  findReferrers,
  relatedChecksOf,
  targetDeliverablesOf,
  upstreamOf,
} from "@/lib/knowledge";
import { ENTITIES, EntityType, FieldDef, KnowledgeRecord, getList, getText } from "@/lib/schema";
import { deleteRecord, useKnowledge } from "@/lib/store";
import { Loading, PageHeader, RefLink, RefList, editHref, formatDateTime } from "./common";

/** 関連セクションで別途表示するため、項目一覧からは除外する参照項目 */
const RELATION_FIELDS: Partial<Record<EntityType, string[]>> = {
  deliverables: ["inputs", "outputs_to", "related_viewpoint_ids"],
  checks: ["target_deliverable_ids"],
};

export function EntityDetail({ type }: { type: EntityType }) {
  const def = ENTITIES[type];
  const router = useRouter();
  const id = useSearchParams().get("id") ?? "";
  const { data, hydrated } = useKnowledge();
  if (!hydrated) return <Loading />;

  const rec = findRecord(data, type, id);
  if (!rec) {
    return (
      <div className="empty">
        <p>
          {def.shortLabel}「<span className="mono">{id}</span>」は登録されていません。
        </p>
        <Link href={def.route}>一覧へ戻る</Link>
      </div>
    );
  }

  const onDelete = () => {
    const refs = findReferrers(data, type, id);
    const refNote =
      refs.length > 0
        ? `\n\nこのデータは他の ${refs.length} 件から参照されています。削除すると参照も解除されます:\n` +
          refs
            .slice(0, 10)
            .map((r) => `・${r.id} ${r.name}（${r.fieldLabel}）`)
            .join("\n") +
          (refs.length > 10 ? "\n…" : "")
        : "";
    if (!window.confirm(`「${id} ${String(rec.name)}」を削除します。よろしいですか？${refNote}`)) return;
    try {
      deleteRecord(type, id);
      router.push(def.route);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const hidden = new Set([def.idKey, "name", "category", "tags", ...(RELATION_FIELDS[type] ?? [])]);
  const fields = def.fields.filter((f) => !f.system && !hidden.has(f.key));

  return (
    <>
      <nav className="breadcrumb">
        <Link href={def.route}>{def.label}</Link> / <span className="mono">{id}</span>
      </nav>
      <PageHeader title={String(rec.name)}>
        <Link className="btn primary" href={editHref(type, id)}>
          編集
        </Link>
        <button type="button" className="btn danger" onClick={onDelete}>
          削除
        </button>
      </PageHeader>

      <div className="detail-meta">
        <span className="mono id">{id}</span>
        <Link className="chip" href={`${def.route}?category=${encodeURIComponent(getText(rec, "category"))}`}>
          {getText(rec, "category")}
        </Link>
        {getList(rec, "tags").map((t) => (
          <Link key={t} className="tag" href={`${def.route}?tag=${encodeURIComponent(t)}`}>
            #{t}
          </Link>
        ))}
      </div>

      <div className="detail-grid">
        <section className="panel">
          <dl className="fields">
            {fields.map((f) => (
              <FieldView key={f.key} field={f} rec={rec} type={type} data={data} />
            ))}
          </dl>
          <p className="timestamps muted">
            {rec.created_at && <>作成: {formatDateTime(String(rec.created_at))}　</>}
            {rec.updated_at && <>更新: {formatDateTime(String(rec.updated_at))}</>}
          </p>
        </section>
        <aside className="panel relations">
          <Relations type={type} rec={rec} data={data} />
        </aside>
      </div>
    </>
  );
}

function FieldView({ field, rec, type, data }: { field: FieldDef; rec: KnowledgeRecord; type: EntityType; data: KnowledgeData }) {
  const v = rec[field.key];
  const empty = Array.isArray(v) ? v.length === 0 : !v;
  return (
    <>
      <dt>{field.label}</dt>
      <dd>
        {empty ? (
          <span className="muted">—</span>
        ) : Array.isArray(v) ? (
          <ul className="value-list">
            {v.map((x, i) => (
              <li key={i}>
                {type === "cross" && field.key === "information_sources" ? (
                  <Link href={`/cross?source=${encodeURIComponent(x)}`}>{x}</Link>
                ) : field.refTo && findRecord(data, field.refTo, x) ? (
                  <RefLink data={data} type={field.refTo} id={x} />
                ) : (
                  <span className="pre">{x}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pre">{v}</p>
        )}
      </dd>
    </>
  );
}

function Relations({ type, rec, data }: { type: EntityType; rec: KnowledgeRecord; data: KnowledgeData }) {
  if (type === "deliverables") {
    const id = String(rec.deliverable_id);
    const freeInputs = getList(rec, "inputs").filter((x) => !findRecord(data, "deliverables", x));
    const upstream = upstreamOf(data, rec);
    return (
      <>
        <h2>関連チェック観点</h2>
        <RefList data={data} type="checks" ids={relatedChecksOf(data, rec)} empty="関連付けられた観点はありません" />
        <p>
          <Link href={`/checks?deliverable=${encodeURIComponent(id)}`}>この成果物を対象とする観点で絞り込む →</Link>
        </p>
        <h2>インプット・前工程の成果物</h2>
        <RefList data={data} type="deliverables" ids={upstream} empty={freeInputs.length > 0 ? "" : "なし"} />
        {freeInputs.length > 0 && (
          <ul className="value-list">
            {freeInputs.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        <h2>関連する後続成果物</h2>
        <RefList data={data} type="deliverables" ids={downstreamOf(data, rec)} />
      </>
    );
  }
  if (type === "checks") {
    return (
      <>
        <h2>対象成果物</h2>
        <RefList data={data} type="deliverables" ids={targetDeliverablesOf(data, rec)} />
      </>
    );
  }
  const sources = getList(rec, "information_sources");
  return (
    <>
      <h2>同じ情報源を使う横断観点</h2>
      {sources.map((s) => {
        const others = data.cross.filter((c) => c !== rec && getList(c, "information_sources").includes(s));
        return (
          <div key={s}>
            <h3>{s}</h3>
            <RefList data={data} type="cross" ids={others.map((c) => String(c.cross_viewpoint_id))} />
          </div>
        );
      })}
    </>
  );
}
