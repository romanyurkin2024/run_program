/**
 * Firebase для общих списков избранного. Эти значения — не секрет: это публичный адрес проекта,
 * он всё равно попадает в код сайта. Данные защищают правила доступа Firestore (firestore.rules).
 * null — общие списки выключены, работает только личное избранное в браузере.
 */
const PROJECT: Record<string, string> | null = {
  apiKey: "AIzaSyDPFLnvqJX0DHHViPAM9VrcP04k5B9htCY",
  authDomain: "kvartira-tracker-a20e0.firebaseapp.com",
  projectId: "kvartira-tracker-a20e0",
  storageBucket: "kvartira-tracker-a20e0.firebasestorage.app",
  messagingSenderId: "527214574703",
  appId: "1:527214574703:web:972b8fb6e46b858703619a",
};

// для проверки на локальном эмуляторе Firebase: VITE_FIREBASE_EMULATOR=1 VITE_FIREBASE_CONFIG='{"projectId":"demo-kt",...}'
export const firebaseConfig: Record<string, string> | null = import.meta.env.VITE_FIREBASE_CONFIG
  ? JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG)
  : PROJECT;
export const useEmulator = !!import.meta.env.VITE_FIREBASE_EMULATOR;
