import { useEffect, useId, useMemo, useState } from "react";
import { ListingCard } from "../components/ListingCard";
import { cloudEnabled } from "../lib/cloud";
import { Finances } from "../lib/finance";
import { date, mln } from "../lib/format";
import {
  Favorite, FavState, copyLocalToShared, findFavorite, createSharedList, exportFavorites, importFavorites, inviteLink, joinSharedList,
  leaveSharedList, loadFavorites, removeFavorite, setActive, setNote, useFavState,
} from "../lib/favorites";
import { currentPrice, dedupe, sameFlat, scoreListings } from "../lib/listings";
import { Listing } from "../lib/types";

/** Текущая карточка для избранного: то же объявление, а если его нет — та же квартира у другого продавца. */
function resolve(f: Favorite, listings: Listing[]): Listing | undefined {
  const same = listings.filter((l) => l.id === f.id || (!!f.group && l.group === f.group));
  return same.find((l) => l.id === f.id && l.active) ?? same.filter((l) => l.active).sort((a, b) => currentPrice(a) - currentPrice(b))[0] ?? same[0];
}

function Field({ label, ...input }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} {...input} />
    </div>
  );
}

async function copy(text: string, ask: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    prompt(ask, text);
    return false;
  }
}

function NoteEditor({ f, mine, onSave }: { f: Favorite; mine: string; onSave: (t: string) => void }) {
  const [text, setText] = useState(mine);
  useEffect(() => setText(mine), [mine]);
  return (
    <textarea
      className="fav-note"
      placeholder="Заметка: звонили, торг, что смотреть на просмотре…"
      value={text}
      rows={1}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== mine && onSave(text.trim())}
      aria-label={`Заметка к ${f.complex ?? f.title}`}
    />
  );
}

function Notes({ f, st }: { f: Favorite; st: FavState }) {
  if (!st.prefs.active) return <NoteEditor f={f} mine={f.note ?? ""} onSave={(t) => setNote(f.id, t)} />;
  const others = Object.entries(f.notes ?? {}).filter(([u]) => u !== st.uid);
  return (
    <>
      {others.map(([u, n]) => (
        <div key={u} className="fav-other-note"><b>{n.name}:</b> {n.text}</div>
      ))}
      <NoteEditor f={f} mine={f.notes?.[st.uid]?.text ?? ""} onSave={(t) => setNote(f.id, t)} />
    </>
  );
}

