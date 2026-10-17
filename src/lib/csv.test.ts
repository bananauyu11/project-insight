import { describe, expect, it } from "vitest";
import { CsvParseError, decodeCsvBytes, escapeFormula, parseCsv, toCsv, unescapeFormula } from "./csv";

describe("parseCsv", () => {
  it("引用符・カンマ・改行・エスケープされた引用符を扱える", () => {
    const rows = parseCsv('a,b,c\r\n"x,1","he said ""hi""","line1\nline2"\r\nz,,\n');
    expect(rows.map((r) => r.cells)).toEqual([
      ["a", "b", "c"],
      ["x,1", 'he said "hi"', "line1\nline2"],
      ["z", "", ""],
    ]);
  });

  it("BOMを除去し、空行を読み飛ばし、開始行番号を保持する", () => {
    const rows = parseCsv('﻿id,name\n\n1,"a\nb"\n2,c');
    expect(rows.map((r) => r.cells)).toEqual([["id", "name"], ["1", "a\nb"], ["2", "c"]]);
    expect(rows.map((r) => r.line)).toEqual([1, 3, 5]);
  });

  it("閉じられていない引用符はエラー", () => {
    expect(() => parseCsv('a\n"abc')).toThrow(CsvParseError);
  });
});

describe("toCsv", () => {
  it("parseCsv で元の値に戻る", () => {
    const data = [["id", "text"], ["1", 'カンマ,改行\r\n引用符"'], ["2", " 前後空白 "], ["3", ""]];
    expect(parseCsv(toCsv(data)).map((r) => r.cells.map(unescapeFormula))).toEqual(data);
  });

  it("数式として解釈される値をエスケープし、取り込み時に復元できる", () => {
    for (const v of ["=SUM(A1)", "+1", "-1", "@x", "'=already", "''=x", "\tTab"]) {
      const escaped = escapeFormula(v);
      expect(escaped.startsWith("'")).toBe(true);
      expect(unescapeFormula(escaped)).toBe(v);
    }
    expect(escapeFormula("通常の値")).toBe("通常の値");
    expect(escapeFormula("'quoted")).toBe("'quoted");
  });
});

describe("decodeCsvBytes", () => {
  it("UTF-8 と Shift_JIS を判別する", () => {
    const utf8 = new TextEncoder().encode("成果物");
    expect(decodeCsvBytes(utf8)).toEqual({ text: "成果物", encoding: "utf-8" });
    // 「成果物」の Shift_JIS 表現
    const sjis = new Uint8Array([0x90, 0xac, 0x89, 0xca, 0x95, 0xa8]);
    expect(decodeCsvBytes(sjis)).toEqual({ text: "成果物", encoding: "shift_jis" });
  });
});
