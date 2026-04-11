# Road Strategy - チーム間共有仕様書

> **目的**: 他チームがこのプロジェクトを参考にしてフロントエンド（類似構築）およびバックエンド（Python）を再構築するための技術仕様書

---

## 1. アプリケーション概要

ロードバイクサイクリスト向けのパフォーマンス管理ツール。Stravaと連携してアクティビティデータを取得し、トレーニング計画やパフォーマンス予測を提供する。

### 1.1 機能一覧

| 機能                 | 説明                                                                    | 認証要否 |
| -------------------- | ----------------------------------------------------------------------- | :------: |
| **Dashboard**        | Stravaアクティビティ表示、フィットネス指標（CTL/ATL/TSB）、週間サマリー |    ✅    |
| **Climb Simulator**  | パワー・体重からヒルクライムタイムを物理演算で予測                      |    ❌    |
| **Pace Optimizer**   | コースプロファイルに基づく最適ペース配分の計算                          |    ❌    |
| **Training Planner** | 目標レース日からの期分けトレーニングプラン生成                          |    ❌    |
| **Settings**         | FTP、体重、最大心拍数の設定（ローカルストレージ保存）                   |    ❌    |

---

## 2. システムアーキテクチャ

### 2.1 現行スタック（参考）

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│  Next.js 16 (App Router) + TypeScript + React 19            │
│  ・認証: NextAuth.js                                         │
│  ・チャート: Recharts                                         │
│  ・地図: Leaflet + React-Leaflet                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Routes (BFF)                          │
│  Next.js API Routes（Server-side）                           │
│  ・Strava API連携                                            │
│  ・ジオコーディング（Nominatim）                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   External Services                          │
│  ・Strava API (OAuth 2.0)                                    │
│  ・Nominatim (OpenStreetMap ジオコーディング)                  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Python バックエンド移行時の推奨構成

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│  Next.js / React (既存実装を参考に類似構築)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Python Backend                           │
│  フレームワーク推奨: FastAPI / Flask                          │
│  ・認証: Authlib または python-social-auth                   │
│  ・Strava連携: stravalib または 直接API呼び出し                │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 認証仕様

### 3.1 Strava OAuth 2.0 フロー

```
[ユーザー] → [ログインボタン] → [Strava認証画面]
    → [認証コード取得] → [アクセストークン交換] → [セッション確立]
```

### 3.2 必要なスコープ

```
read,activity:read_all,profile:read_all
```

### 3.3 トークン管理

| 項目                     | 仕様                             |
| ------------------------ | -------------------------------- |
| **アクセストークン**     | 有効期限: 約6時間                |
| **リフレッシュトークン** | アクセストークン期限切れ時に使用 |
| **自動リフレッシュ**     | 期限60秒前に自動更新             |

### 3.4 Strava API 設定

- **API設定URL**: https://www.strava.com/settings/api
- **Authorization Callback Domain**: ホスト名のみ（例: `localhost`, `example.com`）
  - `https://` やパスは含めない

### 3.5 Python 実装例

```python
from authlib.integrations.flask_client import OAuth

oauth = OAuth(app)
strava = oauth.register(
    name='strava',
    client_id=STRAVA_CLIENT_ID,
    client_secret=STRAVA_CLIENT_SECRET,
    access_token_url='https://www.strava.com/oauth/token',
    authorize_url='https://www.strava.com/oauth/authorize',
    api_base_url='https://www.strava.com/api/v3/',
    client_kwargs={'scope': 'read,activity:read_all,profile:read_all'},
)
```

---

## 4. API エンドポイント仕様

### 4.1 認証 API

| エンドポイント              | メソッド | 説明               |
| --------------------------- | -------- | ------------------ |
| `/api/auth/signin`          | GET      | OAuth認証開始      |
| `/api/auth/callback/strava` | GET      | OAuth コールバック |
| `/api/auth/signout`         | POST     | ログアウト         |
| `/api/auth/session`         | GET      | セッション情報取得 |

---

### 4.2 セグメント探索 API

**`GET /api/segments/explore`**

指定座標周辺のStravaセグメント（ヒルクライム区間）を検索

#### リクエストパラメータ

| パラメータ | 型     | 必須 | 説明                                     |
| ---------- | ------ | :--: | ---------------------------------------- |
| `lat`      | number |  ✅  | 緯度                                     |
| `lng`      | number |  ✅  | 経度                                     |
| `radius`   | number |  ❌  | 検索半径（度数、デフォルト: 0.1 ≈ 10km） |

