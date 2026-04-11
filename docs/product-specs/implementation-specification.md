# Road Strategy 実装仕様書

> **目的**: 他プロジェクトでの再現を可能にするための技術仕様書
>
> **対象**: フロントエンド（類似構築）、バックエンド（Python）

---

## 1. アプリケーション概要

ロードバイクサイクリスト向けのパフォーマンス管理ツール。Strava連携によるアクティビティ分析、トレーニング計画、パフォーマンス予測機能を提供。

### 1.1 機能一覧

| 機能                 | 説明                                                      | 認証 |
| -------------------- | --------------------------------------------------------- | :--: |
| **Dashboard**        | Stravaアクティビティ表示、フィットネス指標（CTL/ATL/TSB） |  ✅  |
| **Climb Simulator**  | パワー・体重からヒルクライムタイムを物理演算で予測        |  ❌  |
| **Pace Optimizer**   | コースプロファイルに基づく最適ペース配分計算              |  ❌  |
| **Training Planner** | 目標レース日からの期分けトレーニングプラン生成            |  ❌  |
| **Settings**         | FTP・体重・最大心拍数（ローカルストレージ保存）           |  ❌  |

---

## 2. システムアーキテクチャ

### 2.1 現行実装（Next.js）

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
│  Next.js 16 (App Router) + TypeScript + React 19    │
│  ・認証: NextAuth.js                                  │
│  ・チャート: Recharts                                  │
│  ・地図: Leaflet + React-Leaflet                      │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│               API Routes (BFF)                       │
│  Next.js API Routes（サーバーサイド）                   │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│              External Services                       │
│  ・Strava API (OAuth 2.0)                            │
│  ・Nominatim (OpenStreetMap ジオコーディング)           │
└─────────────────────────────────────────────────────┘
```

### 2.2 Pythonバックエンド移行時の推奨構成

```
┌─────────────────────────────────────────────────────┐
│                    Frontend                          │
│  Next.js / React（現行実装を参考に類似構築）             │
└─────────────────────────────────────────────────────┘
                          │ REST API / GraphQL
                          ▼
┌─────────────────────────────────────────────────────┐
│                 Python Backend                       │
│  推奨フレームワーク: FastAPI / Flask                   │
│  ・認証: Authlib / python-social-auth                │
│  ・Strava連携: stravalib / 直接API呼び出し            │
│  ・計算ロジック: NumPy, SciPy (最適化に使用可)         │
└─────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> **Python移行時の考慮点**:
>
> - 認証はセッション管理をサーバー側で行う（JWT or セッションクッキー）
> - 計算ロジック（物理演算・最適化）はPythonの方が実装しやすい場合あり
> - フロントエンドとバックエンドを分離するためCORS設定が必要

---

## 3. 認証仕様

### 3.1 Strava OAuth 2.0 フロー

```
[ユーザー]
    │ 1. ログインボタンクリック
    ▼
[アプリ] ─── 2. Strava認証画面へリダイレクト ──→ [Strava]
                                                    │
                  3. ユーザー認可                    ▼
    ◄────────────── 4. 認証コード返却 ──────────────┘
    │
    │ 5. 認証コードをアクセストークンに交換
    ▼
[アプリ] ─── POST /oauth/token ──→ [Strava API]
    │                                    │
    ◄──── access_token + refresh_token ──┘
    │
    │ 6. セッション確立
    ▼
[ユーザー] ⟵ ログイン完了
```

### 3.2 必要なスコープ

```
read,activity:read_all,profile:read_all
```

| スコープ            | 用途                                     |
| ------------------- | ---------------------------------------- |
| `read`              | 公開プロフィール読み取り                 |
| `activity:read_all` | 全アクティビティ（非公開含む）の読み取り |
| `profile:read_all`  | 詳細プロフィール情報                     |

### 3.3 トークン管理

| 項目                         | 仕様                                                           |
| ---------------------------- | -------------------------------------------------------------- |
| **アクセストークン有効期限** | 約6時間                                                        |
| **リフレッシュトークン**     | 永続（アクセストークン更新時に新しいものが発行される場合あり） |
| **自動リフレッシュ**         | 有効期限60秒前に自動更新を推奨                                 |

### 3.4 Python実装例（FastAPI + Authlib）

