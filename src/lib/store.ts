"use client";

/**
 * ブラウザ内ストレージ（localStorage）によるデータ保存。
 * useSyncExternalStore で購読し、別タブでの変更も反映する。
 */
import { useSyncExternalStore } from "react";
import { KnowledgeData, emptyData, removeReferences } from "./knowledge";
import { ENTITY_TYPES, EntityType, KnowledgeRecord, SCHEMA_VERSION, getId, normalizeRecord } from "./schema";

const STORAGE_KEY = "project-insight:data";

let cache: KnowledgeData | null = null;
const listeners = new Set<() => void>();
const SERVER_SNAPSHOT = emptyData();

/** 保存データを読み込み、現行スキーマに合わせて正規化する */
export function deserialize(raw: string | null): KnowledgeData {
  if (!raw) return emptyData();
  const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
  const version = typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 1;
  if (version > SCHEMA_VERSION) {
    throw new Error(`保存データのスキーマバージョン(${version})がこのアプリ(${SCHEMA_VERSION})より新しいため読み込めません`);
  }
  const data = emptyData();
  for (const t of ENTITY_TYPES) {
    const list = parsed[t];
    if (Array.isArray(list)) {
      data[t] = list.filter((x) => x && typeof x === "object").map((x) => normalizeRecord(t, x as Record<string, unknown>));
    }
  }
  return data;
}

function read(): KnowledgeData {
  if (cache) return cache;
  try {
    cache = deserialize(window.localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    console.error(e);
    cache = emptyData();
  }
  return cache;
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getData(): KnowledgeData {
  return read();
}

/** データ全体を保存する。容量不足などで保存できない場合は例外を投げる（表示中のデータは変更しない）。 */
export function setData(next: KnowledgeData) {
  const value = { ...next, schemaVersion: SCHEMA_VERSION };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    throw new Error("ブラウザ内ストレージに保存できませんでした（容量不足の可能性があります）。CSVでバックアップしてください。");
  }
  cache = value;
  emit();
}

export function upsertRecord(type: EntityType, rec: KnowledgeRecord, originalId?: string) {
  const data = read();
  const key = originalId ?? getId(type, rec);
  const exists = data[type].some((r) => getId(type, r) === key);
  const list = exists ? data[type].map((r) => (getId(type, r) === key ? rec : r)) : [...data[type], rec];
  setData({ ...data, [type]: list });
}

/** レコードを削除し、他のレコードからの参照も解除する */
export function deleteRecord(type: EntityType, id: string) {
  const data = read();
  const next = removeReferences({ ...data, [type]: data[type].filter((r) => getId(type, r) !== id) }, type, id);
  setData(next);
}

/** 保存済みデータを購読する。hydrated はクライアントで保存データを読み込み済みかどうか。 */
export function useKnowledge(): { data: KnowledgeData; hydrated: boolean } {
  const data = useSyncExternalStore(subscribe, read, () => SERVER_SNAPSHOT);
  return { data, hydrated: data !== SERVER_SNAPSHOT };
}
