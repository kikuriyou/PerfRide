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

ローカル開発用に `.env.local` を作成します。

```bash
STRAVA_CLIENT_ID=あなたのクライアントID
STRAVA_CLIENT_SECRET=あなたのクライアントシークレット
NEXTAUTH_SECRET=ランダムな文字列 (openssl rand -base64 32 で生成)
NEXTAUTH_URL=http://localhost:3000
```

### Step 3: Strava API 設定 (開発用)

- [Strava API Settings](https://www.strava.com/settings/api) にアクセス
- "Authorization Callback Domain" を `localhost` に設定

### Step 4: 開発サーバーの起動

```bash
npm run dev
# http://localhost:3000 でアクセス
```

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

このプロジェクトは `deploy.sh` を使用して Google Cloud Run に自動デプロイするように構成されています。

### Step 1: 本番環境設定

デプロイする前に、本番用の値が設定されていることを確認してください。

- **NEXTAUTH_URL**: Cloud Run の URL である必要があります (例: `https://your-cloud-run-url`)。

### Step 2: デプロイスクリプト

`deploy.sh` スクリプトは以下を処理します：

1. `.env.local` の読み込み (実行前に `NEXTAUTH_URL` が本番URLになっていることを確認してください)。
2. Docker イメージのビルド。
3. Artifact Registry (`asia-northeast1`) へのプッシュ。
4. Cloud Run へのデプロイ。

```bash
./deploy.sh
```

### Step 3: Strava API 設定 (本番用)

- [Strava API 設定](https://www.strava.com/settings/api) の "Authorization Callback Domain" に Cloud Run のドメイン (プロトコルなし) を追加します。
  - 開発: `localhost`
  - 本番: `your-cloud-run-url`

## 4. 保守・更新

- **コードの更新**: ローカルで変更 -> テスト -> `./deploy.sh` を再実行。
- **ログの確認**: Google Cloud Console -> Cloud Run -> ログ。
