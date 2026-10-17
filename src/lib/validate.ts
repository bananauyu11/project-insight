import { ENTITIES, EntityType, KnowledgeRecord, getId, getList, getText, isListKind } from "./schema";

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

export interface FieldIssue {
  field?: string;
  message: string;
}

/** 必須項目・ID形式など、レコード単体で判定できる検証。エラーがあれば保存・取り込みしない。 */
export function validateRecord(type: EntityType, rec: KnowledgeRecord): FieldIssue[] {
  const def = ENTITIES[type];
  const issues: FieldIssue[] = [];
  const id = getId(type, rec);
  if (id && !ID_PATTERN.test(id)) {
    issues.push({
      field: def.idKey,
      message: `IDは半角英数字で始まり、半角英数字・「-」「_」「.」のみ使用できます（64文字以内）: "${id}"`,
    });
  }
  for (const f of def.fields) {
    if (!f.required) continue;
    const empty = isListKind(f.kind) ? getList(rec, f.key).length === 0 : getText(rec, f.key).trim() === "";
    if (empty) issues.push({ field: f.key, message: `「${f.label}」(${f.key}) は必須です` });
  }
  return issues;
}

/** 参照先IDの集合（データ種別ごと） */
export type IdIndex = Record<EntityType, Set<string>>;

/**
 * 関連IDの存在確認。参照先が未登録でも保存は可能とし（取り込み順に依存しないため）、警告として扱う。
 */
export function checkRefs(type: EntityType, rec: KnowledgeRecord, ids: IdIndex): FieldIssue[] {
  const issues: FieldIssue[] = [];
  for (const f of ENTITIES[type].fields) {
    if (f.kind !== "refs" || !f.refTo) continue;
    const missing = getList(rec, f.key).filter((ref) => !ids[f.refTo!].has(ref));
    if (missing.length > 0) {
      issues.push({
        field: f.key,
        message: `「${f.label}」に未登録の${ENTITIES[f.refTo].shortLabel}IDがあります: ${missing.join(", ")}`,
      });
    }
  }
  return issues;
}
