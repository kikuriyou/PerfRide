from __future__ import annotations

import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from zwift.config import (
    RESTART_SCRIPT,
    ZWIFT_ID,
    ZWIFT_MAC_HOST,
    ZWIFT_MAC_USER,
    ZWIFT_WORKOUTS_DIR,
)


@dataclass
class DeployResult:
    status: str  # "registered" | "deferred" | "failed"
    message: str
    zwo_filename: str


def deploy_workout(zwo_content: str, filename: str) -> DeployResult:
    workouts_dir = ZWIFT_WORKOUTS_DIR.format(zwift_id=ZWIFT_ID)
    remote_path = f"{workouts_dir}/{filename}"
    target = f"{ZWIFT_MAC_USER}@{ZWIFT_MAC_HOST}"

    with tempfile.NamedTemporaryFile(mode="w", suffix=".zwo", delete=False) as f:
        f.write(zwo_content)
        tmp_path = f.name

    try:
        subprocess.run(
            ["scp", "-o", "ConnectTimeout=5", tmp_path, f"{target}:{remote_path}"],
            check=True,
            capture_output=True,
            timeout=30,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        return DeployResult(
            status="failed",
            message=f"scp failed: {e}",
            zwo_filename=filename,
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    try:
        result = subprocess.run(
            ["ssh", target, "pgrep -x ZwiftApp"],
            capture_output=True,
            timeout=10,
        )
        zwift_running = result.returncode == 0
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        zwift_running = False

    if zwift_running:
        return DeployResult(
            status="deferred",
            message="Zwift実行中のため再起動をスキップ。ファイルは配置済み",
            zwo_filename=filename,
        )

    try:
        subprocess.run(
            ["ssh", target, RESTART_SCRIPT],
            check=True,
            capture_output=True,
            timeout=30,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        return DeployResult(
            status="deferred",
            message=f"ファイル配置済みだがZwift再起動に失敗: {e}",
            zwo_filename=filename,
        )

    return DeployResult(
        status="registered",
        message="ワークアウトを配置しZwiftを再起動しました",
        zwo_filename=filename,
    )