```python
from authlib.integrations.starlette_client import OAuth
from starlette.config import Config

config = Config('.env')
oauth = OAuth(config)

oauth.register(
    name='strava',
    client_id=config('STRAVA_CLIENT_ID'),
    client_secret=config('STRAVA_CLIENT_SECRET'),
    access_token_url='https://www.strava.com/oauth/token',
    authorize_url='https://www.strava.com/oauth/authorize',
    api_base_url='https://www.strava.com/api/v3/',
    client_kwargs={'scope': 'read,activity:read_all,profile:read_all'},
)

# リフレッシュトークンによる更新
async def refresh_strava_token(refresh_token: str) -> dict:
    import httpx
    async with httpx.AsyncClient() as client:
        response = await client.post(
            'https://www.strava.com/oauth/token',
            data={
                'client_id': config('STRAVA_CLIENT_ID'),
                'client_secret': config('STRAVA_CLIENT_SECRET'),
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
            }
        )
        return response.json()
```

### 3.5 Strava API設定

- **設定URL**: https://www.strava.com/settings/api
- **Authorization Callback Domain**: ホスト名のみ設定
  - ✅ `localhost` / `example.com`
  - ❌ `https://` やパスは含めない

---

## 4. API エンドポイント仕様

### 4.1 認証API

| エンドポイント              | メソッド | 説明               |
| --------------------------- | -------- | ------------------ |
| `/api/auth/signin`          | GET      | OAuth認証開始      |
| `/api/auth/callback/strava` | GET      | OAuthコールバック  |
| `/api/auth/signout`         | POST     | ログアウト         |
| `/api/auth/session`         | GET      | セッション情報取得 |

### 4.2 セグメント探索API

**`GET /api/segments/explore`**

#### リクエスト

| パラメータ | 型    | 必須 | 説明                                     |
| ---------- | ----- | :--: | ---------------------------------------- |
| `lat`      | float |  ✅  | 緯度                                     |
| `lng`      | float |  ✅  | 経度                                     |
| `radius`   | float |  ❌  | 検索半径（度数、デフォルト: 0.1 ≈ 10km） |

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

### 4.3 セグメントストリームAPI

**`GET /api/segments/streams`**

#### リクエスト

| パラメータ | 型  | 必須 | 説明               |
| ---------- | --- | :--: | ------------------ |
| `id`       | int |  ✅  | StravaセグメントID |

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

### 4.4 ジオコーディングAPI

**`GET /api/geocode`**

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

パワー・体重からヒルクライムタイムを物理的に計算。

#### 入力パラメータ

```python
@dataclass
class SimulationParams:
    rider_weight: float      # ライダー体重 (kg)
    bike_weight: float       # バイク重量 (kg)
    power: float             # 平均パワー (W)
    distance: float          # 距離 (m)
    elevation_gain: float    # 獲得標高 (m)
    tire_type: str = 'road'  # タイヤ種別 ('road' or 'gravel')
```

#### 出力

```python
@dataclass
class SimulationResult:
    estimated_time_seconds: int    # 予測タイム (秒)
    average_speed_kmh: float       # 平均速度 (km/h)
    vam: int                       # VAM (m/h)
    watts_per_kg: float            # W/kg
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

def calculate_climbing_time(params: SimulationParams) -> SimulationResult:
    total_mass = params.rider_weight + params.bike_weight
    effective_power = params.power * (1 - DRIVETRAIN_LOSS)
    grade = params.elevation_gain / params.distance
    rolling_resistance = TIRE_TYPES[params.tire_type]['crr']

    # 重力抵抗
    gravity_force = total_mass * GRAVITY * grade

    # 転がり抵抗
    theta = math.atan(grade)
    rolling_force = rolling_resistance * total_mass * GRAVITY * math.cos(theta)

    # 合計抵抗力（空気抵抗を除く）
    resistance_force = gravity_force + rolling_force

    # 初期速度推定（空気抵抗を無視）
    velocity = effective_power / resistance_force

    # 反復計算で空気抵抗を考慮
    for _ in range(10):
        aero_drag = 0.5 * AIR_DENSITY * DRAG_COEFFICIENT * FRONTAL_AREA * velocity**2
        total_resistance = resistance_force + aero_drag / velocity
        velocity = effective_power / total_resistance

    # 速度を合理的な範囲に制限
    velocity = max(0.5, min(velocity, 20))

    time_seconds = params.distance / velocity

    return SimulationResult(
        estimated_time_seconds=round(time_seconds),
        average_speed_kmh=round(velocity * 3.6, 1),
        vam=round(params.elevation_gain / (time_seconds / 3600)),
        watts_per_kg=params.power / params.rider_weight
    )
```

