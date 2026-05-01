# 開発・実装ワークフロー

現在のプロジェクト構成とこれまでの議論に基づき、PerfRide アプリケーションの開発およびデプロイの手順をまとめました。

## 1. ローカル開発環境のセットアップ

### 前提条件

- Node.js 20 以上
- Strava アカウント (API認証情報用)

### Step 1: インストール

```bash
# 依存関係のインストール
npm install
```

### Step 2: 環境変数の設定

ローカル開発用に `web/.env.local` と `agent/.env` を作成します。

```bash
cp web/.env.local.example web/.env.local
cp agent/.env.example agent/.env
```

`web/.env.local` の主要項目:

```bash
STRAVA_CLIENT_ID=あなたのクライアントID
STRAVA_CLIENT_SECRET=あなたのクライアントシークレット
STRAVA_WEBHOOK_VERIFY_TOKEN=任意の検証用トークン
NEXTAUTH_SECRET=ランダムな文字列 (openssl rand -base64 32 で生成)
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_URL_PRODUCTION=https://perfride.n-plex.com
GCS_BUCKET=GCSバケット名
GOOGLE_CLOUD_PROJECT=GCPプロジェクトID
AGENT_API_URL=http://localhost:8000
AGENT_AUDIENCE=http://localhost:8000
KMS_KEY_NAME=projects/GCPプロジェクトID/locations/asia-northeast1/keyRings/perfride/cryptoKeys/mywhoosh-credentials
```

`agent/.env` の主要項目:

```bash
GCS_BUCKET=GCSバケット名
GOOGLE_GENAI_USE_VERTEXAI=true
GOOGLE_CLOUD_PROJECT=GCPプロジェクトID
GOOGLE_CLOUD_LOCATION=global
WEB_API_URL=http://localhost:3000
RECOMMEND_MODE=hybrid
USE_PERSONAL_DATA=true
WORKOUT_PLATFORM=mywhoosh
KMS_KEY_NAME=projects/GCPプロジェクトID/locations/asia-northeast1/keyRings/perfride/cryptoKeys/mywhoosh-credentials
```

通知を使う場合は `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `LINE_CHANNEL_ACCESS_TOKEN` を追加します。MyWhoosh 認証情報はユーザーが UI で入力し、ユーザー単位で暗号化保存する方針です。ローカル Docker Compose では、`agent/.env` の `MYWHOOSH_EMAIL` / `MYWHOOSH_PASSWORD` が両方設定されている場合、それを Settings UI の保存値より優先します。本番で単一共有 credential として上書きしたい場合以外は、Cloud Run には設定しません。

MyWhoosh 認証情報を保存するには Cloud KMS key が必要です。まだ作成していない場合は、先に key ring と key を作成します。

```bash
PROJECT_ID=your-gcp-project-id
KMS_LOCATION=asia-northeast1
KMS_KEYRING=perfride
KMS_KEY=mywhoosh-credentials

gcloud services enable cloudkms.googleapis.com --project "$PROJECT_ID"

gcloud kms keyrings create "$KMS_KEYRING" \
  --project "$PROJECT_ID" \
  --location "$KMS_LOCATION"

gcloud kms keys create "$KMS_KEY" \
  --project "$PROJECT_ID" \
  --location "$KMS_LOCATION" \
  --keyring "$KMS_KEYRING" \
  --purpose encryption
```

既に作成済みか確認する場合:

```bash
gcloud kms keyrings list \
  --project "$PROJECT_ID" \
  --location "$KMS_LOCATION"

gcloud kms keys list \
  --project "$PROJECT_ID" \
  --location "$KMS_LOCATION" \
  --keyring "$KMS_KEYRING"
```

ローカル Docker Compose で Settings UI から MyWhoosh 保存を試す場合は、ローカルの Google ADC アカウントに dev 用 key の encrypt/decrypt 権限を付与します。

```bash
gcloud auth application-default login

LOCAL_ACCOUNT=$(gcloud config get-value account)

gcloud kms keys add-iam-policy-binding "$KMS_KEY" \
  --project "$PROJECT_ID" \
  --location "$KMS_LOCATION" \
  --keyring "$KMS_KEYRING" \
  --member "user:$LOCAL_ACCOUNT" \
  --role "roles/cloudkms.cryptoKeyEncrypterDecrypter"
```

本番用 key では、開発者個人に decrypt 権限を付けない方針にします。ローカル確認には dev project または dev key を使います。

### Step 3: Strava API 設定 (開発用)

- [Strava API Settings](https://www.strava.com/settings/api) にアクセス
- "Authorization Callback Domain" を `localhost` に設定

### Step 4: 開発サーバーの起動

```bash
cd web
npm run dev
# http://localhost:3000 でアクセス
```

agent を単体起動する場合:

```bash
cd agent
uv run uvicorn recommend_agent.main:app --host 0.0.0.0 --port 8000
```

Docker Compose では `AGENT_API_URL=http://agent:8000` と `WEB_API_URL=http://web:3000` を使います。

---

## 2. 機能実装

### 主要コンポーネント

