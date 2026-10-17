"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { sampleData } from "@/lib/sample";
import { ENTITIES, ENTITY_TYPES, getId, getText } from "@/lib/schema";
import { filterRecords, EMPTY_FILTERS } from "@/lib/search";
import { setData, useKnowledge } from "@/lib/store";
import { detailHref } from "./common";

const DESCRIPTIONS: Record<string, string> = {
  deliverables: "成果物の目的・作成工程・記載内容・前後関係を把握する",
  checks: "成果物の記載漏れ・矛盾・実現性不足などを発見する観点",
  cross: "WBS・品質・課題・体制などを横断的に分析し、課題・リスク・改善機会を発見する観点",
};

export function Home() {
  const { data, hydrated } = useKnowledge();
  const router = useRouter();
  const [q, setQ] = useState("");
  const total = ENTITY_TYPES.reduce((n, t) => n + data[t].length, 0);

  const loadSample = () => {
    const replace = total > 0;
    if (replace && !window.confirm("現在のデータをすべてサンプルデータで置き換えます。よろしいですか？\n（必要に応じて先にCSVでバックアップしてください）")) {
      return;
    }
    try {
      setData(sampleData());
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const hits = q.trim()
    ? ENTITY_TYPES.flatMap((t) => filterRecords(t, data[t], { ...EMPTY_FILTERS, q }).map((r) => ({ type: t, rec: r })))
    : [];

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (hits.length === 1) router.push(detailHref(hits[0].type, getId(hits[0].type, hits[0].rec)));
  };

  return (
    <>
      <section className="hero">
        <h1>プロジェクト課題発見ナレッジ基盤</h1>
        <p className="lead">
          成果物・成果物チェック観点・横断的な課題発見観点を体系的に蓄積し、プロジェクトの課題・リスク・改善機会の発見に活用します。
        </p>
        <form onSubmit={onSubmit} role="search">
          <input
            type="search"
            className="hero-search"
            placeholder="すべてのナレッジを検索（例: 非機能、課題管理表、属人化）"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="すべてのナレッジを検索"
          />
        </form>
        {q.trim() && hydrated && (
          <div className="panel search-results">
            <p className="muted">{hits.length} 件ヒット</p>
            <ul className="ref-list">
              {hits.slice(0, 30).map(({ type, rec }) => (
                <li key={`${type}:${getId(type, rec)}`}>
                  <Link className="ref" href={detailHref(type, getId(type, rec))}>
                    <span className="chip outline">{ENTITIES[type].shortLabel}</span> <span className="mono">{getId(type, rec)}</span>{" "}
                    {getText(rec, "name")}
                  </Link>
                </li>
              ))}
            </ul>
            {hits.length > 30 && <p className="muted">ほか {hits.length - 30} 件。各一覧画面で絞り込んでください。</p>}
          </div>
        )}
      </section>

      <section className="stat-grid">
        {ENTITY_TYPES.map((t) => (
          <Link key={t} href={ENTITIES[t].route} className="stat-card">
            <span className="stat-label">{ENTITIES[t].label}</span>
            <span className="stat-value">{hydrated ? data[t].length : "–"}</span>
            <span className="stat-desc">{DESCRIPTIONS[t]}</span>
          </Link>
        ))}
      </section>

      <section className="panel">
        <h2>はじめに</h2>
        <ol className="steps">
          <li>
            <Link href="/deliverables">成果物</Link>・<Link href="/checks">チェック観点</Link>・<Link href="/cross">横断観点</Link>
            の各画面から、ナレッジを登録・検索します。
          </li>
          <li>成果物とチェック観点はIDで関連付けられ、詳細画面から相互に参照できます。</li>
          <li>
            データはこのブラウザ内に保存されます。<Link href="/csv">CSV管理</Link>から定期的にエクスポートしてバックアップしてください。
          </li>
        </ol>
        {hydrated && (
          <div className="actions">
            <button type="button" className="btn" onClick={loadSample}>
              {total === 0 ? "サンプルデータを読み込む" : "サンプルデータで置き換える"}
            </button>
            <Link href="/csv" className="btn">
              CSVから取り込む
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
