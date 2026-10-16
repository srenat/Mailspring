# Task 5 — CI-сборка клиента без подписи (macOS / Windows) с нашим движком

Дата: 2026-10-16. Ветка `phase0-spike` форка `srenat/Mailspring`, коммит `a916543e5`.

## Движок

Pre-release на форке движка: https://github.com/srenat/Mailspring-Sync/releases/tag/phase0-mailsync-ea0b3a9
(target `ea0b3a9a66e7ad43782e04ec530ab0450109eb84`, unsigned CI-сборка из Task 4).

| asset | размер, байт | sha256 |
|---|---|---|
| mailsync-linux.tar.gz | 18 741 658 | b52fb7593bcf004b690820c11f89bb86b7c2472874df3e7f2c66a4b8f4cd2516 |
| mailsync-linux-arm64.tar.gz | 19 173 018 | 69212b6f9d8df02563aa30b67f6faea435c0a9a65c8710e5f0dfb16a7f28baa5 |
| mailsync-macos.tar.gz | 4 603 094 | 4ff60dc0c0862ac92fd3f698355d60880ba6a4c793467912a50982e614f739da |
| mailsync-windows.tar.gz | 30 440 139 | 3906bab9e64d58d45652b2376b1df82fbf31cb57534725ec9c26e320bafb068d |

`mailsync` для macOS — universal (x86_64 + arm64), поэтому один tarball идёт в обе mac-сборки.

## Механизм

- `scripts/postinstall.js`: если задан `MAILSYNC_PREBUILT_DIR`, распаковывает `${MAILSYNC_PREBUILT_DIR}/mailsync.tar.gz`
  в `app/` и не ходит ни в S3, ни в сабмодуль; нет файла или ошибка распаковки — exit 1.
- `build-macos.yaml` / `build-windows.yaml`: убраны guard на master, codesign, provisioning profile, AWS/S3,
  Azure Trusted Signing и проверка подписей; lint оставлен. Input `mailsync_release`
  (default `phase0-mailsync-ea0b3a9`) → `curl` ассета релиза в `mailsync-prebuilt/mailsync.tar.gz`
  → `MAILSYNC_PREBUILT_DIR` для `npm ci`. Артефакты через `actions/upload-artifact@v7`, хранение 7 дней.
- Дополнительно `push`-триггер на `phase0-spike` с фильтром путей (свой workflow + postinstall.js):
  до первого push форк не регистрировал workflow, и `workflow_dispatch` с не-default ветки давал 404.
- Раннеры не менялись: `macos-26`, `macos-26-intel`, `windows-2022` — все доступны в форке.

## Прогоны

| run | workflow | джоб | длительность джоба | итог |
|---|---|---|---|---|
| [38896793316](https://github.com/srenat/Mailspring/actions/runs/38896793316) | Build for macOS | macos-26, arm64 | 7 мин 12 с (npm ci 2:43, build 3:09) | success |
| 38896793316 | Build for macOS | macos-26-intel, x64 | 12 мин 31 с (npm ci 4:07, build 5:46) | success |
| [38896798035](https://github.com/srenat/Mailspring/actions/runs/38896798035) | Build for Windows | windows-2022 | 11 мин 38 с (npm ci 3:16, build 3:00, installer 3:56) | success |

Общее время по часам: macOS 12 мин 40 с, Windows 11 мин 43 с (параллельно). Других запусков
(build-linux*, test) push'и не вызвали — в форке только эти 2 run.

## Артефакты

| артефакт | размер (zip) | содержимое |
|---|---|---|
| Mailspring-macos-arm64 | 220 513 908 | Mailspring-macos-arm64.zip (221 089 612) → Mailspring.app |
| Mailspring-macos-x64 | 224 334 863 | Mailspring-macos-x64.zip → Mailspring.app |
| Mailspring-windows | 563 426 190 | MailspringSetup.exe (282 277 888), Mailspring-1.26.0-full.nupkg (281 915 151), RELEASES |

## Проверки

| проверка | ожидание | факт | pass/fail |
|---|---|---|---|
| postinstall локально, `MAILSYNC_PREBUILT_DIR` = linux tarball, код до правки (RED) | движок не подменяется | сообщение про сабмодуль, `app/mailsync.bin` прежний (58646d76…) | RED подтверждён |
| то же после правки (GREEN) | наш `mailsync.bin` в `app/`, нет `Downloaded Mailsync prebuilt` | sha256 `e6265c2f…` = бинарь из tarball, строки про S3 нет | pass |
| переменная не задана, сабмодуль есть | старое поведение | сообщение про сабмодуль | pass |
| переменная не задана, без `build.sh` | старое поведение (S3) | идёт в S3 (`gea0b3a9` там нет → AccessDenied, как и раньше) | pass |
| переменная указывает на пустой каталог | ошибка | exit 1, понятное сообщение | pass |
| CI: postinstall взял наш tarball | лог «Unpacking prebuilt Mailsync», sha ассета | во всех 3 джобах; sha256 скачанного = sha релиза | pass |
| 3 джоба зелёные | success | success ×3 | pass |
| mailsync в macOS arm64 .app = релизный | sha256 совпадает | `Contents/Resources/app.asar.unpacked/mailsync` e920c04b…f0de = mailsync из mailsync-macos.tar.gz | pass |
| mailsync в macOS x64 .app = релизный | sha256 совпадает | e920c04b…f0de | pass |
| Windows-пакет содержит наш mailsync.exe | есть, sha совпадает | `lib/net45/resources/app.asar.unpacked/mailsync.exe` (+ mailcore2.dll, libetpan.dll) 599d85fd…0b15 = из mailsync-windows.tar.gz | pass |
| Установщик собран без подписи | MailspringSetup.exe есть | PE32 GUI, Squirrel-установщик + full nupkg + RELEASES | pass |
| Smoke на Mac (распаковать, `xattr -dr com.apple.quarantine`, запуск, онбординг, IMAP `alice@`, синк) | работает | **не проверено на железе** | — |
| Smoke на Windows (SmartScreen → «Выполнить в любом случае», онбординг, IMAP, синк) | работает | **не проверено на железе** | — |

## Вывод

Сборки без подписи для macOS (arm64, x64) и Windows собираются в форке за ~12 мин и содержат
наш движок (побайтово совпадает с релизом `phase0-mailsync-ea0b3a9`). Запуск на реальных Mac и Windows
не проверен — это остаётся условием go для пользователя.
