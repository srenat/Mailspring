# Task 10: Fluent UI v9 внутри рендерера Mailspring

Окружение: Linux (Hyprland/Wayland), Electron 44, React 17.0.2, Node 20 (mise). Пакеты: `@fluentui/react-components@9.74.9`, `@fluentui/react-icons@2.0.344`.

| проверка | ожидание | факт | pass/fail |
|---|---|---|---|
| RED: e2e до реализации | падает на отсутствии локатора | Playwright не смог запустить приложение: `Timed out after 30000ms waiting for main window. Found 0 window(s).` (попытка 2, `ELECTRON_OZONE_PLATFORM_HINT=x11`, без `WAYLAND_DISPLAY`: `electron.launch: Process failed to launch! signal=SIGTRAP`). Тот же симптом, что у `npm test` в Task 2 | не выполнимо в этой среде |
| `npm install` fluent-пакетов | без `ERESOLVE` | установка прошла, exit 0; в `package-lock.json` только добавления (+2070 строк, 0 удалений), `package.json` +2 строки | pass |
| `npm run typecheck` | без ошибок | без ошибок (TS 5 + React 17 + Fluent типы) | pass |
| eslint на `app/internal_packages/fluent-spike` | без ошибок | без ошибок. Спека в `playwright/` не входит в `app/tsconfig.json`, eslint на ней не применим (так же, как для существующих спек) | pass |
| e2e GREEN: кнопка открывает композер | PASS | не запускалось: приложение не стартует под Playwright здесь | не выполнимо |
| Fluent-стили/`<style data-make-styles-bucket>`, CSP | стили применены | не проверено: рендерер недоступен (CDP `--remote-debugging-port` не отвечает, окно не наблюдаемо). По коду: `style-src * 'unsafe-inline'` в `app/static/index.html` инлайн-стили Griffel разрешает | не проверено |
| Рост `app/node_modules` | заметный | 467 МБ -> 837 МБ (+370 МБ, du -sm). Из них `@fluentui/react-icons` ~298 МБ (tree-shakeable, исходники всех иконок; это не размер рантайм-бандла), `@fluentui/react-components` ~10 МБ, остальное транзитивные зависимости | факт |
| Время старта (лог `App load time`, главный процесс), 3 замера | без регрессии | без пакета: 616 / 611 / 621 мс; с пакетом: 624 / 604 / 615 мс | pass (в пределах шума) |
| Время до появления главного окна | измерено | не измерено: метки рендерера в `--enable-logging` недоступны, окно не подтверждено. `App load time` относится к главному процессу и от рендерерного кода не зависит, поэтому сравнение косвенное | не измерено |
| Размер `<style>`-инъекций | измерен | не измерено (нет рендерера) | не измерено |
| Конфликты с LESS (`body` font, `button` reset) | описаны | не проверено в рантайме. Ожидание из документации Griffel/Fluent: `FluentProvider` ставит шрифт/цвет на собственный `div`, а не на `body`; Mailspring-LESS для `button` может влиять на внутренний `<button>` — требует визуальной проверки | не проверено |

Роль регистрации: `ThreadActionsToolbarButton` существует (используется в `thread-list`, `category-picker`, `send-reminders`), заменять не пришлось. `windowTypes: {"default": true}` -- рендерится в главном окне.

Примечание: `FluentProvider` рендерит обёртку `div` на каждый экземпляр; вёрстку в тулбаре (где кнопка может рендериться в нескольких тулбарах) нужно проверить визуально при повторном запуске. E2E-тест теперь сначала выбирает тред (`openThread`), т.к. роль `ThreadActionsToolbarButton` рендерится только при выбранном треде.

## Вывод

Fluent можно внедрять покомпонентно: ДА по статическим признакам (установка без конфликтов peer-зависимостей с React 17, typecheck зелёный, регистрация через `ComponentRegistry`, CSP разрешает инлайн-стили, время старта главного процесса не изменилось), НО рантайм-поведение (применение стилей, конфликты с LESS, клик -> композер) не подтверждено, т.к. Electron/Playwright не запускаются в этой среде. Оговорки: +370 МБ в `node_modules`; обязательно перепроверить e2e и визуальный вид на машине с рабочим дисплеем (или xvfb).
