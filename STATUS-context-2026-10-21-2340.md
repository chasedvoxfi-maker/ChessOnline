# Контекст — ChessOnline (2026-10-21 23:40)

Этот файл собран по истории коммитов и файлам репозитория. Сам разговор облачной сессии недоступен, поэтому решения, обсуждавшиеся только в чате, сюда не попали. Пометки «предположение» и «не проверено» значат, что это не подтверждено запуском.

## О проекте
Онлайн-шахматы в браузере с 3D-доской, камерой с наклоном, музыкой и настройками графики.

**Стек и окружение:** Vite (package: chessonline), GitHub Actions в .github.

**Репозиторий:** chasedvoxfi-maker/ChessOnline; текущая ветка claude/chess-online-game-3zik8x; коммитов 78; первый коммит 2026-09-15, последний 2026-10-06.

## История (содержательные коммиты, новые сверху)
- 2026-10-06 Fix board square-color parity; add FPS diagnostic + antialias/resolution levers
- 2026-09-27 Expand graphics settings; reorder settings; trim music list
- 2026-09-27 Fix ghost shadows on the adaptive quality path; add manual graphics settings
- 2026-09-26 Animate undo instead of snapping the board to its prior state
- 2026-09-26 Add mutual-consent undo requests to online games
- 2026-09-26 Add adaptive rendering quality for weaker devices
- 2026-09-25 Highlight back-link and upsize the launcher's game cards
- 2026-09-25 Add a "more below" scroll hint to menu sub-panels
- 2026-09-25 Split the A2HS hint by platform; add text backing on menu sub-screens
- 2026-09-25 Stop cropping the crown off the desktop menu background
- 2026-09-25 Remove the music volume control and the 2D captured-piece HUD trays
- 2026-09-25 Solve the look-at bias per-frame so both board edges touch the screen
- 2026-09-24 Recalculate camera default to fill both screen axes; add music volume control
- 2026-09-24 Replace the 3 named camera modes with a continuous +/- tilt control
- 2026-09-24 Steepen both Checkers/Corners camera views to fill the screen
- 2026-09-24 Release the landscape orientation lock when leaving a game
- 2026-09-24 Simplify the in-game music row to prev/next, no track list
- 2026-09-23 Steeper checkers camera + sequential in-game music playlist
- 2026-09-23 Tighten HUD corner spacing and add a persistent music prev/next widget
- 2026-09-24 Add files via upload
- 2026-09-24 Add files via upload
- 2026-09-24 Add files via upload
- 2026-09-23 Expand menu/game playlists from 10 to 20 slots per theme
- 2026-09-24 Add files via upload
- 2026-09-24 Add files via upload
- 2026-09-23 Fix music mute persistence and track-selection bias; add game playlist + skip button
- 2026-09-23 Remove stray menu-music-2.mp3 duplicate uploaded to repo root
- 2026-09-23 Widen captured-piece rest gap for more visible clearance from the board
- 2026-09-24 Add files via upload
- 2026-09-24 Add files via upload

## Факты, которые важно помнить
- Подробный статус и список недоделанного: STATUS.md.
- Секреты и значения переменных окружения в репозитории не записаны; список нужных переменных смотри в .env.example или replit.md, если они есть.

## Что не выполнено
- Ветка main в репозитории отсутствует: вся работа лежит в claude/chess-online-game-3zik8x и не слита в main.
- Диагностика FPS и рычаги antialias/resolution добавлены как отладочные: решить, оставлять ли.
- Не проверено: онлайн-игра на реальных устройствах и производительность на слабых телефонах.