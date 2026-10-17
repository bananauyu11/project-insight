import { ENTITIES, EntityType, KnowledgeRecord, getList, getText } from "./schema";

export interface Filters {
  q: string;
  category: string;
  phase: string;
  tag: string;
  /** チェック観点の対象成果物ID */
  deliverable: string;
  /** 横断観点の情報源 */
  source: string;
}

export const EMPTY_FILTERS: Filters = { q: "", category: "", phase: "", tag: "", deliverable: "", source: "" };

/** 全角英数字・大文字小文字の違いを吸収する */
export function normalizeForSearch(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

/** キーワード検索の対象となる連結済みテキスト */
export function searchableText(type: EntityType, rec: KnowledgeRecord): string {
  const parts: string[] = [];
  for (const f of ENTITIES[type].fields) {
    if (f.system) continue;
    const v = rec[f.key];
    if (Array.isArray(v)) parts.push(...v);
    else if (typeof v === "string") parts.push(v);
  }
  return normalizeForSearch(parts.join("\n"));
}

/** スペース区切りのキーワードはすべて含むもの（AND）に一致する */
export function filterRecords(type: EntityType, records: KnowledgeRecord[], filters: Filters): KnowledgeRecord[] {
  const terms = normalizeForSearch(filters.q).split(/\s+/).filter(Boolean);
  return records.filter((r) => {
    if (filters.category && getText(r, "category") !== filters.category) return false;
    if (filters.phase && getText(r, "phase") !== filters.phase) return false;
    if (filters.tag && !getList(r, "tags").includes(filters.tag)) return false;
    if (filters.deliverable && !getList(r, "target_deliverable_ids").includes(filters.deliverable)) return false;
    if (filters.source && !getList(r, "information_sources").includes(filters.source)) return false;
    if (terms.length > 0) {
      const text = searchableText(type, r);
      if (!terms.every((t) => text.includes(t))) return false;
    }
    return true;
  });
}

/** 絞り込み候補（登録済みの値を出現回数の多い順に並べる） */
export function distinctValues(records: KnowledgeRecord[], key: string): string[] {
  const counts = new Map<string, number>();
  for (const r of records) {
    const v = r[key];
    const values = Array.isArray(v) ? v : typeof v === "string" && v !== "" ? [v] : [];
    for (const x of values) counts.set(x, (counts.get(x) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja")).map(([v]) => v);
}

/** 分類の候補（既定の分類例の順序を優先し、登録済みの独自分類を後ろに追加） */
export function categoryOptions(type: EntityType, records: KnowledgeRecord[]): string[] {
  const used = distinctValues(records, "category");
  const base = ENTITIES[type].categorySuggestions.filter((c) => used.includes(c));
  return [...base, ...used.filter((c) => !base.includes(c))];
}
