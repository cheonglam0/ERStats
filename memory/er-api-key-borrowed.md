---
name: er-api-key-borrowed
description: ERStats가 쓰는 ER_API_KEY는 사용자 고유 키가 아니라 빌린 키 — 추후 교체 예정
metadata:
  type: project
---

ERStats(EternalReturn_Stat) 프로젝트가 현재 사용하는 공식 BSER API 키(`ER_API_KEY`)는
사용자 본인이 발급한 고유 키가 아니라 임시로 빌려 쓰는 키다. **추후 교체될 수 있다.**

**Why:** 키가 바뀌어도 코드 수정 없이 굴러가야 함.
**How to apply:** 키는 항상 환경변수/Secrets(`ER_API_KEY`)에서 읽도록 유지(코드/커밋에 하드코딩 금지).
교체 시에는 GitHub repo Settings → Secrets의 `ER_API_KEY` 값과 로컬 `.env`만 바꾸면 됨.
데이터 자동 갱신은 GitHub Actions `update-data.yml`(cron+수동 버튼)이 담당.
