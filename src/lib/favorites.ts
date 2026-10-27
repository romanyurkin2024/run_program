import { useEffect, useState } from "react";
import * as cloud from "./cloud";
import { currentPrice } from "./listings";
import { Listing } from "./types";

/**
 * Избранное бывает двух видов:
 *  - личное — только в этом браузере (localStorage), переживает перезагрузки и обновления сайта;
 *  - общий список (Firestore) — у всех, кто вступил по ссылке-приглашению, обновляется сразу у всех.
 * Звёздочка добавляет в «текущий» список — его выбирают на вкладке «Избранное».
 *
 * Вместе с id храним «снимок» квартиры: если объявление снимут, карточка останется. Совпадение ищем
 * и по id, и по group — одну квартиру продают несколько агентов, главная карточка может смениться.
 */
export interface Note {
  name: string;
  text: string;
  at: string;
}

export interface Favorite {
  id: string;
  group?: string;
  addedAt: string;
  priceAtAdd: number;
  title: string;
  complex?: string;
  address?: string;
  area?: number;
  floor?: number;
  floors?: number;
  url: string;
  photo?: string;
  note?: string; // личная заметка (личное избранное)
  addedBy?: string; // общий список: кто добавил
  addedByUid?: string;
  notes?: Record<string, Note>; // общий список: заметки участников по uid
}

export interface SharedList {
  id: string;
  name: string;
}

interface Prefs {
  me: string; // имя в общих списках
  lists: SharedList[];
  active: string; // "" — личное избранное
}

const KEY = "kt.favorites.v1";
const PREFS_KEY = "kt.shared.v1";
const EVENT = "kt-favorites";

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* quota / blocked storage */
  }
}

export function loadFavorites(): Favorite[] {
  const v = read<unknown>(KEY, []);
  return Array.isArray(v) ? v : [];
}

function saveLocal(all: Favorite[]): void {
  write(KEY, all);
  dispatchEvent(new Event(EVENT));
}

export function loadPrefs(): Prefs {
  const p = read<Partial<Prefs>>(PREFS_KEY, {});
  return { me: p.me ?? "", lists: p.lists ?? [], active: p.active ?? "" };
}

function savePrefs(p: Prefs): void {
  write(PREFS_KEY, p);
  sync();
  dispatchEvent(new Event(EVENT));
}

// ---------- общий список: подписка на Firestore ----------

export type Status = "local" | "connecting" | "live" | "error";
let shared: Favorite[] = [];
let members: string[] = [];
let status: Status = "local";
let error = "";
let uid = "";
let watching = "";
let stop: (() => void) | null = null;

function emit() {
  dispatchEvent(new Event(EVENT));
}

/** Подписываемся на текущий общий список (или отписываемся, если выбрано личное). */
function sync() {
  const { active } = loadPrefs();
  if (active === watching) return;
  stop?.();
  stop = null;
  watching = active;
  shared = [];
  members = [];
  error = "";
  if (!active || !cloud.cloudEnabled) {
    status = "local";
    return;
  }
  status = "connecting";
  cloud.myUid().then((u) => ((uid = u), emit())).catch(() => undefined);
  cloud
    .watchList(
      active,
      (items, who) => {
        if (watching !== active) return;
        shared = items;
        members = who;
        status = "live";
        emit();
      },
      (e) => {
        status = "error";
        error = e.message;
        emit();
      },
    )
    .then((u) => (watching === active ? (stop = u) : u()))
    .catch((e: Error) => {
      status = "error";
      error = e.message;
      emit();
    });
}

function activeShared(): string {
  const { active } = loadPrefs();
  return cloud.cloudEnabled ? active : "";
}

export function currentFavorites(): Favorite[] {
  return activeShared() ? shared : loadFavorites();
}

// ---------- действия ----------

export function snapshot(l: Listing): Favorite {
  return {
    id: l.id,
    group: l.group,
    addedAt: new Date().toISOString(),
    priceAtAdd: currentPrice(l),
    title: l.title,
    complex: l.complex,
    address: l.address,
    area: l.area,
    floor: l.floor,
    floors: l.floors,
    url: l.url,
    photo: l.photos[0],
  };
}

const matches = (f: Favorite, l: Pick<Listing, "id" | "group">) => f.id === l.id || (!!f.group && f.group === l.group);