- **Dashboard (`/dashboard`)**: 要認証。Stravaデータを表示。
- **Simulator (`/simulator`)**: 一般公開。`physics.ts` を使用して計算。
- **Optimizer (`/optimizer`)**: 一般公開。`paceOptimizer.ts` でTT最適ペース配分を計算。
- **Planner (`/planner`)**: 一般公開。トレーニングプランを生成。
- **Settings (`/settings`)**: 一般公開。ユーザー数値をローカルストレージに保存。

### 主要ライブラリ

- **UI**: Next.js App Router, カスタムCSS変数（ライト/ダークテーマ）, Recharts.
- **Auth**: NextAuth.js (`src/lib/auth.ts`, `src/app/api/auth/[...nextauth]`).
- **Logic**: 各機能にコロケーション配置（例: `src/app/simulator/_lib/physics.ts`）.

### 標準的な実装パターン（コロケーション方式）

1. `src/app/<feature>/_components/` に機能固有コンポーネントを作成 (例: `SimulatorForm.tsx`)
2. `src/app/<feature>/_lib/` にロジックを配置 (例: `physics.ts`)
3. `src/app/<feature>/page.tsx` にページを作成
4. 共有コンポーネントは `src/components/`、共有ロジックは `src/lib/` に配置
5. ローカルで動作確認

---

## 3. 本番デプロイ (Google Cloud Run)

このプロジェクトは `deploy.sh` を使用して、Google Cloud Run 上に `web` と `agent` の2サービスを作成します。

| サービス | 公開範囲 | 役割 |
| -------- | -------- | ---- |
| `perfride-web` | public | Next.js、Strava OAuth、web API |
| `perfride-agent` | private | 推薦、週間プラン、ワークアウト登録 |

### Step 1: 本番環境設定

デプロイする前に、本番用の値が設定されていることを確認してください。

- `web/.env.local` の `NEXTAUTH_URL_PRODUCTION`: ユーザーがアクセスする本番 web URL。
- `agent/.env` の `WEB_API_URL`: agent から呼ぶ web URL。独自ドメインが web に向いているなら `https://perfride.n-plex.com` を使います。
- `GCS_BUCKET` / `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` / `GOOGLE_GENAI_USE_VERTEXAI`: web と agent で整合させます。
- `KMS_KEY_NAME`: web と agent に同じ KMS key resource name を設定します。
- Secret Manager: `STRAVA_CLIENT_SECRET`、`NEXTAUTH_SECRET`、`VAPID_PRIVATE_KEY`、`LINE_CHANNEL_ACCESS_TOKEN` などの app-level secret は可能なら `--set-secrets` で渡します。

本番 IAM は、web と agent の runtime service account に分けて付与します。

```bash
PROJECT_ID=your-gcp-project-id
REGION=asia-northeast1
WEB_SERVICE=perfride-web
AGENT_SERVICE=perfride-agent
KMS_LOCATION=asia-northeast1
KMS_KEYRING=perfride
KMS_KEY=mywhoosh-credentials

WEB_SA=$(gcloud run services describe "$WEB_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(spec.template.spec.serviceAccountName)')

AGENT_SA=$(gcloud run services describe "$AGENT_SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(spec.template.spec.serviceAccountName)')

gcloud kms keys add-iam-policy-binding "$KMS_KEY" \
  --project "$PROJECT_ID" \
  --location "$KMS_LOCATION" \
  --keyring "$KMS_KEYRING" \
  --member "serviceAccount:$WEB_SA" \
  --role "roles/cloudkms.cryptoKeyEncrypter"

gcloud kms keys add-iam-policy-binding "$KMS_KEY" \
  --project "$PROJECT_ID" \
  --location "$KMS_LOCATION" \
  --keyring "$KMS_KEYRING" \
  --member "serviceAccount:$AGENT_SA" \
  --role "roles/cloudkms.cryptoKeyDecrypter"
```

### Step 2: デプロイスクリプト

`deploy.sh` スクリプトは以下を処理します：

1. `web/.env.local` と `agent/.env` の読み込み。
2. `agent/` と `web/` の Docker イメージをローカルでビルド。
3. Artifact Registry (`asia-northeast1`) へのプッシュ。
4. `perfride-agent` を private Cloud Run service としてデプロイ。
5. agent URL を `AGENT_API_URL` / `AGENT_AUDIENCE` として `perfride-web` に注入。
6. Cloud Scheduler の週間プラン trigger を agent endpoint に設定。

```bash
./deploy.sh
```

### Step 3: Strava API 設定 (本番用)

- [Strava API 設定](https://www.strava.com/settings/api) の "Authorization Callback Domain" に Cloud Run のドメイン (プロトコルなし) を追加します。
  - 開発: `localhost`
  - 本番: `your-cloud-run-url`

### Step 4: 動作確認

- `GET web /` が本番 URL で通ること。
- `GET agent /health` が未認証では拒否されること。
- web service account から agent を呼べること。
- Strava OAuth callback が通ること。
- `POST web /api/recommend` が agent 経由で通ること。
- 週間プラン scheduler の target が `perfride-agent` の `/api/agent/weekly-plan` になっていること。

## 4. 保守・更新

- **コードの更新**: ローカルで変更 -> テスト -> `./deploy.sh` を再実行。
- **ログの確認**: Google Cloud Console -> Cloud Run -> ログ。