---

### 5.2 ペース最適化モジュール（Pace Optimizer）

タイムトライアル向けの最適ペース配分を計算。

> **参考論文**: [A numerical design methodology for optimal pacing strategy in the individual time trial discipline of cycling](https://link.springer.com/article/10.1007/s12283-025-00493-9)

#### 入力

```python
@dataclass
class CoursePoint:
    distance: float     # 始点からの距離 (m)
    elevation: float    # 標高 (m)
    wind: float = 0.0   # 向かい風速度 (m/s)、追い風は負の値

@dataclass
class CourseProfile:
    name: str
    points: list[CoursePoint]
    total_distance: float  # 総距離 (m)

@dataclass
class RiderParams:
    rider_weight: float      # ライダー体重 (kg)
    bike_weight: float       # バイク重量 (kg)
    target_np: float         # 目標NP (W)
    drag_coefficient: float = 0.88
    frontal_area: float = 0.35  # TTポジション
```

#### 出力

```python
@dataclass
class OptimizationResult:
    power_profile: list[float]     # 各セグメントの最適パワー
    velocity_profile: list[float]  # 各セグメントの予測速度
    distance_points: list[float]   # 距離ポイント
    estimated_time: float          # 最適化後の予測タイム (秒)
    constant_power_time: float     # 一定パワーでのタイム (秒)
    improvement: float             # 改善率 (%)
    actual_np: float               # 実際のNP
```

#### 最適化戦略

- **登りでは高パワー**: 速度が低い → 空気抵抗が小さい → エネルギー効率が高い
- **下りでは低パワー**: 速度が高い → 空気抵抗が大きい → 追加パワーの効果が小さい
- **NP（Normalized Power）を一定に保つ**: 疲労度を一定に保ちながらタイムを最小化

#### 主要計算関数

```python
def calculate_np(powers: list[float], times: list[float]) -> float:
    """Normalized Power = (mean(P^4))^(1/4)"""
    if not powers:
        return 0.0

    weighted_sum = sum(max(0, p)**4 * t for p, t in zip(powers, times))
    total_time = sum(times)

    if total_time == 0:
        return 0.0
    return (weighted_sum / total_time) ** 0.25

def calculate_velocity(
    power: float,
    gradient: float,
    wind: float,
    total_mass: float,
    cd: float = 0.88,
    a: float = 0.35
) -> float:
    """パワーから速度を計算（Newton-Raphson法）"""
    effective_power = power * (1 - DRIVETRAIN_LOSS)
    theta = math.atan(gradient)

    fg = total_mass * GRAVITY * math.sin(theta)
    fr = ROLLING_RESISTANCE * total_mass * GRAVITY * math.cos(theta)

    v = 5.0  # 初期推定

    for _ in range(30):
        v_rel = v - wind
        fa = 0.5 * AIR_DENSITY * cd * a * v_rel * abs(v_rel)

        total_resistance = fg + fr + fa
        f = effective_power - v * total_resistance

        dfa_dv = AIR_DENSITY * cd * a * abs(v_rel)
        df_dv = -(total_resistance + v * dfa_dv)

        if abs(df_dv) < 1e-10:
            break

        dv = -f / df_dv
        v = max(0.5, min(25, v + dv))

        if abs(dv) < 1e-6:
            break

    return max(0.5, v)
```

---

### 5.3 トレーニングプランナー（Training Planner）

#### 期分けモデル

| フェーズ    | 期間比率 |   強度   | 目的                   |
| ----------- | :------: | :------: | ---------------------- |
| **Base**    |   35%    |   Low    | 有酸素基盤の構築       |
| **Build 1** |   25%    |  Medium  | テンポ・閾値の向上     |
| **Build 2** |   20%    |   High   | VO2max・高強度対応     |
| **Peak**    |   10%    |   High   | レースシミュレーション |
| **Taper**   |   残り   | Recovery | 疲労回復・調整         |

#### 週間ワークアウト構造（Build 1 例）

| 曜日 | ワークアウト                           | 時間  | 強度      |
| ---- | -------------------------------------- | ----- | --------- |
| Mon  | Rest                                   | -     | Recovery  |
| Tue  | Sweet Spot (3×15min @ 88-93% FTP)      | 1.5h  | Tempo     |
| Wed  | Recovery Spin                          | 45min | Recovery  |
| Thu  | Tempo Intervals (2×20min @ 76-87% FTP) | 1.5h  | Tempo     |
| Fri  | Rest                                   | -     | Recovery  |
| Sat  | Long Ride with Tempo                   | 3h    | Tempo     |
| Sun  | Endurance Ride                         | 2h    | Endurance |

#### インターバル構造

```python
@dataclass
class WorkoutInterval:
    start_min: int       # 開始時間 (分)
    end_min: int         # 終了時間 (分)
    power_percent: int   # FTP比 (%)
    label: str           # ラベル（例: "Warmup", "SS 1", "Rest"）

@dataclass
class Workout:
    day: str
    name: str
    duration: str
    duration_min: int
    description: str
    intensity: str  # recovery, endurance, tempo, threshold, vo2max, sprint
    icon: str
    intervals: list[WorkoutInterval]
```

#### プラン生成アルゴリズム

```python
def generate_training_plan(
    target_date: datetime,
    current_fitness: str = 'intermediate'
) -> TrainingPlan:
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    total_weeks = max(1, (target_date - today).days // 7)

    phases = []

    if total_weeks >= 12:
        # フル期分け
        phases.append(('base', int(total_weeks * 0.35)))
        phases.append(('build1', int(total_weeks * 0.25)))
        phases.append(('build2', int(total_weeks * 0.20)))
        phases.append(('peak', int(total_weeks * 0.10)))
        remaining = total_weeks - sum(w for _, w in phases)
        phases.append(('taper', max(1, remaining)))
    elif total_weeks >= 6:
        # 短縮版
        phases.append(('base', int(total_weeks * 0.3)))
        phases.append(('build1', int(total_weeks * 0.4)))
        phases.append(('peak', int(total_weeks * 0.15)))
        remaining = total_weeks - sum(w for _, w in phases)
        phases.append(('taper', max(1, remaining)))
    else:
        # 最小構成
        phases.append(('build1', max(1, total_weeks - 1)))
        phases.append(('taper', 1))

    return create_schedule(phases, today)
```

---

## 6. フィットネス指標の計算

### 6.1 TSS（Training Stress Score）

```
TSS = (duration_sec × NP × IF) / (FTP × 3600) × 100

IF (Intensity Factor) = NP / FTP
```

### 6.2 CTL / ATL / TSB

| 指標    | 説明                              | 計算式                  |
| ------- | --------------------------------- | ----------------------- |
| **CTL** | Chronic Training Load（長期負荷） | 42日間のTSS指数移動平均 |
| **ATL** | Acute Training Load（短期負荷）   | 7日間のTSS指数移動平均  |
| **TSB** | Training Stress Balance           | CTL - ATL               |

```python
def calculate_ctl_atl(daily_tss: list[float]) -> tuple[list[float], list[float]]:
    ctl_decay = 1 / 42
    atl_decay = 1 / 7

    ctl_values = []
    atl_values = []
    ctl = 0.0
    atl = 0.0

    for tss in daily_tss:
        ctl = ctl * (1 - ctl_decay) + tss * ctl_decay
        atl = atl * (1 - atl_decay) + tss * atl_decay
        ctl_values.append(ctl)
        atl_values.append(atl)

    return ctl_values, atl_values

def calculate_tsb(ctl: float, atl: float) -> float:
    return ctl - atl
```

---

## 7. データモデル

### 7.1 Stravaアクティビティ

```python
@dataclass
class StravaActivity:
    id: int
    name: str
    type: str                    # "Ride", "Run", etc.
    sport_type: str
    start_date: str              # ISO 8601
    start_date_local: str
    distance: float              # meters
    moving_time: int             # seconds
    elapsed_time: int            # seconds
    total_elevation_gain: float  # meters
    average_speed: float         # m/s
    max_speed: float             # m/s
    average_watts: float | None
    max_watts: float | None
    weighted_average_watts: float | None  # NP
    kilojoules: float | None
    average_heartrate: float | None
    max_heartrate: float | None
    suffer_score: int | None
```

### 7.2 ユーザー設定

```python
@dataclass
class UserSettings:
    ftp: int           # FTP (W)
    weight: float      # 体重 (kg)
    max_hr: int        # 最大心拍数 (bpm)
    bike_weight: float # バイク重量 (kg)
```

**ストレージ**: フロントエンドでは `localStorage` に JSON形式で保存

---

## 8. 環境変数

### 必須

| 変数名                 | 説明                               |
| ---------------------- | ---------------------------------- |
| `STRAVA_CLIENT_ID`     | Strava APIクライアントID           |
| `STRAVA_CLIENT_SECRET` | Strava APIクライアントシークレット |
| `SECRET_KEY`           | セッション暗号化キー               |
| `APP_URL`              | アプリケーションURL                |

### Python環境例（.env）

```bash
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
SECRET_KEY=your_random_secret_key
APP_URL=http://localhost:8000
```

---

## 9. 依存ライブラリ

### フロントエンド

| ライブラリ                  | 用途                             |
| --------------------------- | -------------------------------- |
| `next`                      | フレームワーク                   |
| `react`                     | UIライブラリ                     |
| `next-auth`                 | 認証（現行。Python移行時は不要） |
| `recharts`                  | グラフ描画                       |
| `leaflet` / `react-leaflet` | 地図表示                         |
| `@mapbox/polyline`          | ポリラインデコード               |

### Pythonバックエンド推奨

| ライブラリ | 用途                             |
| ---------- | -------------------------------- |
| `fastapi`  | Webフレームワーク                |
| `uvicorn`  | ASGIサーバー                     |
| `authlib`  | OAuth認証                        |
| `httpx`    | 非同期HTTPクライアント           |
| `numpy`    | 数値計算                         |
| `scipy`    | 最適化アルゴリズム（オプション） |
| `pydantic` | データバリデーション             |

---

## 10. デプロイ

### 10.1 推奨構成

| 設定          | 値    |
| ------------- | ----- |
| Memory        | 512Mi |
| CPU           | 1     |
| Min instances | 0     |
| Max instances | 3-10  |

### 10.2 Docker対応

コンテナ化してCloud Run / ECS / Kubernetes等にデプロイ可能。

---

## 11. 注意事項

### 11.1 Strava APIレート制限

- **15分あたり100リクエスト**
- **1日あたり1000リクエスト**

### 11.2 フロントエンド実装時の考慮点

- Leaflet地図のSSR対応（dynamic importが必要）
- Rechartsグラフのレスポンシブ対応
- 認証状態の管理（Context / Redux / Zustand等）

### 11.3 Python移行時の追加考慮点

- CORSミドルウェアの設定
- 非同期処理（asyncio）の活用
- レート制限の実装（Redis等を活用）

---

## 付録A: ファイル構成（参考）

> 詳細なファイル構成は [ARCHITECTURE.md](../../ARCHITECTURE.md) を参照してください。
> コアロジックは各機能ディレクトリにコロケーション配置されています:
>
> - 物理演算: `src/app/simulator/_lib/physics.ts`
> - ペース最適化: `src/app/optimizer/_lib/paceOptimizer.ts`
> - 期分けロジック: `src/app/planner/_lib/planner.ts`
> - 共有ライブラリ（認証・Strava API・設定）: `src/lib/`

---

## 付録B: Pythonバックエンド構成例

```
backend/
├── app/
│   ├── main.py                   # FastAPIアプリケーション
│   ├── auth/
│   │   ├── router.py             # 認証エンドポイント
│   │   └── oauth.py              # Strava OAuth設定
│   ├── segments/
│   │   └── router.py             # セグメントAPI
│   ├── simulation/
│   │   ├── physics.py            # 物理演算
│   │   └── optimizer.py          # ペース最適化
│   ├── training/
│   │   └── planner.py            # トレーニングプラン生成
│   └── strava/
│       └── client.py             # Strava APIクライアント
├── requirements.txt
├── Dockerfile
└── .env
```
