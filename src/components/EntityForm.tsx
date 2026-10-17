"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { KnowledgeData, buildIdIndex, findRecord, suggestId } from "@/lib/knowledge";
import {
  ENTITIES,
  EntityType,
  FieldDef,
  INFORMATION_SOURCE_SUGGESTIONS,
  KnowledgeRecord,
  emptyRecord,
  getId,
  getList,
  getText,
  isListKind,
} from "@/lib/schema";
import { categoryOptions, distinctValues } from "@/lib/search";
import { upsertRecord, useKnowledge } from "@/lib/store";
import { checkRefs, validateRecord } from "@/lib/validate";
import { Loading, PageHeader, detailHref } from "./common";

export function EntityForm({ type }: { type: EntityType }) {
  const id = useSearchParams().get("id") ?? "";
  const { data, hydrated } = useKnowledge();
  if (!hydrated) return <Loading />;
  const def = ENTITIES[type];
  const existing = id ? findRecord(data, type, id) : undefined;
  if (id && !existing) {
    return (
      <div className="empty">
        <p>
          {def.shortLabel}「<span className="mono">{id}</span>」は登録されていません。
        </p>
        <Link href={def.route}>一覧へ戻る</Link>
      </div>
    );
  }
  // key により、対象が変わったらフォームの状態を初期化する
  return <FormBody key={id || "new"} type={type} data={data} existing={existing} />;
}

/** フォーム上の値。複数値項目は「1行1項目」のテキストとして編集する */
type Draft = Record<string, string | string[]>;

function toDraft(type: EntityType, rec: KnowledgeRecord): Draft {
  const draft: Draft = {};
  for (const f of ENTITIES[type].fields) {
    draft[f.key] = f.kind === "list" ? getList(rec, f.key).join("\n") : f.kind === "refs" ? getList(rec, f.key) : getText(rec, f.key);
  }
  return draft;
}

