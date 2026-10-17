"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { UTF8_BOM, exportCsv, exportFileName } from "@/lib/csvio";
import { findRecord } from "@/lib/knowledge";
import { ENTITIES, EntityType, getId, getList, getText } from "@/lib/schema";
import { EMPTY_FILTERS, Filters, categoryOptions, distinctValues, filterRecords } from "@/lib/search";
import { useKnowledge } from "@/lib/store";
import { Loading, PageHeader, detailHref, downloadText, editHref } from "./common";

const FILTER_KEYS = Object.keys(EMPTY_FILTERS) as (keyof Filters)[];

/** 一覧のカードに表示する要約項目 */
const SUMMARY_FIELD: Record<EntityType, string> = {
  deliverables: "purpose",
  checks: "check_point",
  cross: "check_point",
};

export function EntityList({ type }: { type: EntityType }) {
  const def = ENTITIES[type];
  const { data, hydrated } = useKnowledge();
  const params = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => {
    const f = { ...EMPTY_FILTERS };
    for (const k of FILTER_KEYS) f[k] = params.get(k) ?? "";
    return f;
  });

  // 絞り込み条件をURLに反映し、共有・ブラウザバックに対応する
  useEffect(() => {
    const sp = new URLSearchParams();
    for (const k of FILTER_KEYS) if (filters[k]) sp.set(k, filters[k]);
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filters]);

  const records = data[type];
  const results = useMemo(() => filterRecords(type, records, filters), [type, records, filters]);
  const categories = useMemo(() => categoryOptions(type, records), [type, records]);
  const tags = useMemo(() => distinctValues(records, "tags"), [records]);
  const phases = useMemo(() => (type === "deliverables" ? distinctValues(records, "phase") : []), [type, records]);
  const sources = useMemo(() => (type === "cross" ? distinctValues(records, "information_sources") : []), [type, records]);
  const deliverableIds = useMemo(
    () => (type === "checks" ? distinctValues(records, "target_deliverable_ids") : []),
    [type, records],
  );

  const set = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const active = FILTER_KEYS.some((k) => filters[k]);

  const exportResults = () => {
    downloadText(exportFileName(type), UTF8_BOM + exportCsv(type, results));
  };

  return (
    <>
      <PageHeader title={def.label} lead={hydrated ? `${results.length} / ${records.length} 件` : undefined}>
        <button type="button" className="btn" onClick={exportResults} disabled={!hydrated || results.length === 0}>
          {active ? "表示中の結果をCSV出力" : "CSV出力"}
        </button>
        <Link className="btn primary" href={editHref(type)}>
          ＋ 新規追加
        </Link>
      </PageHeader>

      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <input
          type="search"
          className="filter-q"
          placeholder="キーワード検索（スペース区切りでAND）"
          value={filters.q}
          onChange={(e) => set("q", e.target.value)}
          aria-label="キーワード"
        />
        <Select label="分類" value={filters.category} options={categories} onChange={(v) => set("category", v)} />
        {type === "deliverables" && <Select label="工程" value={filters.phase} options={phases} onChange={(v) => set("phase", v)} />}
        {type === "checks" && (
          <Select
            label="対象成果物"
            value={filters.deliverable}
            options={deliverableIds}
            format={(id) => {
              const d = findRecord(data, "deliverables", id);
              return d ? `${id} ${String(d.name)}` : `${id}（未登録）`;
            }}
            onChange={(v) => set("deliverable", v)}
          />
        )}
        {type === "cross" && <Select label="情報源" value={filters.source} options={sources} onChange={(v) => set("source", v)} />}
        <Select label="タグ" value={filters.tag} options={tags} onChange={(v) => set("tag", v)} />
        {active && (
          <button type="button" className="btn small" onClick={() => setFilters(EMPTY_FILTERS)}>
            条件をクリア
          </button>
        )}
      </form>

      {!hydrated ? (
        <Loading />
      ) : records.length === 0 ? (
        <div className="empty">
          <p>まだデータがありません。</p>
          <p>
            <Link href={editHref(type)}>新規追加</Link>するか、<Link href="/csv">CSVから取り込み</Link>
            、または<Link href="/">ホーム</Link>からサンプルデータを読み込んでください。
          </p>
        </div>
      ) : results.length === 0 ? (
        <p className="empty">条件に一致するデータがありません。</p>
      ) : (
        <ul className="card-list">
          {results.map((r) => {
            const id = getId(type, r);
            return (
              <li key={id} className="card">
                <Link href={detailHref(type, id)} className="card-link">
                  <div className="card-head">
                    <span className="mono id">{id}</span>
                    <span className="chip">{getText(r, "category")}</span>
                    {type === "deliverables" && getText(r, "phase") && <span className="chip outline">{getText(r, "phase")}</span>}
                  </div>
                  <h2 className="card-title">{getText(r, "name")}</h2>
                  <p className="card-summary">{getText(r, SUMMARY_FIELD[type])}</p>
                </Link>
                <div className="card-meta">
                  {type === "checks" && (
                    <span className="meta-item">対象: {getList(r, "target_deliverable_ids").join(", ")}</span>
                  )}
                  {type === "cross" && <span className="meta-item">情報源: {getList(r, "information_sources").join("、")}</span>}
                  {getList(r, "tags").map((t) => (
                    <button key={t} type="button" className="tag" onClick={() => set("tag", t)} title="このタグで絞り込む">
                      #{t}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  format,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  format?: (v: string) => string;
}) {
  // URL等で指定された値が候補にない場合も選択状態を保持する
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={value ? "selected" : ""}>
      <option value="">{label}：すべて</option>
      {all.map((o) => (
        <option key={o} value={o}>
          {format ? format(o) : o}
        </option>
      ))}
    </select>
  );
}
