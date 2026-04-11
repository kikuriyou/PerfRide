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

### `.env.local` の設定

```bash
STRAVA_CLIENT_ID=あなたのStravaクライアントID
STRAVA_CLIENT_SECRET=あなたのStravaクライアントシークレット
NEXTAUTH_SECRET=ランダムな文字列（openssl rand -base64 32 で生成）
NEXTAUTH_URL=http://localhost:3000  # 開発環境
```

> **本番環境では** `NEXTAUTH_URL` を本番URLに変更する必要があります。

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

### Step 1: 本番用 `.env.local` を設定

```bash
# .env.local を編集
NEXTAUTH_URL=https://your-cloud-run-url
```

### Step 2: デプロイ実行

```bash
./deploy.sh
```

このスクリプトは以下を自動実行します：

1. `.env.local` から環境変数を読み込み
2. ローカルで Docker イメージをビルド
3. Artifact Registry にプッシュ
4. Cloud Run にデプロイ
5. 本番URLを表示

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

本番URL（https://your-cloud-run-url）でログインできることを確認

---

## デプロイ設定詳細

### deploy.sh の設定値

| 変数         | 値                |
| ------------ | ----------------- |
| PROJECT_ID   | `your-gcp-project-id`   |
| REGION       | `asia-northeast1` |
| SERVICE_NAME | `perfride`        |
| REPO_NAME    | `perfride-repo`   |

### Cloud Run リソース

| 設定          | 値    |
| ------------- | ----- |
| Memory        | 512Mi |
| CPU           | 1     |
| Min instances | 0     |
| Max instances | 3     |
| Port          | 8080  |

---

## 環境切り替えチェックリスト

### 開発 → 本番

- [ ] `.env.local` の `NEXTAUTH_URL` を本番URLに変更
- [ ] Strava API の callback domain に本番ドメインを追加
- [ ] `./deploy.sh` を実行

### 本番 → 開発

- [ ] `.env.local` の `NEXTAUTH_URL` を `http://localhost:3000` に戻す
- [ ] Strava API の callback domain が `localhost` を含むことを確認
- [ ] `npm run dev` で開発サーバー起動

---

## ファイル構成

> 詳細なファイル構成は [ARCHITECTURE.md](../../ARCHITECTURE.md) を参照してください。
> コンポーネントとロジックは各機能ディレクトリにコロケーション配置されています（例: `src/app/simulator/_lib/physics.ts`、`src/app/simulator/_components/SimulatorForm.tsx`）。

---

## 本番URL

https://your-cloud-run-url
