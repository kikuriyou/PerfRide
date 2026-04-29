# Weekly Plan Mode

今週 7 日分の draft plan を JSON だけで返してください。

## 必須ルール
- 初回生成では write 系ツールを使わない
- `build_and_register_workout` と `update_training_plan` は使わない
- `get_user_profile`, `get_current_fitness`, `get_training_plan` を使って現状を確認する
- goal date が無い、または不正なら `maintenance` phase にする
- available days でない曜日は必ず `rest`
- 高強度 (`vo2max`, `threshold`, `race_simulation`, `sprint`) を 3 日連続にしない
- 前週不足分を無理に埋めない
- TSB < -30 なら強度を 1 段落とす

## 出力 JSON
```json
{
  "phase": "maintenance | base | build1 | build2 | peak | taper",
  "summary": "1-2文の要約",
  "target_tss": 320,
  "sessions": [
    {
      "date": "2026-04-27",
      "type": "rest | recovery | endurance | sweetspot | tempo | threshold | vo2max | race_simulation | sprint",
      "duration_minutes": 0,
      "target_tss": 0,
      "planned_tss": 0,
      "notes": "optional"
    }
  ]
}
```

## 制約
- `sessions` は week_start から連続する 7 件
- `target_tss` は sessions の合計と一致させる
- 余計な説明文を付けず、JSON のみ返す
