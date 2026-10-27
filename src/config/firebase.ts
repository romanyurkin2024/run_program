/**
 * Firebase для общих списков избранного. Эти значения — не секрет: это публичный адрес проекта,
 * он всё равно попадает в код сайта. Данные защищают правила доступа Firestore (firestore.rules).
 * null — общие списки выключены, работает только личное избранное в браузере.
 */
const PROJECT: Record<string, string> | null = null;

// для проверки на локальном эмуляторе Firebase: VITE_FIREBASE_EMULATOR=1 VITE_FIREBASE_CONFIG='{"projectId":"demo-kt",...}'
export const firebaseConfig: Record<string, string> | null = import.meta.env.VITE_FIREBASE_CONFIG
  ? JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG)
  : PROJECT;
export const useEmulator = !!import.meta.env.VITE_FIREBASE_EMULATOR;
