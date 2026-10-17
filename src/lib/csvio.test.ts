import { describe, expect, it } from "vitest";
import { applyPlan, exportCsv, exportFileName, parseListCell, planImport } from "./csvio";
import { KnowledgeData, emptyData } from "./knowledge";
import { sampleData } from "./sample";
import { ENTITY_TYPES } from "./schema";

const NOW = "2026-01-01T00:00:00.000Z";

function roundTrip(data: KnowledgeData): KnowledgeData {
  let result = emptyData();
  for (const t of ENTITY_TYPES) {
    const plan = planImport(exportCsv(t, data[t]), result, { type: t, mode: "merge", policy: "error", now: NOW });
    expect(plan.fatal).toEqual([]);
    expect(plan.counts.error).toBe(0);
    result = applyPlan(result, plan);
  }
  return result;
}

describe("エクスポート→インポート", () => {
  it("サンプルデータの意味が失われない", () => {
    const data = sampleData(NOW);
    expect(roundTrip(data)).toEqual(data);
  });

  it("特殊文字・数式風の値も保持される", () => {
    const data = sampleData(NOW);
    data.deliverables[0].name = '=HYPERLINK("x") ,"改行\nあり"';
    data.deliverables[0].content_items = ["-先頭ハイフン", 'カンマ,と"引用符"', "改行\nを含む"];
    expect(roundTrip(data)).toEqual(data);
  });
});

describe("planImport", () => {
  const base = sampleData(NOW);

  it("必須列がない場合は致命的エラー", () => {
    const plan = planImport("deliverable_id,name\nD-1,x\n", base, { type: "deliverables", mode: "merge", policy: "update" });
    expect(plan.fatal[0]).toContain("必須列がありません");
  });

  it("必須項目の欠落・ID重複・不正なJSONを行単位で検出する", () => {
    const csv = [
      "viewpoint_id,name,category,target_deliverable_ids,check_point",
      'V-100,観点A,網羅性,"[""D-001""]",確認内容',
      'V-100,観点B,網羅性,"[""D-001""]",確認内容',
      "V-101,,網羅性,[broken,確認内容",
      'bad id,観点C,網羅性,"[""D-001""]",確認内容',
    ].join("\n");
    const plan = planImport(csv, base, { type: "checks", mode: "merge", policy: "update" });
    expect(plan.rows.map((r) => r.action)).toEqual(["add", "error", "error", "error"]);
    expect(plan.rows[1].errors.join()).toContain("重複");
    expect(plan.rows[2].errors.join()).toContain("JSON");
    expect(plan.rows[2].errors.join()).toContain("観点名");
    expect(plan.rows[2].errors.join()).toContain("対象成果物");
    expect(plan.rows[3].errors.join()).toContain("ID");
  });

  it("未登録の関連IDを警告する", () => {
    const csv = 'viewpoint_id,name,category,target_deliverable_ids,check_point\nV-100,観点A,網羅性,"[""D-999""]",確認\n';
    const plan = planImport(csv, base, { type: "checks", mode: "merge", policy: "update" });
    expect(plan.rows[0].action).toBe("add");
    expect(plan.rows[0].warnings.join()).toContain("D-999");
  });

  it("同一ファイル内で追加される成果物への参照は警告しない", () => {
    const csv = [
      "deliverable_id,name,category,purpose,content_items,outputs_to",
      'D-100,A,開発,目的,"[""x""]","[""D-101""]"',
      'D-101,B,開発,目的,"[""x""]",',
    ].join("\n");
    const plan = planImport(csv, emptyData(), { type: "deliverables", mode: "merge", policy: "update" });
    expect(plan.rows.every((r) => r.warnings.length === 0)).toBe(true);
  });

  it("重複IDの扱い（更新・スキップ・エラー）を選択できる", () => {
    const csv = 'viewpoint_id,name,category,target_deliverable_ids,check_point\nV-001,新しい名前,網羅性,"[""D-001""]",確認\n';
    const opts = { type: "checks" as const, mode: "merge" as const, now: NOW };
    expect(planImport(csv, base, { ...opts, policy: "update" }).rows[0].action).toBe("update");
    expect(planImport(csv, base, { ...opts, policy: "skip" }).rows[0].action).toBe("skip");
    expect(planImport(csv, base, { ...opts, policy: "error" }).rows[0].action).toBe("error");
  });

  it("更新時はCSVに含まれない列の値を維持する", () => {
    const csv = 'viewpoint_id,name,category,target_deliverable_ids,check_point\nV-001,新しい名前,網羅性,"[""D-001""]",確認\n';
    const plan = planImport(csv, base, { type: "checks", mode: "merge", policy: "update", now: NOW });
    const after = applyPlan(base, plan);
    const v = after.checks.find((r) => r.viewpoint_id === "V-001")!;
    expect(v.name).toBe("新しい名前");
    expect(v.warning_signs).toEqual(base.checks[0].warning_signs);
    expect(after.checks.length).toBe(base.checks.length);
  });

  it("全件置換では既存データを置き換え、削除件数を示す", () => {
    const csv = "cross_viewpoint_id,name,category,information_sources,check_point\nX-100,新観点,品質,課題管理表,確認\n";
    const plan = planImport(csv, base, { type: "cross", mode: "replace", policy: "update" });
    expect(plan.removedCount).toBe(base.cross.length);
    const after = applyPlan(base, plan);
    expect(after.cross.map((r) => r.cross_viewpoint_id)).toEqual(["X-100"]);
    expect(after.cross[0].information_sources).toEqual(["課題管理表"]);
    expect(plan.notices.join()).toContain("改行区切り");
  });

  it("未知の列は無視して通知する", () => {
    const csv = "cross_viewpoint_id,name,category,information_sources,check_point,memo\nX-100,a,品質,[],確認,x\n";
    const plan = planImport(csv, base, { type: "cross", mode: "merge", policy: "update" });
    expect(plan.notices.join()).toContain("memo");
    expect(plan.rows[0].action).toBe("error"); // information_sources が空
  });
});

describe("parseListCell", () => {
  it("JSON配列・改行区切り・空を解釈する", () => {
    expect(parseListCell('["a","b"]').values).toEqual(["a", "b"]);
    expect(parseListCell("a\nb\n").values).toEqual(["a", "b"]);
    expect(parseListCell("").values).toEqual([]);
    expect(parseListCell("[1,2]").values).toEqual(["1", "2"]);
    expect(parseListCell('[{"a":1}]').error).toBeDefined();
  });
});

describe("exportFileName", () => {
  it("データ種別と出力日を含む", () => {
    expect(exportFileName("checks", new Date(2026, 9, 17))).toBe("deliverable_checks_20261017.csv");
  });
});
