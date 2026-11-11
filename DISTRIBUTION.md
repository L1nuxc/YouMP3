# Сборка YouMP3 для Windows

Для готового установщика эта инструкция не нужна.

## Подготовка

1. Установите Node.js 22+ и FFmpeg для Windows x64 с MP3, AAC, FLAC, Opus и PCM.
2. Выполните npm ci. Если Electron не установлен автоматически: node node_modules/electron/install.js.
3. Запустите powershell -ExecutionPolicy Bypass -File setup.ps1.
4. Положите node.exe и ffmpeg.exe в tools/; yt-dlp.exe загрузит setup.ps1.
5. Положите лицензии компонентов в tools/licenses/. См. [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Бинарные инструменты не хранятся в Git.

## Проверка и сборка

```powershell
npm test
npm run test:ui
npm run format:check
npm run dist
```

Результат: release/YouMP3-Setup-1.0.0-x64.exe.
В установщик включаются runtime, кодеки и resources/YouMP3-source.zip.
Перед сборкой исходники собираются по списку разрешённых файлов. Пользовательские данные и локальные инструменты в архив не входят.

## Выпуск

Повышайте version в package.json и package-lock.json.
Workflow .github/workflows/release.yml проверяет код, собирает приложение и публикует установщик, blockmap, yoump3-v1.yml и архив исходников.
Достаточно стандартного GITHUB_TOKEN с правом contents: write. Существующий тег не перезаписывается.

Для серии сборок используется канал yoump3-v1. Имя манифеста в конфигурации сборщика, runtime и workflow должно совпадать.
Проверка обновления не запускает скачивание. Скачивание и установка выполняются отдельными действиями пользователя.
Установка ждёт завершения активных задач.

Установщик пока не подписан сертификатом издателя.

## Данные

Desktop выбирает случайный свободный порт на 127.0.0.1.
Данные хранятся в %APPDATA%\yoump3-local\audio; настройки интерфейса сохраняются сервером независимо от выбранного порта.
При запуске исходников используется downloads/.

Доступны PORT, YTDLP_PATH, FFMPEG_PATH, YOUMP3_NODE, YOUMP3_DOWNLOADS, YOUMP3_EXPORTS и YOUMP3_SEARCH_PLUGINS.
EXE задаёт пути инструментов автоматически.

При замене FFmpeg обновляйте лицензии и сведения об исходниках сборки.
