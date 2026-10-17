import { ENTITIES, ENTITY_TYPES, EntityType, KnowledgeRecord, SCHEMA_VERSION, getId, getList } from "./schema";
import type { IdIndex } from "./validate";

/** ブラウザ内に保存するナレッジ全体 */
export interface KnowledgeData {
  schemaVersion: number;
  deliverables: KnowledgeRecord[];
  checks: KnowledgeRecord[];
  cross: KnowledgeRecord[];
}

export function emptyData(): KnowledgeData {
  return { schemaVersion: SCHEMA_VERSION, deliverables: [], checks: [], cross: [] };
}

export function buildIdIndex(data: KnowledgeData): IdIndex {
  const index = {} as IdIndex;
  for (const t of ENTITY_TYPES) index[t] = new Set(data[t].map((r) => getId(t, r)));
  return index;
}

export function findRecord(data: KnowledgeData, type: EntityType, id: string): KnowledgeRecord | undefined {
  return data[type].find((r) => getId(type, r) === id);
}

/** 新規登録時のID候補（接頭辞＋連番） */
export function suggestId(data: KnowledgeData, type: EntityType): string {
  const prefix = ENTITIES[type].idPrefix;
  let max = 0;
  for (const r of data[type]) {
    const m = getId(type, r).match(/^(.*?)(\d+)$/);
    if (m && m[1] === prefix) max = Math.max(max, Number(m[2]));
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export interface Reference {
  type: EntityType;
  id: string;
  name: string;
  fieldLabel: string;
}

/** 指定したデータを参照している他のレコード */
export function findReferrers(data: KnowledgeData, type: EntityType, id: string): Reference[] {
  const result: Reference[] = [];
  for (const t of ENTITY_TYPES) {
    for (const f of ENTITIES[t].fields) {
      if (f.kind !== "refs" || f.refTo !== type) continue;
      for (const r of data[t]) {
        if (getList(r, f.key).includes(id)) {
          result.push({ type: t, id: getId(t, r), name: String(r.name ?? ""), fieldLabel: f.label });
        }
      }
    }
  }
  return result;
}

/** 削除されたIDへの参照を他のレコードから取り除く */
export function removeReferences(data: KnowledgeData, type: EntityType, id: string): KnowledgeData {
  const next = { ...data };
  for (const t of ENTITY_TYPES) {
    const refFields = ENTITIES[t].fields.filter((f) => f.kind === "refs" && f.refTo === type);
    if (refFields.length === 0) continue;
    next[t] = data[t].map((r) => {
      if (!refFields.some((f) => getList(r, f.key).includes(id))) return r;
      const copy = { ...r };
      for (const f of refFields) copy[f.key] = getList(r, f.key).filter((x) => x !== id);
      return copy;
    });
  }
  return next;
}

/** 成果物に関連するチェック観点（成果物側の related_viewpoint_ids と、観点側の target_deliverable_ids の和集合） */
export function relatedChecksOf(data: KnowledgeData, deliverable: KnowledgeRecord): string[] {
  const id = getId("deliverables", deliverable);
  const ids = new Set(getList(deliverable, "related_viewpoint_ids"));
  for (const c of data.checks) {
    if (getList(c, "target_deliverable_ids").includes(id)) ids.add(getId("checks", c));
  }
  return [...ids];
}

/** チェック観点の対象成果物（観点側と成果物側の和集合） */
export function targetDeliverablesOf(data: KnowledgeData, check: KnowledgeRecord): string[] {
  const id = getId("checks", check);
  const ids = new Set(getList(check, "target_deliverable_ids"));
  for (const d of data.deliverables) {
    if (getList(d, "related_viewpoint_ids").includes(id)) ids.add(getId("deliverables", d));
  }
  return [...ids];
}

/** 指定成果物を後続成果物（outputs_to）または インプット に挙げている前工程の成果物 */
export function upstreamOf(data: KnowledgeData, deliverable: KnowledgeRecord): string[] {
  const id = getId("deliverables", deliverable);
  const ids = new Set(getList(deliverable, "inputs").filter((x) => data.deliverables.some((d) => getId("deliverables", d) === x)));
  for (const d of data.deliverables) {
    if (getList(d, "outputs_to").includes(id)) ids.add(getId("deliverables", d));
  }
  ids.delete(id);
  return [...ids];
}

/** 指定成果物の後続成果物（outputs_to と、指定成果物をインプットに挙げる成果物） */
export function downstreamOf(data: KnowledgeData, deliverable: KnowledgeRecord): string[] {
  const id = getId("deliverables", deliverable);
  const ids = new Set(getList(deliverable, "outputs_to"));
  for (const d of data.deliverables) {
    if (getList(d, "inputs").includes(id)) ids.add(getId("deliverables", d));
  }
  ids.delete(id);
  return [...ids];
}
