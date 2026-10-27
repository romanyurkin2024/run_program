export type Finish = "repair" | "clean" | "prefinish" | "rough" | "needs_repair";

export const FINISH_LABELS: Record<Finish, string> = {
  repair: "С ремонтом",
  clean: "Чистовая",
  prefinish: "Предчистовая",
  rough: "Черновая",
  needs_repair: "Требует ремонта",
};

export interface PricePoint {
  date: string; // YYYY-MM-DD
  price: number;
}

export interface Seller {
  name?: string;
  type?: "owner" | "agent" | "developer" | string;
  developer?: string; // название застройщика, если продаёт он сам
  phones?: string[];
}

export interface Listing {
  id: string; // "krisha:123456"
  source: string; // "krisha"
  url: string;
  title: string;
  complex?: string;
  address?: string;
  district?: string;
  lat?: number;
  lon?: number;
  rooms?: number;
  area?: number;
  kitchenArea?: number;
  floor?: number;
  floors?: number;
  year?: number;
  condition?: string;
  buildingType?: string;
  bathroom?: string;
  photos: string[];
  photoCount?: number; // сколько фото в объявлении на сайте-источнике
  extraSavedAt?: string; // когда фото/телефон забраны закладкой «В трекер» (только в этом браузере)
  seller?: Seller;
  description?: string;
  firstSeen: string;
  lastSeen: string;
  active: boolean;
  near?: boolean; // рядом с MEGA (по ЖК/улице из config/area.json)
  group?: string; // одинаковый у объявлений одной и той же квартиры от разных продавцов
  finish?: Finish | null; // отделка: из поля «состояние» Krisha или из описания
  finishSource?: "krisha" | "description" | null;
  history: PricePoint[];
}

export interface ListingsFile {
  updatedAt: string | null;
  listings: Listing[];
}