#### レスポンス

```json
{
  "segments": [
    {
      "id": 12345,
      "name": "Mt. Fuji Climb",
      "climb_category": 4,
      "climb_category_desc": "Cat 1",
      "avg_grade": 8.5,
      "start_latlng": [35.3606, 138.7274],
      "end_latlng": [35.3689, 138.7312],
      "elev_difference": 1200,
      "distance": 14500,
      "points": "encoded_polyline_string"
    }
  ]
}
```

---

### 4.3 セグメント詳細・ストリーム API

**`GET /api/segments/streams`**

セグメントの詳細情報と標高プロファイルを取得

#### リクエストパラメータ

| パラメータ | 型     | 必須 | 説明                 |
| ---------- | ------ | :--: | -------------------- |
| `id`       | number |  ✅  | Strava セグメント ID |

#### レスポンス

```json
{
  "id": 12345,
  "name": "Mt. Fuji Climb",
  "distance": 14500,
  "elevation_gain": 1200,
  "average_grade": 8.5,
  "streams": {
    "distance": [0, 100, 200, ...],
    "altitude": [1500, 1508, 1520, ...]
  }
}
```

---

### 4.4 ジオコーディング API

**`GET /api/geocode`**

地名から座標を検索（Nominatim使用）

#### リクエストパラメータ

| パラメータ | 型     | 必須 | 説明               |
| ---------- | ------ | :--: | ------------------ |
| `q`        | string |  ✅  | 検索クエリ（地名） |

#### レスポンス

```json
{
  "results": [
    {
      "name": "富士山, 静岡県, 日本",
      "lat": 35.3606,
      "lng": 138.7274
    }
  ]
}
```

---

## 5. コアロジック仕様

### 5.1 物理演算モジュール（Climb Simulator）

パワー・体重からヒルクライムタイムを計算

#### 入力パラメータ

```typescript
interface SimulationParams {
  riderWeight: number; // ライダー体重 (kg)
  bikeWeight: number; // バイク重量 (kg)
  power: number; // 平均パワー (W)
  distance: number; // 距離 (m)
  elevationGain: number; // 獲得標高 (m)
  averageGrade: number; // 平均勾配 (%)
  tireType?: TireType; // タイヤ種別 ('road' | 'gravel')
}
```

#### 出力

```typescript
interface SimulationResult {
  estimatedTimeSeconds: number; // 予測タイム (秒)
  averageSpeedKmh: number; // 平均速度 (km/h)
  vam: number; // VAM (m/h)
  wattsPerKg: number; // W/kg
}
```

#### 物理定数

| 定数               | 値    | 説明              |
| ------------------ | ----- | ----------------- |
| `GRAVITY`          | 9.81  | 重力加速度 (m/s²) |
| `AIR_DENSITY`      | 1.225 | 空気密度 (kg/m³)  |
| `DRAG_COEFFICIENT` | 0.88  | 抗力係数          |
| `FRONTAL_AREA`     | 0.45  | 前面投影面積 (m²) |
| `DRIVETRAIN_LOSS`  | 0.03  | 駆動系損失 (3%)   |

タイヤ種別ごとの転がり抵抗係数:

| タイヤ種別 | Crr   | 説明       |
| ---------- | ----- | ---------- |
| `road`     | 0.004 | ロードタイヤ（標準） |
| `gravel`   | 0.005 | グラベルタイヤ       |

#### 計算アルゴリズム

パワーバランス方程式: `P = v × (F_gravity + F_rolling + F_aero)`

1. 有効パワー計算: `P_eff = P × (1 - DRIVETRAIN_LOSS)`
2. 重力抵抗: `F_g = m × g × grade`
3. 転がり抵抗: `F_r = μ × m × g × cos(θ)`
4. 空気抵抗: `F_a = 0.5 × ρ × Cd × A × v²`
5. 反復法で速度を収束計算

#### Python 実装例

