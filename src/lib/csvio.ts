/**
 * ナレッジデータと CSV の相互変換、およびインポート計画（プレビュー）の作成。
 */
import { CsvParseError, parseCsv, toCsv, unescapeFormula } from "./csv";
import { KnowledgeData, buildIdIndex } from "./knowledge";
import { ENTITIES, EntityType, FieldDef, KnowledgeRecord, getId, isListKind, normalizeRecord } from "./schema";
import { checkRefs, validateRecord } from "./validate";

export const UTF8_BOM = "﻿";

export function csvColumns(type: EntityType): string[] {
  return ENTITIES[type].fields.map((f) => f.key);
}

/** 複数値は JSON 配列として格納する（空の場合は空セル） */
function serializeValue(f: FieldDef, rec: KnowledgeRecord): string {
  const v = rec[f.key];
  if (isListKind(f.kind)) {
    const list = Array.isArray(v) ? v : [];
    return list.length === 0 ? "" : JSON.stringify(list);
  }
  return typeof v === "string" ? v : "";
}

/** CSV テキスト（BOM なし）を生成する */
export function exportCsv(type: EntityType, records: KnowledgeRecord[]): string {
  const fields = ENTITIES[type].fields;
  return toCsv([fields.map((f) => f.key), ...records.map((r) => fields.map((f) => serializeValue(f, r)))]);
}

