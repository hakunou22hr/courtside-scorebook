# COURTSIDE SCOREBOOK

Browser-only basketball scorebook for iPad and desktop. The app records scoring, fouls, timeouts and common box-score stats, keeps a play-by-play event log, supports undo/redo and local autosave, and overlays game data on the supplied official scoresheet template for A4 printing/PDF.

## Main features
- Pre-game competition, crew, team, coach and player registration
- 1/2/3-point makes and misses
- Personal / technical / unsportsmanlike / disqualifying fouls and free-throw indication
- OREB / DREB / AST / TOV / STL / BLK
- Quarter scores, personal fouls, team fouls, running score
- Undo / redo and play-by-play
- Push-to-talk Japanese voice input when the browser supports Web Speech API
- LocalStorage autosave
- A4 print / Save as PDF
- GitHub Pages deployment

## Voice examples
- 「白 7番 2点」
- 「黒 5番 3点」
- 「白 8番 ファウル」
- 「黒 12番 ディフェンスリバウンド」
- 「白 タイムアウト」

Voice recognition is deliberately push-to-talk so surrounding gym audio is not continuously interpreted. When Web Speech API is unavailable, use the touch controls.

## Scoresheet template
`assets/official-scoresheet-template.jpg` is a web-optimized copy of the scoresheet image supplied for this project. The app places team/player/foul/running-score/final-score data over the image and prints it as one A4 portrait page.
