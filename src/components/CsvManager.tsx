"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { decodeCsvBytes } from "@/lib/csv";
import {
  DuplicatePolicy,
  ImportMode,
  RowAction,
  UTF8_BOM,
  applyPlan,
  csvColumns,
  exportCsv,
  exportFileName,
  guessTypeFromFileName,
  planImport,
} from "@/lib/csvio";
import { emptyData } from "@/lib/knowledge";
import { ENTITIES, ENTITY_TYPES, EntityType } from "@/lib/schema";
import { getData, setData, useKnowledge } from "@/lib/store";
import { Loading, PageHeader, downloadText } from "./common";

const ACTION_LABEL: Record<RowAction, string> = { add: "追加", update: "更新", skip: "スキップ", error: "エラー" };

interface LoadedFile {
  name: string;
  text: string;
  encoding: string;
}

export function CsvManager() {
  const { data, hydrated } = useKnowledge();
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [type, setType] = useState<EntityType>("deliverables");
  const [mode, setMode] = useState<ImportMode>("merge");
  const [policy, setPolicy] = useState<DuplicatePolicy>("update");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const plan = useMemo(
    () => (file && hydrated ? planImport(file.text, data, { type, mode, policy }) : null),
    [file, hydrated, data, type, mode, policy],
  );

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setMessage("");
    if (!f) return;
    const { text, encoding } = decodeCsvBytes(new Uint8Array(await f.arrayBuffer()));
    setFile({ name: f.name, text, encoding });
    const guessed = guessTypeFromFileName(f.name);
    if (guessed) setType(guessed);
  };

  const reset = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const execute = () => {
    if (!plan) return;
    const n = plan.counts.add + plan.counts.update;
    const lines = [
      `${ENTITIES[type].label}に取り込みます。`,
      `追加 ${plan.counts.add} 件 / 更新 ${plan.counts.update} 件 / スキップ ${plan.counts.skip} 件 / エラー（取り込まない） ${plan.counts.error} 件`,
    ];
    if (mode === "replace") lines.push(`\n【全件置換】既存の ${plan.removedCount} 件はCSVに含まれないため削除されます。`);
    if (!window.confirm(`${lines.join("\n")}\n\n実行してよろしいですか？`)) return;
    try {
      setData(applyPlan(getData(), plan));
      setMessage(`${ENTITIES[type].label}に ${n} 件を取り込みました。`);
      reset();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const exportAll = () => {
    for (const t of ENTITY_TYPES) downloadText(exportFileName(t), UTF8_BOM + exportCsv(t, data[t]));
  };

  const clearAll = () => {
    if (!window.confirm("ブラウザに保存されたすべてのデータを削除します。元に戻せません。\n事前にCSVでバックアップしてください。\n\n削除してよろしいですか？")) return;
    setData(emptyData());
    setMessage("すべてのデータを削除しました。");
  };

  if (!hydrated) return <Loading />;

  const canExecute =
    plan && plan.fatal.length === 0 && plan.counts.add + plan.counts.update > 0 && !(mode === "replace" && plan.counts.error > 0);
  const visibleRows = plan ? plan.rows.filter((r) => !onlyIssues || r.errors.length > 0 || r.warnings.length > 0) : [];

  return (
    <>
      <PageHeader title="CSV管理" lead="CSVはデータ交換とバックアップの標準形式です。ブラウザのデータ消去に備えて定期的に出力してください。" />
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}

      <section className="panel">
        <h2>エクスポート</h2>
        <p className="muted">UTF-8（BOM付き）で出力します。複数値の項目はJSON配列形式で格納されます。</p>
        <div className="export-grid">
          {ENTITY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className="btn"
              onClick={() => downloadText(exportFileName(t), UTF8_BOM + exportCsv(t, data[t]))}
            >
              {ENTITIES[t].label}（{data[t].length}件）
              <span className="mono small">{ENTITIES[t].csvBaseName}.csv</span>
            </button>
          ))}
          <button type="button" className="btn primary" onClick={exportAll}>
            3種類すべて出力
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>インポート</h2>
        <div className="import-options">
          <label className="field">
            <span>CSVファイル</span>
            <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onFile} />
          </label>
          <label className="field">
            <span>データ種別</span>
            <select value={type} onChange={(e) => setType(e.target.value as EntityType)}>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ENTITIES[t].label}（{ENTITIES[t].csvBaseName}.csv）
                </option>
              ))}
            </select>
          </label>
          <fieldset className="field">
            <legend>取り込み方法</legend>
            <label>
              <input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} /> 追加・更新（既存データは残す）
            </label>
            <label>
              <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> 全件置換（CSVにないデータは削除）
            </label>
          </fieldset>
          {mode === "merge" && (
            <fieldset className="field">
              <legend>登録済みIDの扱い</legend>
              <label>
                <input type="radio" name="policy" checked={policy === "update"} onChange={() => setPolicy("update")} /> 更新する
              </label>
              <label>
                <input type="radio" name="policy" checked={policy === "skip"} onChange={() => setPolicy("skip")} /> スキップする
              </label>
              <label>
                <input type="radio" name="policy" checked={policy === "error"} onChange={() => setPolicy("error")} /> エラーにする
              </label>
            </fieldset>
          )}
        </div>
        <details className="muted">
          <summary>{ENTITIES[type].label}の列構成</summary>
          <p className="mono small">{csvColumns(type).join(", ")}</p>
          <p>
            必須列: <span className="mono small">{ENTITIES[type].fields.filter((f) => f.required).map((f) => f.key).join(", ")}</span>
            。CSVに含まれない列は、更新時に既存の値が維持されます。
          </p>
        </details>

        {plan && file && (
          <div className="preview">
            <h3>
              プレビュー: {file.name}
              <span className="muted small">（文字コード: {file.encoding === "utf-8" ? "UTF-8" : "Shift_JIS として読み込み"}）</span>
            </h3>
            {plan.fatal.length > 0 ? (
              <div className="error" role="alert">
                <p>このファイルは取り込めません。</p>
                <ul>
                  {plan.fatal.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                {plan.notices.length > 0 && (
                  <ul className="notice">
                    {plan.notices.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                )}
                <div className="summary-chips">
                  {(Object.keys(ACTION_LABEL) as RowAction[]).map((a) => (
                    <span key={a} className={`badge ${a}`}>
                      {ACTION_LABEL[a]} {plan.counts[a]}
                    </span>
                  ))}
                  {mode === "replace" && <span className="badge error">削除 {plan.removedCount}</span>}
                  <label className="small">
                    <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> エラー・警告のある行のみ表示
                  </label>
                </div>
                {mode === "replace" && plan.counts.error > 0 && (
                  <p className="error">全件置換はエラー行を解消してから実行してください（データ消失を防ぐため）。</p>
                )}
                <div className="table-wrap">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>行</th>
                        <th>処理</th>
                        <th>ID</th>
                        <th>名称</th>
                        <th>エラー・警告</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((r) => (
                        <tr key={r.line} className={r.action}>
                          <td>{r.line}</td>
                          <td>
                            <span className={`badge ${r.action}`}>{ACTION_LABEL[r.action]}</span>
                          </td>
                          <td className="mono">{r.id}</td>
                          <td>{r.name}</td>
                          <td>
                            <ul className="issues">
                              {r.errors.map((m, i) => (
                                <li key={`e${i}`} className="error">
                                  {m}
                                </li>
                              ))}
                              {r.warnings.map((m, i) => (
                                <li key={`w${i}`} className="warn">
                                  {m}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="form-actions">
              <button type="button" className="btn primary" disabled={!canExecute} onClick={execute}>
                取り込みを実行
              </button>
              <button type="button" className="btn" onClick={reset}>
                取り消し
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>データの初期化</h2>
        <p className="muted">ブラウザ内に保存されたすべてのナレッジを削除します。</p>
        <button type="button" className="btn danger" onClick={clearAll}>
          すべてのデータを削除
        </button>
      </section>
    </>
  );
}
