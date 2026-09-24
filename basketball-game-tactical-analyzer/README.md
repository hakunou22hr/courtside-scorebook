# Basketball Game Tactical Analyzer

試合動画を見ながら、コーチの観察を時系列に残し、直近3ポゼッションに絞った短い助言へ変換する **独立した React / TypeScript / Vite プロジェクト**です。Phase 1は完全自動判定ではなく、現場で確実に動く手動タグ＋ルールベース解析を優先します。動画はブラウザ内で再生し、サーバーへ送信しません。

## 構成と設計

- `src/types.ts`: `VideoObservation`、`Possession`、`PlayerPosition`、`Event`、`TacticalFinding`、`CoachAdvice` の境界モデル
- `src/engine.ts`: UIや映像処理から独立した交換可能なルールベース戦術エンジン
- `src/db.ts`: IndexedDBによる試合・タイムライン・カードの端末内保存
- `src/App.tsx`: 動画、タグ、コーチングカード、タイムライン、レビュー、エクスポート
- 将来のPhase 2〜4では、映像観察を上記のデータモデルへ変換するアダプターを追加し、戦術エンジンとは分離します。

## 起動

```bash
npm install
npm run dev
```

表示されたURLをブラウザで開きます。ビルドとテストは `npm run build`、`npm run test` です。

## PCでの使い方

1. 試合名、対戦相手、日付を入力し「動画を選択」で MP4 / MOV / WebM を読み込みます。
2. 濃色・淡色、解析視点を選び、該当時刻で `GOOD PLAY`、`CHECK`、`FIX` を押します。必要ならメモ、Q、信頼度を先に変更します。
3. 「今すぐ選手に伝える」で短いコーチングカードを生成します。
4. タイムラインの項目を押すと動画の時刻へ戻ります。「試合を保存」でIndexedDBへ保存します。
5. 試合後レビューを確認し、HTML/PDF印刷、JSON、CSVで共有します。ブラウザの印刷画面で「PDFに保存」を選べます。

## iPadでの使い方

横向きを推奨します。Safariで動画を選び、左の動画と右の観察パネルを使います。画面幅が狭い場合は縦配置になります。ファイル選択から写真ライブラリまたはファイル内の動画を指定できます。

## iPhoneでの使い方

動画 → 大きな解析ボタン → コーチングカード → タイムラインの順に縦へ並びます。Safariでは動画をインライン再生できるよう `playsInline` を利用しています。細かな解析補助は折りたたんだまま運用できます。

## DEMO MODE

動画選択前に「動画なしで DEMO MODE」を押すと、サンプルの成功プレー、守備修正、セカンドショットを読み込み、全機能を確認できます。

## PWAとしてホーム画面へ追加

一度オンラインで公開URLを開いたあと、iPhone / iPadのSafariで共有ボタン →「ホーム画面に追加」を選択します。PCではアドレスバーのインストールアイコンを利用できます。基本画面、保存済み解析、ルールベース解析はキャッシュ後にオフライン利用できます。外部AIを将来接続した場合、その機能はオフラインでは利用できません。APIキーはフロントエンドに置かず、必ずサーバー側で管理してください。

## GitHub Pagesへの公開

`vite.config.ts` は相対パスの `base: './'` を使用しています。

```bash
npm run build
# dist/ を GitHub Pages の公開元へデプロイ
```

GitHub Actionsを使う場合は、Node.jsで `npm ci && npm run build` を実行し、`dist` を `actions/upload-pages-artifact` と `actions/deploy-pages` で公開してください。Repository Settings → Pages → Source を **GitHub Actions** に設定します。

## プライバシー

選択した動画は `URL.createObjectURL` で端末内再生し、アップロードしません。保存対象は動画ファイル本体ではなく動画名・解析情報です。共有前には未成年選手の氏名等がメモに含まれないか確認してください。AIの低信頼な判断は「低」または「判断困難」とし、コーチが編集・確認する前提です。
