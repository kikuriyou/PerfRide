---
name: sync-docs
description: Check and fix documentation drift against source code
user_invocable: true
arguments:
  - name: mode
    description: '--report (default) for diff report only, --fix to auto-correct'
    required: false
---

# /sync-docs — ドキュメント同期チェック＆修正

ドキュメントがソースコードの実態と一致しているかを検証し、差分があれば修正する。

## 実行モード

- **`/sync-docs`** or **`/sync-docs --report`**: 差分レポートのみ（変更なし）
- **`/sync-docs --fix`**: ARCHITECTURE.md を基準に構造を更新、ソースコードを基準に実装記述を更新

## 実行手順

### 1. Ground Truth 収集 (read-only)

以下のコマンドを並行実行してファイル一覧を取得:

```bash
find web/src/ -type f -name '*.ts' -o -name '*.tsx' | sort
find agent/ -type f -name '*.py' | sort
```

以下の key source files を読み込み（型定義、定数、関数シグネチャを抽出）:

| ファイル                                  | チェック対象                                      |
| ----------------------------------------- | ------------------------------------------------- |
| `web/src/app/simulator/_lib/physics.ts`       | SimulationParams, 物理定数, calculateClimbingTime |
| `web/src/app/optimizer/_lib/paceOptimizer.ts` | CoursePoint, RiderParams, OptimizationResult      |
| `web/src/app/planner/_lib/planner.ts`         | WorkoutInterval, Workout, generateTrainingPlan    |
| `web/src/lib/strava.ts`                       | API wrapper の型・関数                            |
| `web/src/lib/auth.ts`                         | NextAuth config                                   |
| `web/src/app/api/*/route.ts`                  | APIルートハンドラ                                 |
| `web/src/types/workout.ts`                    | 共有型定義                                        |

`web/package.json` の scripts セクションも確認。

### 2. ドキュメント読み込み (権威順)

| 優先度 | ドキュメント                                         | 役割                                     |
| ------ | ---------------------------------------------------- | ---------------------------------------- |
| 1      | `ARCHITECTURE.md`                                    | Source of Truth — 構造                   |
| 2      | `README.md`                                          | 外部向け概要（ARCHITECTURE.md の簡略版） |
| 3      | `docs/product-specs/specification.md`                | 製品仕様                                 |
| 4      | `docs/product-specs/implementation-specification.md` | Source of Truth — 実装仕様               |
| 5      | `docs/product-specs/team-specification.md`           | チーム間共有仕様                         |
| 6      | `docs/references/development-steps.md`               | 開発手順                                 |

### 3. 構造チェック

以下を検証:

- [ ] `web/src/` パス参照 → 実在確認（`.claude/scripts/check-docs.sh` セクション5と同等）
- [ ] ディレクトリツリー図 → 実際の `find` 結果と比較
- [ ] コンポーネント一覧 → `_components/` ディレクトリと照合
- [ ] APIルート一覧 → `web/src/app/api/` と照合
- [ ] `ARCHITECTURE.md` の Core Libraries テーブル → 実ファイルと照合

### 4. 実装内容チェック

以下を検証（key source files の内容 vs ドキュメント記述）:

- [ ] **型定義**: ドキュメントの `interface`/`type` 記述 vs ソースコードの実際の定義
  - フィールド名、型、オプショナル/必須の一致
- [ ] **定数・パラメータ**: ドキュメントの物理定数表 vs ソースコードの定数宣言
  - 値と変数名の一致
- [ ] **関数シグネチャ**: ドキュメントの関数記述 vs ソースコードの `export function`
  - 引数名、戻り値型の一致
- [ ] **APIエンドポイント**: ドキュメントのAPI仕様 vs 実際のルートハンドラ
  - パス、メソッド、リクエスト/レスポンス型の一致

### 5. レポート出力 or 自動修正

**`--report` モード（デフォルト）**:
差分を以下の形式で出力:

```
## 構造の差分
- [MISSING] README.md references web/src/lib/physics.ts but file is at web/src/app/simulator/_lib/physics.ts
- [EXTRA] web/src/app/api/recommend/route.ts exists but not documented in ARCHITECTURE.md

## 実装内容の差分
- [MISMATCH] implementation-specification.md: SimulationParams missing field 'tireType' (added in physics.ts:15)
- [MISMATCH] team-specification.md: ROLLING_RESISTANCE=0.004 but source has TIRE_TYPES object
```

**`--fix` モード**:

- `ARCHITECTURE.md` を基準に他ドキュメントの構造記述を更新
- ソースコードを基準に実装記述（型定義、定数、関数）を更新
- `specification.md` 等の Appendix は `ARCHITECTURE.md` 参照リンクのまま維持

### 6. 検証

修正後に `.claude/scripts/check-docs.sh` を実行して回帰確認:

```bash
bash .claude/scripts/check-docs.sh
```

## Source of Truth 階層

```
ARCHITECTURE.md (正)
  ├── README.md (簡略版、同期対象)
  ├── specification.md (Appendix → ARCHITECTURE.md 参照)
  ├── implementation-specification.md (同上)
  ├── team-specification.md (同上)
  └── development-steps.md (パターン説明を現行に更新)
```

**重要**: `specification.md`、`implementation-specification.md`、`team-specification.md` のファイル構造 Appendix は `ARCHITECTURE.md` への参照リンクに置換済み。同じ情報を複数箇所に重複させない。

## 依存関係マッピング

`docs/.doc-deps.yml` にドキュメント↔ソースコードの依存関係が定義されている。このファイルも必要に応じて更新する。