function fromDraft(type: EntityType, draft: Draft): KnowledgeRecord {
  const rec: KnowledgeRecord = {};
  for (const f of ENTITIES[type].fields) {
    const v = draft[f.key];
    if (f.kind === "list") {
      rec[f.key] = String(v ?? "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);
    } else if (f.kind === "refs") {
      rec[f.key] = Array.isArray(v) ? v : [];
    } else {
      rec[f.key] = f.kind === "text" ? String(v ?? "").trim() : String(v ?? "");
    }
  }
  return rec;
}

function FormBody({ type, data, existing }: { type: EntityType; data: KnowledgeData; existing?: KnowledgeRecord }) {
  const def = ENTITIES[type];
  const router = useRouter();
  const isNew = !existing;
  const [draft, setDraft] = useState<Draft>(() => {
    if (existing) return toDraft(type, existing);
    const d = toDraft(type, emptyRecord(type));
    d[def.idKey] = suggestId(data, type);
    return d;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const suggestions = useMemo(() => {
    const records = data[type];
    return {
      category: [...new Set([...def.categorySuggestions, ...categoryOptions(type, records)])],
      phase: [...new Set([...ENTITIES.deliverables.categorySuggestions, ...distinctValues(data.deliverables, "phase")])],
      owner: distinctValues(records, "owner"),
    } as Record<string, string[]>;
  }, [data, def, type]);

  const set = (key: string, value: string | string[]) => setDraft((d) => ({ ...d, [key]: value }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const rec = fromDraft(type, draft);
    const id = getId(type, rec);
    const errs: Record<string, string> = {};
    for (const issue of validateRecord(type, rec)) errs[issue.field ?? ""] = issue.message;
    if (isNew && findRecord(data, type, id)) errs[def.idKey] = `ID「${id}」は既に登録されています`;
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      setFormError("入力内容を確認してください");
      return;
    }

    const warnings = checkRefs(type, rec, buildIdIndex(data));
    if (warnings.length > 0 && !window.confirm(`${warnings.map((w) => w.message).join("\n")}\n\nこのまま保存しますか？`)) return;

    const now = new Date().toISOString();
    rec.created_at = existing ? getText(existing, "created_at") || now : now;
    rec.updated_at = now;
    try {
      upsertRecord(type, rec, existing ? getId(type, existing) : undefined);
      router.push(detailHref(type, id));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    }
  };

  const cancelHref = existing ? detailHref(type, getId(type, existing)) : def.route;

  return (
    <>
      <nav className="breadcrumb">
        <Link href={def.route}>{def.label}</Link> / {isNew ? "新規追加" : <span className="mono">{getId(type, existing)}</span>}
      </nav>
      <PageHeader title={isNew ? `${def.shortLabel}の新規追加` : `${def.shortLabel}の編集`} />
      <form className="panel form" onSubmit={onSubmit} noValidate>
        {def.fields
          .filter((f) => !f.system)
          .map((f) => (
            <FieldInput
              key={f.key}
              field={f}
              type={type}
              data={data}
              value={draft[f.key]}
              onChange={(v) => set(f.key, v)}
              error={errors[f.key]}
              readOnly={!isNew && f.key === def.idKey}
              suggestions={suggestions[f.key]}
            />
          ))}
        {formError && (
          <p className="error" role="alert">
            {formError}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" className="btn primary">
            保存
          </button>
          <Link className="btn" href={cancelHref}>
            キャンセル
          </Link>
        </div>
      </form>
    </>
  );
}

function FieldInput({
  field,
  type,
  data,
  value,
  onChange,
  error,
  readOnly,
  suggestions,
}: {
  field: FieldDef;
  type: EntityType;
  data: KnowledgeData;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  error?: string;
  readOnly?: boolean;
  suggestions?: string[];
}) {
  const inputId = `f-${field.key}`;
  const listId = suggestions?.length ? `${inputId}-options` : undefined;
  const isSource = type === "cross" && field.key === "information_sources";
  const help = [
    field.help,
    field.kind === "list" ? "1行に1項目を入力します。" : "",
    readOnly ? "IDは関連付けに使用されるため変更できません。" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={inputId}>
        {field.label}
        {field.required && <span className="req">必須</span>}
        <span className="key mono">{field.key}</span>
      </label>
      {field.kind === "refs" && field.refTo ? (
        <RefPicker inputId={inputId} data={data} refTo={field.refTo} value={Array.isArray(value) ? value : []} onChange={onChange} />
      ) : field.kind === "text" ? (
        <>
          <input id={inputId} type="text" value={String(value)} onChange={(e) => onChange(e.target.value)} readOnly={readOnly} list={listId} />
          {listId && (
            <datalist id={listId}>
              {suggestions!.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </>
      ) : (
        <textarea
          id={inputId}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          rows={isListKind(field.kind) ? 4 : 3}
        />
      )}
      {isSource && (
        <div className="suggest">
          {INFORMATION_SOURCE_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="tag"
              onClick={() => {
                const lines = String(value).split("\n").filter((x) => x.trim());
                if (!lines.includes(s)) onChange([...lines, s].join("\n"));
              }}
            >
              ＋{s}
            </button>
          ))}
        </div>
      )}
      {help && <p className="help">{help}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** 他データのIDを選択して関連付ける */
function RefPicker({
  inputId,
  data,
  refTo,
  value,
  onChange,
}: {
  inputId: string;
  data: KnowledgeData;
  refTo: EntityType;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const candidates = data[refTo].filter((r) => !value.includes(getId(refTo, r)));
  return (
    <div className="ref-picker">
      {value.length > 0 && (
        <ul className="chips">
          {value.map((id) => {
            const r = findRecord(data, refTo, id);
            return (
              <li key={id} className={r ? "chip" : "chip missing"}>
                <span className="mono">{id}</span> {r ? String(r.name) : "（未登録）"}
                <button type="button" aria-label={`${id} を外す`} onClick={() => onChange(value.filter((x) => x !== id))}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <select
        id={inputId}
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
      >
        <option value="">{candidates.length > 0 ? `${ENTITIES[refTo].shortLabel}を追加…` : `追加できる${ENTITIES[refTo].shortLabel}がありません`}</option>
        {candidates.map((r) => {
          const id = getId(refTo, r);
          return (
            <option key={id} value={id}>
              {id} {String(r.name)}（{getText(r, "category")}）
            </option>
          );
        })}
      </select>
    </div>
  );
}
