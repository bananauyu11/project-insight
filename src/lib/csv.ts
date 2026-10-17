/**
 * CSV の汎用パース・生成（RFC 4180 準拠）。データモデルには依存しない。
 */

export class CsvParseError extends Error {}

export interface CsvRow {
  /** 行の開始位置（ファイル上の1始まりの行番号） */
  line: number;
  cells: string[];
}

/** CSV テキストを行の配列に変換する。先頭の BOM は除去し、空行は読み飛ばす。 */
export function parseCsv(input: string): CsvRow[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: CsvRow[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStart = 1;
  let quoteStart = 1;

  const endRow = () => {
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) rows.push({ line: rowStart, cells: row });
    row = [];
    field = "";
    rowStart = line;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (c === "\n") line++;
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      quoteStart = line;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      line++;
      endRow();
    } else {
      field += c;
    }
  }
  if (inQuotes) throw new CsvParseError(`${quoteStart}行目から始まる引用符（"）が閉じられていません`);
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

function quote(value: string): string {
  return /[",\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 表計算ソフトで数式として解釈される先頭文字 */
const FORMULA_LIKE = /^'*[=+\-@\t\r]/;

/**
 * 数式インジェクション対策。数式として解釈されうる値の先頭に「'」を付与する。
 * 既に「'」で始まる同種の値にも付与することで、unescapeFormula で元の値に戻せる。
 */
export function escapeFormula(value: string): string {
  return FORMULA_LIKE.test(value) ? `'${value}` : value;
}

/** escapeFormula の逆変換（CSV 取り込み時に使用） */
export function unescapeFormula(value: string): string {
  return /^'+[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

/** 行の配列を CSV テキストに変換する（CRLF 改行・数式対策済み）。BOM は付与しない。 */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((v) => quote(escapeFormula(v))).join(",")).join("\r\n") + "\r\n";
}

/** バイト列を文字列に変換する。UTF-8（BOM 有無とも）を標準とし、不正な場合は Shift_JIS として解釈する。 */
export function decodeCsvBytes(bytes: Uint8Array): { text: string; encoding: "utf-8" | "shift_jis" } {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("shift_jis").decode(bytes), encoding: "shift_jis" };
  }
}
