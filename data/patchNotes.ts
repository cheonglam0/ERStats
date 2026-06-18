/**
 * 패치/핫픽스 변경점 설명 (체인지로그) — 수동 한글 큐레이션.
 *
 * ⚠️ 게임 데이터(캐릭터/아이템 수치) 자체는 본문에서 자동 갱신된다.
 *    이 파일은 "무엇이 어떻게 바뀌었는지"를 사람이 읽도록 직접 적는 칸이다.
 *
 * '패치' 탭은 이 수동 노트 + Steam 자동 수집분(data/game/patchNotesSteam.json)을
 * 날짜순으로 **병합**해 보여준다(최신이 위). Steam 분은 npm run fetch:patch 로 갱신된다.
 *
 * 새 패치는 배열 **맨 위**에 같은 형식으로 추가하면 된다.
 */

export interface PatchNote {
  /** 버전/제목. 예: "1.34", "6/18 핫픽스" */
  version: string;
  /** 날짜 (YYYY-MM-DD). */
  date: string;
  /** 변경점(줄 단위). 카테고리를 붙이고 싶으면 "[밸런스] ..." 처럼 앞에 표기. */
  changes: string[];
  /** 출처. 생략 시 수동 큐레이션으로 간주. Steam 자동 수집분은 "steam". */
  source?: "manual" | "steam";
  /** 전체 원문 링크(Steam 공지 등). 있으면 카드에 '공식 노트' 링크 표시. */
  url?: string;
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: "작성 예시",
    date: "2026-06-18",
    changes: [
      "이 파일(data/patchNotes.ts)을 열어 변경점을 적으세요.",
      "새 패치는 이 배열 맨 위에 같은 형식으로 추가하면 '패치' 탭 상단에 표시됩니다.",
      "[밸런스] 처럼 앞에 분류를 붙여도 됩니다.",
    ],
  },
];