```python
import math

GRAVITY = 9.81
AIR_DENSITY = 1.225
DRAG_COEFFICIENT = 0.88
FRONTAL_AREA = 0.45
TIRE_TYPES = {
    'road': {'crr': 0.004},
    'gravel': {'crr': 0.005},
}
DRIVETRAIN_LOSS = 0.03

def calculate_climbing_time(
    rider_weight: float,
    bike_weight: float,
    power: float,
    distance: float,
    elevation_gain: float
) -> dict:
    total_mass = rider_weight + bike_weight
    effective_power = power * (1 - DRIVETRAIN_LOSS)
    grade = elevation_gain / distance

    gravity_force = total_mass * GRAVITY * grade
    rolling_resistance = TIRE_TYPES['road']['crr']  # or params.tire_type
    rolling_force = rolling_resistance * total_mass * GRAVITY * math.cos(math.atan(grade))
    resistance_force = gravity_force + rolling_force

    # 反復計算
    velocity = effective_power / resistance_force
    for _ in range(10):
        aero_drag = 0.5 * AIR_DENSITY * DRAG_COEFFICIENT * FRONTAL_AREA * velocity ** 2
        total_resistance = resistance_force + aero_drag / velocity
        velocity = effective_power / total_resistance

    velocity = max(0.5, min(velocity, 20))
    time_seconds = distance / velocity

    return {
        "estimated_time_seconds": round(time_seconds),
        "average_speed_kmh": round(velocity * 3.6, 1),
        "vam": round(elevation_gain / (time_seconds / 3600)),
        "watts_per_kg": power / rider_weight
    }
```

---

### 5.2 ペース最適化モジュール（Pace Optimizer）

タイムトライアル向けの最適ペース配分を計算

> **参考論文**: "A numerical design methodology for optimal pacing strategy in the individual time trial discipline of cycling"
> https://link.springer.com/article/10.1007/s12283-025-00493-9

#### 入力

```typescript
interface CourseProfile {
  name: string;
  points: CoursePoint[];
  totalDistance: number;
}

interface CoursePoint {
  distance: number; // 始点からの距離 (m)
  elevation: number; // 標高 (m)
  wind?: number; // 向かい風速度 (m/s)、追い風は負
}

interface RiderParams {
  riderWeight: number; // ライダー体重 (kg)
  bikeWeight: number; // バイク重量 (kg)
  targetNP: number; // 目標NP (W)
  dragCoefficient?: number;
  frontalArea?: number;
}
```

#### 出力

```typescript
interface OptimizationResult {
  powerProfile: number[]; // 各セグメントの最適パワー
  velocityProfile: number[]; // 各セグメントの予測速度
  distancePoints: number[]; // 距離ポイント
  estimatedTime: number; // 最適化後の予測タイム
  constantPowerTime: number; // 一定パワーでのタイム
  improvement: number; // 改善率 (%)
  actualNP: number; // 実際のNP
}
```

#### 最適化戦略

- 登りでは高パワー（速度が低い → 空気抵抗小）
- 下りでは低パワー（速度が高い → 空気抵抗大で効率低下）
- NP（Normalized Power）を一定に保つ

---

### 5.3 トレーニングプランナー（Training Planner）

#### 期分けモデル

| フェーズ    | 期間  | 強度     | 目的                   |
| ----------- | ----- | -------- | ---------------------- |
| **Base**    | 4-8週 | Low      | 有酸素基盤の構築       |
| **Build 1** | 3-5週 | Medium   | テンポ・閾値の向上     |
| **Build 2** | 3-5週 | High     | VO2max・高強度対応     |
| **Peak**    | 1-2週 | High     | レースシミュレーション |
| **Taper**   | 1週   | Recovery | 疲労回復・調整         |

#### 週間ワークアウト例（Build 1 フェーズ）

| 曜日 | ワークアウト       | 時間  | 強度      |
| ---- | ------------------ | ----- | --------- |
| Mon  | Rest               | -     | Recovery  |
| Tue  | Sweet Spot         | 1.5h  | Tempo     |
| Wed  | Recovery Spin      | 45min | Recovery  |
| Thu  | Tempo Intervals    | 1.5h  | Tempo     |
| Fri  | Rest               | -     | Recovery  |
| Sat  | Long Ride w/ Tempo | 3h    | Tempo     |
| Sun  | Endurance Ride     | 2h    | Endurance |

#### インターバル構造

```typescript
interface WorkoutInterval {
  startMin: number; // 開始時間 (分)
  endMin: number; // 終了時間 (分)
  powerPercent: number; // FTP比 (%)
  label?: string; // ラベル（オプション）
}
```

---

### 5.4 Strava API ラッパー

#### 主要関数

