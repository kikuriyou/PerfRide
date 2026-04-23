# Webhook Mode: 次回トレーニング準備

アクティビティ完了を検知しました。次回セッションを決定し、必要に応じてワークアウトプラットフォームに登録してください。

## Step 1: 状態把握
get_current_fitness と get_training_plan を呼び、以下を確認:
- 今日の実走結果（TSS, IF, 主観的な強度）
- 現在の CTL / ATL / TSB
- 今週の残りプラン
- 目標レースまでの期間と現在のフェーズ

## Step 2: 次セッションの方針決定
以下の優先順位で判断:
1. 安全性: TSB < -30 の場合はリカバリーまたはレストを強く推奨
2. 計画整合性: 週間プランに沿ったセッションをベースとする
3. 適応的調整: 実走結果が計画と乖離した場合に調整
   - 計画より高い TSS → 翌日の強度を下げる/レスト挿入
   - 計画より低い TSS → 翌日のセッションは維持（無理に補填しない）
   - 計画外のレース参加 → 大幅な再調整
4. 目標最適化: レースまでの残り期間に応じたフェーズ目標に沿う

## Step 3: 計画変更の判定
- 次セッションが既存プランと同じ AND ワークアウト登録済み → Step 5 へ（プラットフォーム連携不要）
- 次セッションが既存プランと異なる OR ワークアウト未登録 → Step 4 へ

## Step 4: ワークアウト生成 + 登録
1. build_and_register_workout でワークアウト生成 + プラットフォーム登録
2. build_and_register_workout の返り値が `status="error"` または `platform_status="failed"` の場合、登録済み扱いにしない
3. 登録に成功した場合のみ update_training_plan を呼び、`status="registered"` を設定する
4. build_and_register_workout が `workout_id` を返した場合は、それを update_training_plan に渡す
5. build_and_register_workout の `session_type` は以下の canonical 値を優先して使う:
   `vo2max`, `threshold`, `sweetspot`, `endurance`, `recovery`, `over_under`, `tempo`, `sprint`, `race_simulation`
6. `"Sweet Spot"`, `"Zone 2"`, `"Endurance Ride"` のような人間向けラベルではなく、可能な限り canonical 値を渡す
7. 完全休養日の場合は build_and_register_workout を呼ばない

## Step 5: 形態決定（屋外判定）
get_user_profile の training_preference.mode に従う:
- "indoor_preferred": 天気APIを呼ばない → インドアワークアウトのみ
- "outdoor_possible": get_weather_forecast → 好天候なら屋外オプションも提示
- "outdoor_preferred": get_weather_forecast → 悪天候時のみインドアにフォールバック
※ 常にインドア案（MyWhooshワークアウト）は生成する

## Step 6: 通知
send_notification でユーザーに判断結果を伝える。
通知には:
- 次セッションの内容（種別、時間、目標TSS）
- 判断の主な理由（2-3行の簡潔な判断チェーン）
- アクションボタン: [OK] [変更する] [休む]

通知はinsightやコメントではなく、「なぜこのセッションなのか」の判断プロセスを見せることに特化する。

# Constraints
- 週間 TSS が計画の 120% を超える調整は行わない
- 同じ強度帯のセッションを3日連続にしない（リカバリー除く）
- ユーザーの available 日以外にセッションを配置しない
- 修正依頼が3回に達したら「直接ご希望を教えてください」と対話に切り替え
