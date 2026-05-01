# PerfRide - アプリケーション仕様書

## 概要

PerfRide は、ロードバイクサイクリスト向けのパフォーマンス管理ツールです。

### 主な機能

| 機能                 | 説明                                                                | 認証 |
| -------------------- | ------------------------------------------------------------------- | ---- |
| **Dashboard**        | Stravaアクティビティ、フィットネス進捗（CTL/ATL/TSB）、週間サマリー | 必要 |
| **Climb Simulator**  | パワー・体重からヒルクライムタイムを予測                            | 不要 |
| **Pace Optimizer**   | コースプロファイルに基づく最適ペース配分の計算                      | 不要 |
| **Training Planner** | 目標レース日からの期分けトレーニングプラン生成                      | 不要 |
| **Settings**         | FTP、体重、最大心拍数の設定（ローカル保存）                         | 不要 |

---

## 技術スタック

- **Framework**: Next.js 16 (App Router, TypeScript)
- **Authentication**: NextAuth.js + Strava OAuth
- **Charts**: Recharts
- **Deployment**: Google Cloud Run
- **Container Registry**: Google Artifact Registry

---

## 環境変数

### `web/.env.local` の設定

```bash
STRAVA_CLIENT_ID=あなたのStravaクライアントID
STRAVA_CLIENT_SECRET=あなたのStravaクライアントシークレット
STRAVA_WEBHOOK_VERIFY_TOKEN=任意の検証用トークン
NEXTAUTH_SECRET=ランダムな文字列（openssl rand -base64 32 で生成）
NEXTAUTH_URL=http://localhost:3000  # 開発環境
NEXTAUTH_URL_PRODUCTION=https://your-web-domain.example.com
GCS_BUCKET=your-gcs-bucket
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
AGENT_API_URL=http://localhost:8000
AGENT_AUDIENCE=http://localhost:8000
```

`deploy.sh` は `NEXTAUTH_URL_PRODUCTION` を本番の `NEXTAUTH_URL` として Cloud Run に設定します。

### `agent/.env` の設定

```bash
GCS_BUCKET=your-gcs-bucket
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=global
WEB_API_URL=http://localhost:3000
RECOMMEND_MODE=hybrid
USE_PERSONAL_DATA=true
WORKOUT_PLATFORM=mywhoosh
KMS_KEY_NAME=
```

通知を使う場合は `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `LINE_CHANNEL_ACCESS_TOKEN` を web 側に設定します。MyWhoosh の本番認証情報は env ではなく、ユーザーが UI で入力し、ユーザー単位で暗号化保存する方針です。

---

## Strava API 設定

### 設定場所

https://www.strava.com/settings/api

### Authorization Callback Domain

| 環境         | 設定値                                        |
| ------------ | --------------------------------------------- |
| 開発のみ     | `localhost`                                   |
| 本番のみ     | `your-cloud-run-url`            |
| 両方使う場合 | `localhost, your-cloud-run-url` |

> ⚠️ `https://` やパス (`/api/auth/callback/strava`) は **含めない**

---

## ローカル開発

### セットアップ

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev
```

### アクセス

http://localhost:3000

---

## デプロイ手順（Google Cloud Run）

### 前提条件

- gcloud CLI がインストール済み
- Docker がインストール済み
- GCPプロジェクトへのアクセス権限

PerfRide は Cloud Run 上で2サービス構成です。

| サービス | 公開範囲 | 役割 |
| -------- | -------- | ---- |
| `perfride-web` | public | Next.js、Strava OAuth、web API |
| `perfride-agent` | private | 推薦、週間プラン、ワークアウト登録 |

### Step 1: 本番用 env を設定

```bash
# web/.env.local
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_URL_PRODUCTION=https://your-web-domain.example.com
AGENT_API_URL=http://localhost:8000

# agent/.env
WEB_API_URL=https://your-web-domain.example.com
```

Cloud Run では `deploy.sh` が agent service URL を取得し、`AGENT_API_URL` と `AGENT_AUDIENCE` として web service に注入します。

### Step 2: デプロイ実行

```bash
./deploy.sh
```

このスクリプトは以下を自動実行します：

1. `web/.env.local` と `agent/.env` から環境変数を読み込み
2. `agent/` と `web/` の Docker イメージをローカルでビルド
3. Artifact Registry にプッシュ
4. private agent Cloud Run service をデプロイ
5. public web Cloud Run service をデプロイ
6. 週間プラン用 Cloud Scheduler job を作成または更新
7. 本番 URL と agent URL を表示

### Step 3: Strava OAuth 設定を更新

1. https://www.strava.com/settings/api を開く
2. 「Authorization Callback Domain」に本番ドメインを追加

   ```
   # ローカル
   localhost

   # 本番
   your-cloud-run-url
   ```

3. 保存

### Step 4: 動作確認

本番 URL（https://your-web-domain.example.com）でログインできることを確認します。加えて、agent の未認証アクセスが拒否され、web service account からは agent を呼べることを確認します。

---

## デプロイ設定詳細

### deploy.sh の設定値

| 変数 | 値 |
| ---- | -- |
| PROJECT_ID | `your-gcp-project-id` |
| REGION | `asia-northeast1` |
| REPO_NAME | `perfride-repo` |
| WEB_SERVICE_NAME | `perfride-web` |
| AGENT_SERVICE_NAME | `perfride-agent` |

### Cloud Run リソース

| サービス | Memory | CPU | Min instances | Max instances | Port |
| -------- | ------ | --- | ------------- | ------------- | ---- |
| `perfride-web` | 512Mi | 1 | 0 | 3 | 8080 |
| `perfride-agent` | 1Gi | 1 | 0 | 2 | 8000 |

app-level secret は可能な限り Secret Manager から渡します。ユーザーごとの MyWhoosh password は Secret Manager の app-level secret ではなく、KMS で暗号化してユーザー単位 storage に保存する設計です。

---

## 環境切り替えチェックリスト

### 開発 → 本番

- [ ] `web/.env.local` の `NEXTAUTH_URL_PRODUCTION` を本番 URL に設定
- [ ] `agent/.env` の `WEB_API_URL` を本番 web URL に設定
- [ ] Strava API の callback domain に本番ドメインを追加
- [ ] `./deploy.sh` を実行
- [ ] agent 未認証アクセスが拒否されることを確認
- [ ] `POST web /api/recommend` が通ることを確認

### 本番 → 開発

- [ ] `web/.env.local` の `NEXTAUTH_URL` を `http://localhost:3000` に戻す
- [ ] `web/.env.local` の `AGENT_API_URL` を `http://localhost:8000` に戻す
- [ ] `agent/.env` の `WEB_API_URL` を `http://localhost:3000` に戻す
- [ ] Strava API の callback domain が `localhost` を含むことを確認
- [ ] `npm run dev` で開発サーバー起動

---

## ファイル構成

> 詳細なファイル構成は [ARCHITECTURE.md](../../ARCHITECTURE.md) を参照してください。
> コンポーネントとロジックは各機能ディレクトリにコロケーション配置されています（例: `src/app/simulator/_lib/physics.ts`、`src/app/simulator/_components/SimulatorForm.tsx`）。

---

## 本番URL

https://your-cloud-run-url