/** Выбор списка, создание общего, приглашение. */
function Lists({ st }: { st: FavState }) {
  const { prefs } = st;
  const [mode, setMode] = useState<"" | "create">("");
  const [name, setName] = useState("Семья");
  const [me, setMe] = useState(prefs.me);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const active = prefs.lists.find((l) => l.id === prefs.active);

  if (!cloudEnabled) {
    return <p className="muted small">Общие списки с семьёй появятся, когда подключим базу Firebase. Пока избранное — только в этом браузере.</p>;
  }

  async function run(f: () => Promise<string | void>) {
    setBusy(true);
    setMsg("");
    try {
      setMsg((await f()) ?? "");
    } catch (e) {
      setMsg(`Не получилось: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card fav-lists">
      <div className="fav-lists-row">
        <div className="field">
          <label htmlFor="fav-list">Список</label>
          <select id="fav-list" value={prefs.active} onChange={(e) => setActive(e.target.value)}>
            <option value="">Личное (только этот браузер)</option>
            {prefs.lists.map((l) => <option key={l.id} value={l.id}>Общий: {l.name}</option>)}
          </select>
        </div>
        {active && (
          <button className="btn" disabled={busy} onClick={() => run(async () => ((await copy(inviteLink(active.id), "Отправьте ссылку тем, с кем делитесь списком")) ? "Ссылка-приглашение скопирована — отправьте её жене или кому нужно" : undefined))}>
            Пригласить
          </button>
        )}
        <button className="btn ghost" onClick={() => setMode(mode === "create" ? "" : "create")}>+ Общий список</button>
      </div>
      {active && (
        <div className="muted small" style={{ marginTop: 8 }}>
          {st.status === "connecting" && "Подключаюсь… "}
          {st.status === "error" && <span className="text-red">Нет связи с базой: {st.error}. </span>}
          {st.members.length > 0 && `В списке: ${st.members.join(", ")}. `}
          Изменения видны всем участникам сразу.{" "}
          {loadFavorites().some((f) => !findFavorite(st.items, f)) && (
            <button className="btn ghost inline" disabled={busy} onClick={() => run(async () => `Перенесено из личного: ${await copyLocalToShared()}`)}>
              Перенести сюда личное избранное
            </button>
          )}{" "}
          <button className="btn ghost inline" onClick={() => confirm(`Выйти из списка «${active.name}»? Вернуться можно по ссылке-приглашению.`) && run(() => leaveSharedList(active.id))}>
            Выйти из списка
          </button>
        </div>
      )}
      {mode === "create" && (
        <div className="fav-create">
          <Field label="Название списка" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <Field label="Ваше имя (его увидят участники)" value={me} onChange={(e) => setMe(e.target.value)} maxLength={40} placeholder="Роман" />
          <button className="btn" disabled={busy || !name.trim() || !me.trim()} onClick={() => run(async () => {
            await createSharedList(name.trim(), me.trim());
            setMode("");
            return "Список создан. Нажмите «Пригласить» и отправьте ссылку.";
          })}>Создать</button>
        </div>
      )}
      {msg && <p className="small" style={{ marginBottom: 0 }}>{msg}</p>}
    </div>
  );
}

/** Страница по ссылке-приглашению: #/join/<listId> */
export function JoinPage({ listId }: { listId: string }) {
  const [me, setMe] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("kt.shared.v1") ?? "{}").me ?? "";
    } catch {
      return "";
    }
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (!cloudEnabled) return <div className="card">Общие списки на этом сайте ещё не подключены.</div>;
  return (
    <>
      <section className="hero">
        <h1>Приглашение</h1>
        <p>Вас пригласили в общий список избранных квартир. Всё, что добавит любой участник, будет видно всем.</p>
      </section>
      <div className="card fav-create">
        <Field label="Ваше имя (его увидят участники)" value={me} onChange={(e) => setMe(e.target.value)} maxLength={40} placeholder="Например, Айгерим" autoFocus />
        <button className="btn" disabled={busy || !me.trim()} onClick={async () => {
          setBusy(true);
          try {
            const name = await joinSharedList(listId, me.trim());
            location.hash = "#/favorites";
            setMsg(`Вы в списке «${name}»`);
          } catch (e) {
            setMsg(`Не получилось: ${(e as Error).message}`);
            setBusy(false);
          }
        }}>Присоединиться</button>
        {msg && <p className="small">{msg}</p>}
      </div>
    </>
  );
}

export function FavoritesPage({ listings, fin, loading, importPayload }: { listings: Listing[]; fin: Finances; loading: boolean; importPayload?: string }) {
  const st = useFavState();
  const favs = st.items;
  const shared = !!st.prefs.active;
  const [imported, setImported] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!importPayload) return;
    try {
      const n = importFavorites(importPayload);
      setImported(n ? `Добавлено в личное избранное: ${n}` : "Всё из ссылки уже было в избранном");
    } catch {
      setImported("Ссылка повреждена — попросите прислать её ещё раз");
    }
    history.replaceState(null, "", "#/favorites");
  }, [importPayload]);

  const { groups } = useMemo(() => dedupe(listings), [listings]);
  const items = useMemo(() => {
    const found = favs.map((f) => ({ f, l: resolve(f, listings) }));
    const scored = scoreListings(found.map((x) => x.l).filter((l): l is Listing => !!l));
    return found.map(({ f, l }) => ({ f, l, s: l && scored.find((s) => s.listing.id === l.id) }));
  }, [favs, listings]);

  return (
    <>
      <section className="hero">
        <h1>Избранное</h1>
        <p>{shared ? "Общий список: видят и меняют все участники." : "Личное избранное хранится в этом браузере и не пропадает при обновлениях."}</p>
      </section>
      <Lists st={st} />
      {imported && <div className="card tight" style={{ marginBottom: 16 }}>{imported}</div>}
      {loading || st.status === "connecting" ? (
        <p className="muted">Загрузка…</p>
      ) : favs.length === 0 ? (
        <div className="card empty">
          <div className="icon">☆</div>
          <h3>Пока пусто</h3>
          <p className="muted">Нажмите ☆ на фото квартиры в списке или «В избранное» на её странице{shared ? " — квартира появится у всех участников" : ""}.</p>
        </div>
      ) : (
        <>
          <div className="toolbar" style={{ alignItems: "center" }}>
            <span className="muted small">{favs.length} в избранном</span>
            {!shared && (
              <button className="btn ghost" onClick={async () => setCopied(await copy(`${location.origin}${location.pathname}#/favorites/import/${exportFavorites(favs)}`, "Скопируйте ссылку и откройте её на другом устройстве"))}>
                {copied ? "Ссылка скопирована ✓" : "Перенести на другое устройство"}
              </button>
            )}
          </div>
          <div className="grid grid-3">
            {items.map(({ f, l, s }) => {
              const now = l ? currentPrice(l) : undefined;
              const diff = now !== undefined ? now - f.priceAtAdd : 0;
              return (
                <div key={f.id} className="fav-item">
                  {l && s ? (
                    <ListingCard s={s} fin={fin} others={sameFlat(l, groups)} />
                  ) : (
                    <div className="card fav-gone">
                      <div className="badges"><span className="badge red">Нет в выдаче Krisha</span></div>
                      <h3 style={{ margin: "8px 0 4px" }}>{f.complex ? `ЖК ${f.complex}` : f.title}</h3>
                      <div className="listing-meta">{[f.area && `${f.area} м²`, f.floor && `${f.floor}/${f.floors} эт.`, f.address].filter(Boolean).join(" · ")}</div>
                      <div className="listing-meta">Было {mln(f.priceAtAdd, 1)} · <a href={f.url} target="_blank" rel="noreferrer">открыть на Krisha ↗</a></div>
                    </div>
                  )}
                  <div className="fav-meta">
                    <span className="muted">{f.addedBy ? `${f.addedBy} добавил(а) ` : "В избранном с "}{date(f.addedAt)}, тогда {mln(f.priceAtAdd, 1)}</span>
                    {diff !== 0 && <span className={`badge ${diff < 0 ? "green" : "red"}`}>{diff < 0 ? "↓" : "↑"} {mln(Math.abs(diff), 1)} с тех пор</span>}
                    {l && !l.active && <span className="badge red">Снято</span>}
                    {l && l.id !== f.id && <span className="badge" title="Исходное объявление снято или подорожало — показываем ту же квартиру у другого продавца">другой продавец</span>}
                    <button className="btn ghost" style={{ marginLeft: "auto", padding: 0 }} onClick={() => removeFavorite(f.id)}>Убрать</button>
                  </div>
                  <Notes f={f} st={st} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