export function exportFileName(type: EntityType, date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${ENTITIES[type].csvBaseName}_${y}${m}${d}.csv`;
}

/** ファイル名から推定されるデータ種別 */
export function guessTypeFromFileName(name: string): EntityType | undefined {
  const base = name.toLowerCase();
  if (base.startsWith("deliverable_checks")) return "checks";
  if (base.startsWith("deliverables")) return "deliverables";
  if (base.startsWith("cross_cutting")) return "cross";
  return undefined;
}

/** 複数値セルを解析する。JSON 配列を標準とし、それ以外は改行区切りとして扱う。 */
export function parseListCell(raw: string): { values: string[]; error?: string; lenient?: boolean } {
  const s = raw.trim();
  if (s === "") return { values: [] };
  if (s.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string" || typeof x === "number")) {
        return { values: parsed.map((x) => String(x).trim()).filter((x) => x !== "") };
      }
      return { values: [], error: "JSON配列の要素は文字列である必要があります" };
    } catch {
      return { values: [], error: "JSON配列として解析できません" };
    }
  }
  return {
    values: s
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter((x) => x !== ""),
    lenient: true,
  };
}

export type DuplicatePolicy = "update" | "skip" | "error";
export type ImportMode = "merge" | "replace";
export type RowAction = "add" | "update" | "skip" | "error";

export interface PlannedRow {
  line: number;
  id: string;
  name: string;
  action: RowAction;
  errors: string[];
  warnings: string[];
  /** 取り込み後のレコード（error の場合は undefined） */
  record?: KnowledgeRecord;
}

export interface ImportPlan {
  type: EntityType;
  mode: ImportMode;
  policy: DuplicatePolicy;
  /** ファイル全体に関わる致命的エラー（ヘッダー不正など）。ある場合は取り込み不可。 */
  fatal: string[];
  /** ファイル全体に関わる警告（未知の列など） */
  notices: string[];
  rows: PlannedRow[];
  /** 全件置換時に削除される既存データ件数 */
  removedCount: number;
  counts: Record<RowAction, number>;
}

export interface PlanOptions {
  type: EntityType;
  mode: ImportMode;
  policy: DuplicatePolicy;
  now?: string;
}

/**
 * CSV テキストを検証し、各行に対する処理内容（追加・更新・スキップ・エラー）を決定する。
 * 既存データは変更しない。
 */
export function planImport(text: string, data: KnowledgeData, opts: PlanOptions): ImportPlan {
  const { type, mode, policy } = opts;
  const now = opts.now ?? new Date().toISOString();
  const def = ENTITIES[type];
  const plan: ImportPlan = {
    type,
    mode,
    policy,
    fatal: [],
    notices: [],
    rows: [],
    removedCount: 0,
    counts: { add: 0, update: 0, skip: 0, error: 0 },
  };

  let rows;
  try {
    rows = parseCsv(text);
  } catch (e) {
    plan.fatal.push(e instanceof CsvParseError ? e.message : "CSVを解析できません");
    return plan;
  }
  if (rows.length === 0) {
    plan.fatal.push("CSVが空です");
    return plan;
  }

  // ヘッダー検証
  const header = rows[0].cells.map((h) => h.trim());
  const known = new Map(def.fields.map((f) => [f.key, f]));
  const colIndex = new Map<string, number>();
  header.forEach((h, i) => {
    if (h === "") return;
    if (colIndex.has(h)) plan.fatal.push(`列「${h}」が重複しています`);
    else colIndex.set(h, i);
  });
  const unknown = header.filter((h) => h !== "" && !known.has(h));
  if (unknown.length > 0) plan.notices.push(`未知の列は無視されます: ${unknown.join(", ")}`);
  const requiredCols = def.fields.filter((f) => f.required).map((f) => f.key);
  const missingCols = requiredCols.filter((k) => !colIndex.has(k));
  if (missingCols.length > 0) {
    plan.fatal.push(`必須列がありません: ${missingCols.join(", ")}（${def.label}のCSVか確認してください）`);
  }
  if (plan.fatal.length > 0) return plan;

  const existing = new Map(data[type].map((r) => [getId(type, r), r]));
  const seen = new Map<string, number>();
  let lenientUsed = false;

  for (const row of rows.slice(1)) {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (row.cells.length > header.length && row.cells.slice(header.length).some((c) => c.trim() !== "")) {
      errors.push(`列数がヘッダー（${header.length}列）より多くなっています（${row.cells.length}列）`);
    }

    // CSV に含まれる列だけで値を構成する
    const values: Record<string, unknown> = {};
    for (const [key, f] of known) {
      const i = colIndex.get(key);
      if (i === undefined) continue;
      const raw = unescapeFormula(row.cells[i] ?? "");
      if (isListKind(f.kind)) {
        const parsed = parseListCell(raw);
        if (parsed.error) errors.push(`「${f.label}」(${key}): ${parsed.error}`);
        if (parsed.lenient && parsed.values.length > 0) lenientUsed = true;
        values[key] = parsed.values;
      } else {
        values[key] = f.kind === "text" ? raw.trim() : raw;
      }
    }

    const id = typeof values[def.idKey] === "string" ? (values[def.idKey] as string) : "";
    const name = typeof values.name === "string" ? values.name : "";
    const planned: PlannedRow = { line: row.line, id, name, action: "add", errors, warnings };
    plan.rows.push(planned);

    if (id !== "") {
      const firstLine = seen.get(id);
      if (firstLine !== undefined) errors.push(`IDがファイル内で重複しています（${firstLine}行目と同じ）`);
      else seen.set(id, row.line);
    }

    const current = mode === "merge" ? existing.get(id) : undefined;
    // 更新時は CSV に含まれない列の値を維持する
    const merged = normalizeRecord(type, { ...(current ?? {}), ...values });
    for (const issue of validateRecord(type, merged)) errors.push(issue.message);
    if (id === "") errors.push(`「${def.fields[0].label}」(${def.idKey}) は必須です`);

    if (errors.length > 0) {
      planned.action = "error";
      continue;
    }

    if (current) {
      if (policy === "skip") {
        planned.action = "skip";
        warnings.push("登録済みのIDのためスキップします");
        continue;
      }
      if (policy === "error") {
        planned.action = "error";
        errors.push("登録済みのIDです");
        continue;
      }
      planned.action = "update";
      if (!colIndex.has("created_at") || merged.created_at === "") merged.created_at = (current.created_at as string) || now;
      if (!colIndex.has("updated_at") || merged.updated_at === "") merged.updated_at = now;
    } else {
      planned.action = "add";
      if (merged.created_at === "") merged.created_at = now;
      if (merged.updated_at === "") merged.updated_at = merged.created_at;
    }
    planned.record = merged;
  }

  if (lenientUsed) {
    plan.notices.push("JSON配列形式でない複数値項目は、改行区切りとして解釈しました");
  }

  // 関連IDの存在確認（取り込み後の状態に対して行う）
  const after = applyPlan(data, plan);
  const index = buildIdIndex(after);
  for (const r of plan.rows) {
    if (!r.record || r.action === "skip") continue;
    for (const issue of checkRefs(type, r.record, index)) r.warnings.push(issue.message);
  }

  if (mode === "replace") {
    const kept = new Set(plan.rows.filter((r) => r.record).map((r) => r.id));
    plan.removedCount = data[type].filter((r) => !kept.has(getId(type, r))).length;
  }
  for (const r of plan.rows) plan.counts[r.action]++;
  return plan;
}

/** インポート計画を適用した新しいデータを返す（エラー行は取り込まない） */
export function applyPlan(data: KnowledgeData, plan: ImportPlan): KnowledgeData {
  const { type } = plan;
  if (plan.fatal.length > 0) return data;
  const incoming = plan.rows.filter((r) => r.record && (r.action === "add" || r.action === "update"));
  let list: KnowledgeRecord[];
  if (plan.mode === "replace") {
    list = incoming.map((r) => r.record!);
  } else {
    const byId = new Map(incoming.map((r) => [r.id, r.record!]));
    list = data[type].map((r) => {
      const id = getId(type, r);
      const updated = byId.get(id);
      if (updated) byId.delete(id);
      return updated ?? r;
    });
    list.push(...byId.values());
  }
  return { ...data, [type]: list };
}
