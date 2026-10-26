import { useEffect, useRef, useState } from "react";
import { bookmarkletSource } from "../lib/extras";

export function BookmarkletPage() {
  const site = `${location.origin}${import.meta.env.BASE_URL}`;
  const code = bookmarkletSource(site);
  const link = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);
  // React не даёт отрендерить javascript:-ссылку, поэтому ставим href напрямую
  useEffect(() => link.current?.setAttribute("href", code), [code]);

  return (
    <>
      <section className="hero">
        <h1>Закладка «В трекер»</h1>
        <p>
          Забирает все фото, телефон и полное описание со страницы объявления на Krisha, которую вы открыли
          в своём браузере. Данные сохраняются только в этом браузере.
        </p>
      </section>

      <div className="grid grid-2">
        <div className="card">
          <h3>💻 Компьютер</h3>
          <ol className="steps">
            <li>Включите панель закладок: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> (на Mac <kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>).</li>
            <li>
              Перетащите эту кнопку на панель закладок:
              <div style={{ margin: "14px 0" }}>
                <a ref={link} className="btn bookmarklet" onClick={(e) => { e.preventDefault(); alert("Не нажимайте здесь — перетащите кнопку на панель закладок"); }}>
                  📥 В трекер
                </a>
              </div>
            </li>
            <li>Откройте объявление на krisha.kz. Если нужен телефон — сначала нажмите «Показать телефон».</li>
            <li>Нажмите закладку «📥 В трекер» — откроется трекер с сохранёнными фото.</li>
          </ol>
        </div>

        <div className="card">
          <h3>📱 Телефон</h3>
          <ol className="steps">
            <li>
              Скопируйте код закладки:{" "}
              <button className="btn" onClick={() => navigator.clipboard.writeText(code).then(() => setCopied(true))}>
                {copied ? "Скопировано ✓" : "Скопировать код"}
              </button>
            </li>
            <li><b>iPhone (Safari):</b> добавьте в закладки любую страницу, затем «Закладки» → «Изменить» → откройте её, назовите «В трекер» и вставьте код вместо адреса.</li>
            <li><b>Android (Chrome):</b> добавьте любую страницу в закладки, отредактируйте её: имя «В трекер», в поле адреса вставьте код.</li>
            <li>
              На странице объявления: в iPhone откройте закладки и нажмите «В трекер»; в Chrome наберите в адресной строке
              «В трекер» и выберите закладку из подсказок.
            </li>
          </ol>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Как это работает</h3>
        <p className="muted" style={{ marginBottom: 0 }}>
          Закладка — это маленький скрипт. Он читает уже открытую вами страницу объявления (капчу при этом проходите вы сами),
          находит фото галереи, ссылки на телефон и описание, и открывает трекер, передавая их в адресе страницы.
          Трекер сохраняет их в памяти этого браузера и показывает в карточке квартиры. На сервер и в GitHub ничего не отправляется.
        </p>
      </div>
    </>
  );
}
