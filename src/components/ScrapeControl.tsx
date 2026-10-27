import { useEffect, useState } from "react";

const REPO = "romanyurkin2024/run_program";
const WORKFLOW = "scrape.yml";
const API = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}`;
const ACTIONS_PAGE = `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`;
const TOKEN_KEY = "kt.gh.v1";

type Run = { id: number; status: string; conclusion: string | null; html_url: string; created_at: string };
type State =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "running"; run?: Run; since: number }
  | { kind: "done"; run: Run }
  | { kind: "error"; message: string };

function loadToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveToken(t: string) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

async function gh(path: string, token: string, init?: RequestInit) {
  const r = await fetch(path, {
    ...init,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...init?.headers },
  });
  if (!r.ok) {
    const hint = r.status === 401 ? "токен неверный или истёк" : r.status === 403 || r.status === 404 ? "у токена нет доступа к Actions этого репозитория" : `ошибка GitHub ${r.status}`;
    throw new Error(hint);
  }
  return r.status === 204 ? null : r.json();
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Кнопка «Запустить сбор»: запускает workflow Scrape через GitHub API токеном, который хранится только в этом браузере. */
export function ScrapeControl({ updatedAt }: { updatedAt?: string | null }) {
  const [token, setToken] = useState(loadToken);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [setup, setSetup] = useState(false);
  const [draft, setDraft] = useState("");
  const [notify, setNotify] = useState(true);

  // пока сбор идёт — раз в 15 секунд спрашиваем GitHub о статусе
  useEffect(() => {
    if (state.kind !== "running") return;
    const t = setInterval(async () => {
      try {
        const data = await gh(`${API}/runs?event=workflow_dispatch&per_page=1`, token);
        const run: Run | undefined = data.workflow_runs[0];
        if (!run || new Date(run.created_at).getTime() < state.since - 60_000) return; // наш запуск ещё не появился
        if (run.status === "completed") setState({ kind: "done", run });
        else setState({ kind: "running", run, since: state.since });
      } catch (e) {
        setState({ kind: "error", message: (e as Error).message });
      }
    }, 15_000);
    return () => clearInterval(t);
  }, [state, token]);

  async function start() {
    if (!token) return setSetup(true);
    setState({ kind: "starting" });
    try {
      await gh(`${API}/dispatches`, token, {
        method: "POST",
        body: JSON.stringify({ ref: "main", inputs: { probe: "false", notify: notify ? "true" : "false" } }),
      });
      setState({ kind: "running", since: Date.now() });
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  async function connect() {
    const t = draft.trim();
    if (!t) return;
    try {
      await gh(`${API}/runs?per_page=1`, t); // проверяем, что токен видит Actions репозитория
      saveToken(t);
      setToken(t);
      setDraft("");
      setSetup(false);
      setState({ kind: "idle" });
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  const busy = state.kind === "starting" || state.kind === "running";
  return (
    <div className="card scrape-control">
      <div className="scrape-row">
        <div>
          <div className="scrape-title">{updatedAt ? `Данные от ${when(updatedAt)}` : "Данные ещё не собирались"}</div>
          <div className="muted small">
            {state.kind === "starting" && "Запускаю сбор…"}
            {state.kind === "running" && (
              <>
                Идёт сбор всех объявлений района — обычно 6–8 минут.{" "}
                {state.run && <a href={state.run.html_url} target="_blank" rel="noreferrer">Ход в GitHub</a>}
              </>
            )}
            {state.kind === "done" && (state.run.conclusion === "success" ? "Сбор завершён, сайт обновлён." : `Сбор завершился с ошибкой (${state.run.conclusion}). `)}
            {state.kind === "done" && state.run.conclusion !== "success" && <a href={state.run.html_url} target="_blank" rel="noreferrer">Подробности</a>}
            {state.kind === "error" && <span className="text-red">Не получилось: {state.message}</span>}
            {state.kind === "idle" && "Автоматически — каждый день в 06:13 по Алматы"}
          </div>
        </div>
        <div className="scrape-actions">
          {state.kind === "done" && state.run.conclusion === "success" ? (
            <button className="btn" onClick={() => location.reload()}>Обновить страницу</button>
          ) : (
            <button className="btn" onClick={start} disabled={busy}>{busy ? "Сбор идёт…" : "Запустить сбор"}</button>
          )}
          {token && !busy && (
            <label className="small muted check">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> отчёт в Telegram
            </label>
          )}
        </div>
      </div>
      {setup && !token && (
        <div className="scrape-setup">
          <p className="small">
            Сайт статический, поэтому запускать сбор он может только от вашего имени через GitHub. Нужно один раз подключить
            ключ — он хранится <b>только в этом браузере</b> и умеет лишь запускать сборы в этом репозитории.
          </p>
          <ol className="small">
            <li>
              Откройте{" "}
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">GitHub → Fine-grained token</a>.
            </li>
            <li>Name — «Квартира: кнопка сбора», Expiration — на ваш выбор (например, 1 год).</li>
            <li>Repository access → <b>Only select repositories</b> → <code>run_program</code>.</li>
            <li>Permissions → Repository permissions → <b>Actions: Read and write</b>. Больше ничего не включайте.</li>
            <li>Generate token, скопируйте и вставьте сюда. В чат и мессенджеры токен не отправляйте.</li>
          </ol>
          <div className="scrape-token">
            <input type="password" autoComplete="off" placeholder="github_pat_…" value={draft} onChange={(e) => setDraft(e.target.value)} />
            <button className="btn" onClick={connect} disabled={!draft.trim()}>Подключить</button>
          </div>
          <p className="small muted">
            Без ключа можно запустить и вручную: <a href={ACTIONS_PAGE} target="_blank" rel="noreferrer">GitHub → Actions → Scrape</a> → «Run workflow».
          </p>
        </div>
      )}
      {token && !busy && (
        <button className="btn ghost small-link" onClick={() => { saveToken(""); setToken(""); setState({ kind: "idle" }); }}>
          Отключить ключ в этом браузере
        </button>
      )}
    </div>
  );
}
