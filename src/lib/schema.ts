/**
 * データモデル定義。
 * 3種類のナレッジ（成果物・成果物チェック観点・横断的な課題発見観点）の項目定義を一元管理し、
 * 画面（フォーム・詳細・一覧）と CSV 入出力の両方から参照する。
 */

/** CSV 列構成・保存形式のスキーマバージョン。列を変更する場合はインクリメントする。 */
export const SCHEMA_VERSION = 1;

export type EntityType = "deliverables" | "checks" | "cross";

export const ENTITY_TYPES: EntityType[] = ["deliverables", "checks", "cross"];

/**
 * text: 1行テキスト / textarea: 複数行テキスト / list: 複数値（自由記述）
 * refs: 複数値（他データのIDへの参照）
 */
export type FieldKind = "text" | "textarea" | "list" | "refs";

export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  kind: FieldKind;
  /** refs の参照先。list でも refTo を指定すると、ID一致時のみリンク表示する（緩い参照）。 */
  refTo?: EntityType;
  /** 一覧・詳細では表示しない（作成日時など） */
  system?: boolean;
  help?: string;
}

export type FieldValue = string | string[];
export type KnowledgeRecord = Record<string, FieldValue>;

export interface Deliverable extends KnowledgeRecord {
  deliverable_id: string;
  name: string;
  category: string;
  purpose: string;
  phase: string;
  owner: string;
  inputs: string[];
  content_items: string[];
  outputs_to: string[];
  related_viewpoint_ids: string[];
  description: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface DeliverableCheck extends KnowledgeRecord {
  viewpoint_id: string;
  name: string;
  category: string;
  target_deliverable_ids: string[];
  check_point: string;
  check_method: string;
  expected_state: string;
  warning_signs: string[];
  potential_impact: string;
  investigation_points: string[];
  action_examples: string[];
  description: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface CrossViewpoint extends KnowledgeRecord {
  cross_viewpoint_id: string;
  name: string;
  category: string;
  information_sources: string[];
  check_point: string;
  analysis_method: string;
  warning_signs: string[];
  hypothesis_examples: string[];
  potential_impact: string;
  investigation_points: string[];
  action_examples: string[];
  description: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface EntityDef {
  type: EntityType;
  idKey: string;
  label: string;
  shortLabel: string;
  route: string;
  csvBaseName: string;
  idPrefix: string;
  fields: FieldDef[];
  /** 分類の候補（入力補助。これ以外の値も登録可能） */
  categorySuggestions: string[];
}

const commonTail: FieldDef[] = [
  { key: "description", label: "補足説明", required: false, kind: "textarea" },
  { key: "tags", label: "タグ", required: false, kind: "list", help: "検索用。別名や会社・案件固有の呼称もここに登録できます。" },
  { key: "created_at", label: "作成日時", required: false, kind: "text", system: true },
  { key: "updated_at", label: "更新日時", required: false, kind: "text", system: true },
];

export const ENTITIES: Record<EntityType, EntityDef> = {
  deliverables: {
    type: "deliverables",
    idKey: "deliverable_id",
    label: "成果物カタログ",
    shortLabel: "成果物",
    route: "/deliverables",
    csvBaseName: "deliverables",
    idPrefix: "D-",
    categorySuggestions: [
      "構想・企画",
      "要件定義",
      "基本設計",
      "詳細設計",
      "開発",
      "テスト",
      "移行",
      "運用・保守",
      "プロジェクト管理",
      "品質管理",
      "その他",
    ],
    fields: [
      { key: "deliverable_id", label: "成果物ID", required: true, kind: "text" },
      { key: "name", label: "成果物名", required: true, kind: "text", help: "一般的な名称を基本とします。" },
      { key: "category", label: "分類", required: true, kind: "text" },
      { key: "purpose", label: "作成目的", required: true, kind: "textarea" },
      { key: "phase", label: "作成工程", required: false, kind: "text" },
      { key: "owner", label: "作成主体・担当", required: false, kind: "text" },
      {
        key: "inputs",
        label: "インプット",
        required: false,
        kind: "list",
        refTo: "deliverables",
        help: "成果物IDまたは自由記述。登録済みの成果物IDはリンクとして表示されます。",
      },
      { key: "content_items", label: "主な記載項目", required: true, kind: "list", help: "何を記載するのか分かる粒度で記述します。" },
      { key: "outputs_to", label: "関連する後続成果物", required: false, kind: "refs", refTo: "deliverables" },
      { key: "related_viewpoint_ids", label: "関連チェック観点", required: false, kind: "refs", refTo: "checks" },
      ...commonTail,
    ],
  },
  checks: {
    type: "checks",
    idKey: "viewpoint_id",
    label: "成果物チェック観点",
    shortLabel: "チェック観点",
    route: "/checks",
    csvBaseName: "deliverable_checks",
    idPrefix: "V-",
    categorySuggestions: [
      "網羅性",
      "整合性",
      "正確性",
      "実現性",
      "明確性",
      "追跡可能性",
      "品質",
      "効率性",
      "保守性",
      "運用性",
      "セキュリティ",
      "その他",
    ],
    fields: [
      { key: "viewpoint_id", label: "観点ID", required: true, kind: "text" },
      { key: "name", label: "観点名", required: true, kind: "text" },
      { key: "category", label: "観点分類", required: true, kind: "text" },
      { key: "target_deliverable_ids", label: "対象成果物", required: true, kind: "refs", refTo: "deliverables" },
      { key: "check_point", label: "確認する内容", required: true, kind: "textarea", help: "原則として1つの主要な確認事項を設定します。" },
      { key: "check_method", label: "確認方法", required: false, kind: "textarea" },
      { key: "expected_state", label: "期待される状態", required: false, kind: "textarea" },
      { key: "warning_signs", label: "問題の兆候", required: false, kind: "list", help: "確認可能な事実や状態として記載します。" },
      { key: "potential_impact", label: "想定される影響", required: false, kind: "textarea" },
      { key: "investigation_points", label: "追加確認事項", required: false, kind: "list" },
      { key: "action_examples", label: "対応例", required: false, kind: "list", help: "一律の正解ではなく、検討の参考情報です。" },
      ...commonTail,
    ],
  },
  cross: {
    type: "cross",
    idKey: "cross_viewpoint_id",
    label: "横断的な課題発見観点",
    shortLabel: "横断観点",
    route: "/cross",
    csvBaseName: "cross_cutting",
    idPrefix: "X-",
    categorySuggestions: [
      "進捗・スケジュール",
      "品質",
      "コスト・工数",
      "生産性・効率性",
      "課題・リスク",
      "体制・要員",
      "役割・責任",
      "意思決定",
      "コミュニケーション",
      "要件・スコープ",
      "変更管理",
      "ベンダー・チーム間連携",
      "顧客価値・目的達成",
      "その他",
    ],
    fields: [
      { key: "cross_viewpoint_id", label: "観点ID", required: true, kind: "text" },
      { key: "name", label: "観点名", required: true, kind: "text" },
      { key: "category", label: "観点分類", required: true, kind: "text" },
      { key: "information_sources", label: "分析対象の情報源", required: true, kind: "list" },
      { key: "check_point", label: "確認する内容", required: true, kind: "textarea" },
      { key: "analysis_method", label: "分析方法", required: false, kind: "textarea", help: "定量分析・定性分析のいずれも記述できます。" },
      { key: "warning_signs", label: "問題の兆候", required: false, kind: "list" },
      { key: "hypothesis_examples", label: "想定原因・仮説", required: false, kind: "list", help: "確定した事実ではなく仮説として記載します。" },
      { key: "potential_impact", label: "想定される影響", required: false, kind: "textarea" },
      { key: "investigation_points", label: "追加確認事項", required: false, kind: "list" },
      { key: "action_examples", label: "対応例", required: false, kind: "list" },
      ...commonTail,
    ],
  },
};

/** 情報源の入力候補 */
export const INFORMATION_SOURCE_SUGGESTIONS = [
  "WBS・スケジュール",
  "課題管理表",
  "リスク管理表",
  "品質評価資料",
  "成果物レビュー結果",
  "会議議事録",
  "要員計画・体制図",
  "工数実績",
  "変更管理記録",
  "テスト結果",
  "移行計画・実績",
  "運用実績",
];

export function isListKind(kind: FieldKind): boolean {
  return kind === "list" || kind === "refs";
}

export function getId(type: EntityType, rec: KnowledgeRecord): string {
  const v = rec[ENTITIES[type].idKey];
  return typeof v === "string" ? v : "";
}

export function getText(rec: KnowledgeRecord, key: string): string {
  const v = rec[key];
  return typeof v === "string" ? v : "";
}

export function getList(rec: KnowledgeRecord, key: string): string[] {
  const v = rec[key];
  return Array.isArray(v) ? v : [];
}

/** 全項目を既定値（空文字・空配列）で埋めた空レコードを作る */
export function emptyRecord(type: EntityType): KnowledgeRecord {
  const rec: KnowledgeRecord = {};
  for (const f of ENTITIES[type].fields) rec[f.key] = isListKind(f.kind) ? [] : "";
  return rec;
}

/** 欠けている項目を補い、型を正規化する（保存データ読み込み時など） */
export function normalizeRecord(type: EntityType, input: Record<string, unknown>): KnowledgeRecord {
  const rec = emptyRecord(type);
  for (const f of ENTITIES[type].fields) {
    const v = input[f.key];
    if (isListKind(f.kind)) {
      rec[f.key] = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } else {
      rec[f.key] = typeof v === "string" ? v : "";
    }
  }
  return rec;
}