| 関数                   | 説明                         | Strava API                     |
| ---------------------- | ---------------------------- | ------------------------------ |
| `getActivities()`      | アクティビティ一覧取得       | `GET /athlete/activities`      |
| `getAthleteStats()`    | 選手統計情報取得             | `GET /athletes/{id}/stats`     |
| `getStarredSegments()` | お気に入りセグメント取得     | `GET /segments/starred`        |
| `getSegmentDetails()`  | セグメント詳細取得           | `GET /segments/{id}`           |
| `exploreSegments()`    | エリア内セグメント検索       | `GET /segments/explore`        |
| `getActivityStreams()` | アクティビティの時系列データ | `GET /activities/{id}/streams` |
| `getSegmentStreams()`  | セグメントの標高プロファイル | `GET /segments/{id}/streams`   |

---

## 6. データモデル

### 6.1 Strava アクティビティ

```typescript
interface StravaActivity {
  id: number;
  name: string;
  type: string; // "Ride", "Run", etc.
  sport_type: string;
  start_date: string; // ISO 8601
  start_date_local: string;
  distance: number; // meters
  moving_time: number; // seconds
  elapsed_time: number; // seconds
  total_elevation_gain: number; // meters
  average_speed: number; // m/s
  max_speed: number; // m/s
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number; // NP
  kilojoules?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  suffer_score?: number;
}
```

### 6.2 ユーザー設定（ローカル保存）

```typescript
interface UserSettings {
  ftp: number; // FTP (W)
  weight: number; // 体重 (kg)
  maxHr: number; // 最大心拍数 (bpm)
  bikeWeight: number; // バイク重量 (kg)
}
```

**ストレージ**: `localStorage` に JSON 形式で保存

---

## 7. フィットネス指標の計算

### 7.1 TSS (Training Stress Score)

```
TSS = (duration_sec × NP × IF) / (FTP × 3600) × 100

IF = NP / FTP
```

### 7.2 CTL / ATL / TSB

| 指標    | 説明                              | 計算                    |
| ------- | --------------------------------- | ----------------------- |
| **CTL** | Chronic Training Load（長期負荷） | 42日間のTSS指数移動平均 |
| **ATL** | Acute Training Load（短期負荷）   | 7日間のTSS指数移動平均  |
| **TSB** | Training Stress Balance           | CTL - ATL               |

```
CTL_n = CTL_{n-1} × (1 - 1/42) + TSS_n × (1/42)
ATL_n = ATL_{n-1} × (1 - 1/7) + TSS_n × (1/7)
```

---

## 8. 環境変数

### 必須

| 変数名                 | 説明                                       |
| ---------------------- | ------------------------------------------ |
| `STRAVA_CLIENT_ID`     | Strava API クライアント ID                 |
| `STRAVA_CLIENT_SECRET` | Strava API クライアントシークレット        |
| `NEXTAUTH_SECRET`      | セッション暗号化キー（Python: SECRET_KEY） |
| `NEXTAUTH_URL`         | アプリケーション URL                       |

### Python バックエンド用

```python
# .env
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
SECRET_KEY=your_random_secret_key
APP_URL=http://localhost:8000
```

---

## 9. デプロイ

### 9.1 Docker 対応

現行実装はDockerコンテナとしてGoogle Cloud Runにデプロイ可能。
Pythonバックエンドも同様のコンテナ化を推奨。

### 9.2 推奨構成

| 設定          | 値    |
| ------------- | ----- |
| Memory        | 512Mi |
| CPU           | 1     |
| Min instances | 0     |
| Max instances | 3-10  |

---

## 10. 注意事項

### 10.1 Strava API レート制限

- **15分あたり100リクエスト**
- **1日あたり1000リクエスト**

### 10.2 認証トークンの有効期限

- アクセストークンは約6時間で失効
- リフレッシュトークンで更新が必要

### 10.3 フロントエンド再構築時の考慮点

- 認証状態の管理（Context/Redux等）
- ローカルストレージへの設定保存
- Leaflet地図のSSR対応（dynamic importが必要）
- Rechartsグラフのレスポンシブ対応

---

## 付録: ファイル構成（参考）

> 詳細なファイル構成は [ARCHITECTURE.md](../../ARCHITECTURE.md) を参照してください。
> コアロジックは各機能ディレクトリにコロケーション配置されています:
>
> - 物理演算: `src/app/simulator/_lib/physics.ts`
> - ペース最適化: `src/app/optimizer/_lib/paceOptimizer.ts`
> - 期分けロジック: `src/app/planner/_lib/planner.ts`
> - 共有ライブラリ（認証・Strava API・設定）: `src/lib/`
