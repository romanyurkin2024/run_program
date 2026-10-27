import type { Firestore } from "firebase/firestore";
import { firebaseConfig, useEmulator } from "../config/firebase";
import type { Favorite } from "./favorites";

/**
 * Общие списки избранного в Firestore. SDK грузится только когда нужен (не утяжеляет сайт).
 *
 *   lists/{listId}                 { name, createdAt, createdBy }
 *   lists/{listId}/members/{uid}   { name, joinedAt }
 *   lists/{listId}/items/{itemKey} снимок квартиры + addedBy, notes: { uid: { name, text, at } }
 *
 * listId — длинный случайный id: кто знает ссылку-приглашение, тот может вступить (как «доступ по ссылке»).
 * Вход анонимный: у каждого браузера свой uid, он переживает перезагрузки.
 */
export const cloudEnabled = !!firebaseConfig;

type Fs = typeof import("firebase/firestore");
let ready: Promise<{ db: Firestore; fs: Fs; uid: string }> | null = null;

export function connect() {
  if (!firebaseConfig) return Promise.reject(new Error("общие списки не подключены"));
  ready ??= (async () => {
    const [{ initializeApp }, auth, fs] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
    const app = initializeApp(firebaseConfig);
    const a = auth.getAuth(app);
    if (useEmulator) auth.connectAuthEmulator(a, "http://127.0.0.1:9099", { disableWarnings: true });
    await a.authStateReady();
    const user = a.currentUser ?? (await auth.signInAnonymously(a)).user;
    // локальный кэш в IndexedDB: список виден и без интернета, изменения уйдут, когда сеть вернётся
    const db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    if (useEmulator) fs.connectFirestoreEmulator(db, "127.0.0.1", 8085);
    return { db, fs, uid: user.uid };
  })();
  ready.catch(() => (ready = null));
  return ready;
}

export const itemKey = (listingId: string) => listingId.replace(/[^\w-]/g, "_");

export async function createList(name: string, me: string): Promise<string> {
  const { db, fs, uid } = await connect();
  const ref = fs.doc(fs.collection(db, "lists")); // случайный id из 20 символов
  await fs.setDoc(ref, { name, createdAt: fs.serverTimestamp(), createdBy: uid });
  await fs.setDoc(fs.doc(db, "lists", ref.id, "members", uid), { name: me, joinedAt: fs.serverTimestamp() });
  return ref.id;
}

/** Название списка по приглашению; null — такого списка нет. */
export async function listName(listId: string): Promise<string | null> {
  const { db, fs } = await connect();
  const snap = await fs.getDoc(fs.doc(db, "lists", listId));
  return snap.exists() ? (snap.data().name as string) : null;
}

export async function joinList(listId: string, me: string): Promise<void> {
  const { db, fs, uid } = await connect();
  await fs.setDoc(fs.doc(db, "lists", listId, "members", uid), { name: me, joinedAt: fs.serverTimestamp() }, { merge: true });
}

export async function leaveList(listId: string): Promise<void> {
  const { db, fs, uid } = await connect();
  await fs.deleteDoc(fs.doc(db, "lists", listId, "members", uid));
}

export async function watchList(
  listId: string,
  onItems: (items: Favorite[], members: string[]) => void,
  onError: (e: Error) => void,
): Promise<() => void> {
  const { db, fs } = await connect();
  let members: string[] = [];
  let items: Favorite[] = [];
  const u1 = fs.onSnapshot(fs.collection(db, "lists", listId, "members"), (s) => {
    members = s.docs.map((d) => d.data().name as string);
    onItems(items, members);
  }, onError);
  const u2 = fs.onSnapshot(fs.collection(db, "lists", listId, "items"), (s) => {
    items = s.docs.map((d) => d.data() as Favorite).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    onItems(items, members);
  }, onError);
  return () => {
    u1();
    u2();
  };
}

export async function myUid(): Promise<string> {
  return (await connect()).uid;
}

export async function putItem(listId: string, f: Favorite, me: string): Promise<void> {
  const { db, fs, uid } = await connect();
  const clean = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined));
  await fs.setDoc(fs.doc(db, "lists", listId, "items", itemKey(f.id)), { ...clean, addedBy: me, addedByUid: uid });
}

export async function deleteItem(listId: string, id: string): Promise<void> {
  const { db, fs } = await connect();
  await fs.deleteDoc(fs.doc(db, "lists", listId, "items", itemKey(id)));
}

export async function putNote(listId: string, id: string, me: string, text: string): Promise<void> {
  const { db, fs, uid } = await connect();
  const ref = fs.doc(db, "lists", listId, "items", itemKey(id));
  await fs.updateDoc(ref, { [`notes.${uid}`]: text ? { name: me, text, at: new Date().toISOString() } : fs.deleteField() });
}
