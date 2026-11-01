# タスくん

開いた瞬間にメモでき、フリックでステータスを動かすタスク管理Webアプリ（モバイルファースト）。

- **メモ最優先**: 起動と同時にメモ欄へフォーカス。読み込み中（スケルトン表示中）でも入力・送信でき、データ到着後に反映。書きかけは自動保存。どこで打鍵してもメモ欄に入る。日本語変換確定の Enter では送信しない。
- **分類**: タブは 今すぐ／あとで／いつか／その他／完了。メモは開いているタブの分類に入る（完了タブでは今すぐ）。
- **フリック操作**: 右フリックで完了、左フリックで次の分類へ後回し（今すぐ → あとで → いつか → その他、その他では削除）。完了タブでは左フリックで元の分類に戻す。どれもトーストから元に戻せる。ドラッグ中は背面に行き先の色とラベルが現れ、閾値を超えると振動で知らせる。タップで展開してボタン操作・編集、キーボードの ← → でも操作可。
- **AI（Workers AI）**: メモを複数タスクに分割。候補を選んで、開いているタブの分類に追加。
- **ログイン**: Google のみ。未ログインでも端末内で使え、ログイン時にアカウントへ取り込む。
- **UI**: 白ベースの Liquid Glass、全画面スケルトン、全操作にスプリングアニメーション。`prefers-reduced-motion` を尊重。

## 構成

```
Browser (React + motion)
   │  same origin
   ▼
Cloudflare Worker (Hono) ── ビルド済みSPAをWorkerに同梱して配信
   ├── D1        users / sessions / tasks（bucket + done）
   ├── Workers AI  @cf/meta/llama-3.3-70b-instruct-fp8-fast
   └── Google OAuth 2.0 (Authorization Code + PKCE)
```

## 技術選定と理由

| 領域 | 採用 | 理由 |
| --- | --- | --- |
| 実行基盤 | **Cloudflare Workers（SPAを同梱）** | フロントとAPIを1つのWorkerで同一オリジン配信できる。CORS不要で、セッションCookieを `SameSite=Lax; HttpOnly` のまま使える。エッジ配信で初回表示が速く「開いた瞬間メモ」に直結。画面一式（約150KB gzip）はビルド時に `scripts/embed-static.mjs` でWorkerに埋め込み、ハッシュ付きファイルは `immutable` でキャッシュさせる。デプロイが1回のスクリプトアップロードで完結する。 |
| DB | **Cloudflare D1** | Workersからバインディングで直接叩けるSQLite。タスクのような小さなリレーショナルデータに十分で、マイグレーションを `wrangler` で管理できる。ユーザー単位の `WHERE user_id = ?` で分離。 |
| APIフレームワーク | **Hono** | Workers向けに作られた軽量ルーター。Cookie、CSRF（Originチェック）、セキュリティヘッダーのミドルウェアが標準で揃う。 |
| AI | **Workers AI / Llama 3.3 70B (fp8-fast)** | 指定どおりWorkers AI。Workers AI の中で日本語の指示追従が比較的安定し、`fast` 版で応答も速い。JSON Schema 指定の構造化出力で受け取り、崩れた出力もサーバー側で正規化（`normalizeTasks`、ユニットテストあり）。 |
| 認証 | **自前の Google OAuth（Authorization Code + PKCE + state）** | Google のみなので Auth.js 等の汎用ライブラリは過剰。依存を増やさず100行程度で書ける。IDトークンはGoogleのトークンエンドポイントからTLSで直接受け取るため署名再検証は不要（OIDC Core 3.1.3.7）、`aud`/`iss`/`exp` は検証。セッションはランダムトークンをCookieに、DBにはSHA-256ハッシュのみ保存。 |
| フロント | **React 19 + Vite + TypeScript** | エコシステムと型安全性。初回描画を `flushSync` で同期化し、モジュール実行完了時点でメモ欄が存在・フォーカス済みになるようにした（最初の1文字を取りこぼさない）。 |
| アニメーション／ジェスチャー | **motion（旧 Framer Motion）** | フリック（`drag="x"` + 方向ロック + 弾性）、レイアウトアニメーション（並び替え・削除時の詰め）、`AnimatePresence`（出入り）、スプリング物理を1つのライブラリで賄える。縦スクロールとの両立（`touch-action: pan-y`）も面倒を見てくれる。 |
| スタイル | **素のCSS（カスタムプロパティ）** | Liquid Glass は `backdrop-filter`・多層 `box-shadow`・疑似要素のハイライトの組み合わせで、ユーティリティCSSより素のCSSのほうが書きやすく読みやすい。背景に淡い色の光をゆっくり漂わせ、ガラスの屈折感を出している。 |
| 状態管理 | **`useSyncExternalStore` の小さなストア** | 状態はタスク一覧とユーザー程度。楽観的更新＋失敗時ロールバックを数十行で書けるので、外部ライブラリは入れない。 |
| テスト | **Playwright（実ブラウザE2E）+ Vitest** | 指定どおりブラウザ操作で検証。モバイル（Pixel 7、CDP経由の実タッチイベントでフリック）とデスクトップ（マウスドラッグ）の2プロファイルで同じシナリオを実行。 |
| CI/CD | **GitHub Actions** | push で型チェック・ユニット・E2E、main への push で D1 マイグレーション→デプロイ。 |

## ローカル開発

```bash
npm install
npm run build     # vite build → Workerへ埋め込み → 型チェック
npx wrangler d1 migrations apply flick-db --local --env e2e
npx wrangler dev --env e2e        # http://localhost:8787
```

`--env e2e` はテスト専用環境で、Workers AI をスタブに置き換え（ローカルではAIにCloudflare認証が必要なため）、`/auth/dev-login?name=...` で Google を経由せずログインできます。本番設定（トップレベル）には含まれず、そのことも E2E で検証しています。

## テスト

```bash
npm run typecheck
npm test            # ユニット（AI出力の正規化）
npm run test:e2e    # Playwright：ビルド→ローカルD1→wrangler dev を自動起動
```

E2E はスケルトン表示、起動直後のフォーカスと読み込み中の入力、IME、分類タブとフリック（完了・後回し・元の分類へ戻す・削除と取り消し・閾値未満）、編集、Google認証のリダイレクト（PKCE/state）、他ユーザーのデータ分離、ゲスト→ログイン時の取り込み、AIの分割・失敗時の再試行、見た目（白ベース・backdrop-filter・横スクロールなし）を検証します。

## 本番デプロイ

1. **Google OAuth クライアント**（Google Cloud Console → APIとサービス → 認証情報 → OAuth クライアントID／ウェブアプリケーション）
   - 承認済みリダイレクトURI: `https://<your-worker>.workers.dev/auth/google/callback`
2. **Cloudflare**
   ```bash
   npx wrangler login
   npx wrangler d1 create flick-db          # 出力された database_id と account_id を wrangler.jsonc（トップレベル）に設定
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npm run deploy                           # build → リモートD1マイグレーション → deploy
   ```
3. **GitHub Actions からの自動デプロイ**（任意）: リポジトリの Secrets に `CLOUDFLARE_API_TOKEN`（Workers・D1・Workers AI の編集権限）と `CLOUDFLARE_ACCOUNT_ID` を、Variables に `CLOUDFLARE_DEPLOY=true` を設定。

## 構成ファイル

```
src/worker/   index.ts（API）auth.ts（Google OAuth・セッション）ai.ts（Workers AI）
src/client/   App.tsx, lib/store.ts（楽観的更新）, components/TaskCard.tsx（フリック）ほか
migrations/   D1 スキーマ
tests/        e2e（Playwright）, unit（Vitest）
```