export function findFavorite(all: Favorite[], l: Pick<Listing, "id" | "group">): Favorite | undefined {
  return all.find((f) => matches(f, l));
}

function fail(e: Error) {
  error = `не сохранилось: ${e.message}`;
  emit();
}

export function toggleFavorite(l: Listing): void {
  const listId = activeShared();
  const all = currentFavorites();
  const found = findFavorite(all, l);
  if (listId) {
    const p = found ? cloud.deleteItem(listId, found.id) : cloud.putItem(listId, snapshot(l), loadPrefs().me);
    p.catch(fail);
    return;
  }
  saveLocal(found ? all.filter((f) => !matches(f, l)) : [snapshot(l), ...all]);
}

export function removeFavorite(id: string): void {
  const listId = activeShared();
  if (listId) cloud.deleteItem(listId, id).catch(fail);
  else saveLocal(loadFavorites().filter((f) => f.id !== id));
}

export function setNote(id: string, text: string): void {
  const listId = activeShared();
  if (listId) cloud.putNote(listId, id, loadPrefs().me, text).catch(fail);
  else saveLocal(loadFavorites().map((f) => (f.id === id ? { ...f, note: text || undefined } : f)));
}

export function setActive(listId: string): void {
  savePrefs({ ...loadPrefs(), active: listId });
}

export function setMyName(me: string): void {
  savePrefs({ ...loadPrefs(), me });
}

export async function createSharedList(name: string, me: string): Promise<string> {
  const id = await cloud.createList(name, me);
  const p = loadPrefs();
  savePrefs({ me, lists: [...p.lists, { id, name }], active: id });
  return id;
}

export async function joinSharedList(id: string, me: string): Promise<string> {
  const name = await cloud.listName(id);
  if (name === null) throw new Error("такого списка нет — проверьте ссылку");
  await cloud.joinList(id, me);
  const p = loadPrefs();
  savePrefs({ me, lists: [...p.lists.filter((l) => l.id !== id), { id, name }], active: id });
  return name;
}

export async function leaveSharedList(id: string): Promise<void> {
  await cloud.leaveList(id).catch(() => undefined); // даже без сети убираем список у себя
  const p = loadPrefs();
  savePrefs({ ...p, lists: p.lists.filter((l) => l.id !== id), active: p.active === id ? "" : p.active });
}

/** Личное избранное → в текущий общий список (то, чего там ещё нет). */
export async function copyLocalToShared(): Promise<number> {
  const listId = activeShared();
  if (!listId) return 0;
  const fresh = loadFavorites().filter((f) => !findFavorite(shared, f));
  await Promise.all(fresh.map((f) => cloud.putItem(listId, { ...f, note: undefined }, loadPrefs().me)));
  return fresh.length;
}

export function inviteLink(listId: string): string {
  return `${location.origin}${location.pathname}#/join/${listId}`;
}

/** Перенос личного избранного на другое устройство ссылкой (без общих списков). */
export function exportFavorites(all: Favorite[]): string {
  const bytes = new TextEncoder().encode(JSON.stringify(all));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function importFavorites(payload: string): number {
  const bin = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  const items: Favorite[] = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  const all = loadFavorites();
  const fresh = items.filter((f) => f && typeof f.id === "string" && !all.some((a) => a.id === f.id));
  saveLocal([...all, ...fresh]);
  return fresh.length;
}

// ---------- React ----------

export interface FavState {
  items: Favorite[];
  prefs: Prefs;
  status: Status;
  error: string;
  members: string[];
  uid: string; // мой id в общих списках — чтобы отличить свою заметку
}

function state(): FavState {
  return { items: currentFavorites(), prefs: loadPrefs(), status: activeShared() ? status : "local", error, members, uid };
}

export function useFavState(): FavState {
  const [s, setS] = useState(state);
  useEffect(() => {
    const on = () => {
      sync(); // другая вкладка могла переключить список
      setS(state());
    };
    addEventListener(EVENT, on);
    addEventListener("storage", on); // другая вкладка изменила избранное
    on();
    return () => {
      removeEventListener(EVENT, on);
      removeEventListener("storage", on);
    };
  }, []);
  return s;
}

export function useFavorites(): Favorite[] {
  return useFavState().items;
}
