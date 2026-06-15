/**
 * 스킬 계수 오버레이 레지스트리.
 *
 * 공식 API에는 스킬 데미지 계수가 없어, 나무위키 기준으로 직접 입력한 data/skills/*.json 을
 * 캐릭터(영문 id)에 매핑한다. 새 캐릭터를 추가하려면:
 *   1) data/skills/{영문id}.json 작성
 *   2) 아래 OVERLAYS 배열에 import 추가
 *
 * (Vite/Node/Vitest 어디서나 동작하도록 import.meta.glob 대신 명시적 import 사용)
 */

import type { Skill } from "./types.js";
import Jackie from "../data/skills/Jackie.json";
import Adela from "../data/skills/Adela.json";
import Adina from "../data/skills/Adina.json";
import Adriana from "../data/skills/Adriana.json";
import Aiden from "../data/skills/Aiden.json";
import Alex from "../data/skills/Alex.json";
import Aya from "../data/skills/Aya.json";
import Barbara from "../data/skills/Barbara.json";
import Bernice from "../data/skills/Bernice.json";
import Bianca from "../data/skills/Bianca.json";
import Camilo from "../data/skills/Camilo.json";
import Cathy from "../data/skills/Cathy.json";
import Celine from "../data/skills/Celine.json";
import Chiara from "../data/skills/Chiara.json";
import Chloe from "../data/skills/Chloe.json";
import Daniel from "../data/skills/Daniel.json";
import Echion from "../data/skills/Echion.json";
import Elena from "../data/skills/Elena.json";
import Eleven from "../data/skills/Eleven.json";
import Emma from "../data/skills/Emma.json";
import Estelle from "../data/skills/Estelle.json";
import Eva from "../data/skills/Eva.json";
import Felix from "../data/skills/Felix.json";
import Fiora from "../data/skills/Fiora.json";
import Hart from "../data/skills/Hart.json";
import Haze from "../data/skills/Haze.json";
import Hyejin from "../data/skills/Hyejin.json";
import Hyunwoo from "../data/skills/Hyunwoo.json";
import Irem from "../data/skills/Irem.json";
import Isaac from "../data/skills/Isaac.json";
import Isol from "../data/skills/Isol.json";
import Jan from "../data/skills/Jan.json";
import Jenny from "../data/skills/Jenny.json";
import Johann from "../data/skills/Johann.json";
import Karla from "../data/skills/Karla.json";
import Laura from "../data/skills/Laura.json";
import Lenox from "../data/skills/Lenox.json";
import Leon from "../data/skills/Leon.json";
import LiDailin from "../data/skills/LiDailin.json";
import Luke from "../data/skills/Luke.json";
import Lyanh from "../data/skills/Lyanh.json";
import Magnus from "../data/skills/Magnus.json";
import Mai from "../data/skills/Mai.json";
import Markus from "../data/skills/Markus.json";
import Martina from "../data/skills/Martina.json";
import Nadine from "../data/skills/Nadine.json";
import Nathapon from "../data/skills/Nathapon.json";
import Nicky from "../data/skills/Nicky.json";
import Piolo from "../data/skills/Piolo.json";
import Priya from "../data/skills/Priya.json";
import Rio from "../data/skills/Rio.json";
import Rozzi from "../data/skills/Rozzi.json";
import Shoichi from "../data/skills/Shoichi.json";
import Silvia from "../data/skills/Silvia.json";
import Sissela from "../data/skills/Sissela.json";
import Sua from "../data/skills/Sua.json";
import Tazia from "../data/skills/Tazia.json";
import Theodore from "../data/skills/Theodore.json";
import Tia from "../data/skills/Tia.json";
import Vanya from "../data/skills/Vanya.json";
import William from "../data/skills/William.json";
import Xiukai from "../data/skills/Xiukai.json";
import Yuki from "../data/skills/Yuki.json";
import Zahir from "../data/skills/Zahir.json";
// 신규 캐릭터 (dak.gg 보강분)
import Arda from "../data/skills/Arda.json";
import Abigail from "../data/skills/Abigail.json";
import Alonso from "../data/skills/Alonso.json";
import Blair from "../data/skills/Blair.json";
import Bihyung from "../data/skills/Bihyung.json";
import Charlotte from "../data/skills/Charlotte.json";
import Coraline from "../data/skills/Coraline.json";
import Darko from "../data/skills/Darko.json";
import DebiMarlene from "../data/skills/DebiMarlene.json";
import Fenrir from "../data/skills/Fenrir.json";
import Garnet from "../data/skills/Garnet.json";
import Henry from "../data/skills/Henry.json";
import Hisui from "../data/skills/Hisui.json";
import Justyna from "../data/skills/Justyna.json";
import Katja from "../data/skills/Katja.json";
import Kenneth from "../data/skills/Kenneth.json";
import Leni from "../data/skills/Leni.json";
import Lenore from "../data/skills/Lenore.json";
import Niah from "../data/skills/Niah.json";
import Tsubame from "../data/skills/Tsubame.json";
import YuMin from "../data/skills/YuMin.json";
import Mirka from "../data/skills/Mirka.json";
import Xuelin from "../data/skills/Xuelin.json";
import Istvan from "../data/skills/Istvan.json";

export interface SkillOverlay {
  characterId: string;
  source?: string;
  filled?: boolean;
  skills: Skill[];
}

// filled=true(직접 입력 완료)인 오버레이만 등록한다.
const ALL = [
  Jackie, Adela, Adina, Adriana, Aiden, Alex, Aya,
  Barbara, Bernice, Bianca,
  Camilo, Cathy, Celine, Chiara, Chloe, Daniel,
  Echion, Elena, Eleven, Emma, Estelle, Eva, Felix, Fiora,
  Hart, Haze, Hyejin, Hyunwoo, Irem, Isaac, Isol,
  Jan, Jenny, Johann, Karla, Laura, Lenox, Leon, LiDailin, Luke, Lyanh,
  Magnus, Mai, Markus, Martina, Nadine, Nathapon, Nicky,
  Piolo, Priya, Rio, Rozzi, Shoichi, Silvia, Sissela, Sua,
  Tazia, Theodore, Tia, Vanya, William, Xiukai, Yuki, Zahir,
  Arda, Abigail, Alonso, Blair, Bihyung, Charlotte, Coraline, Darko,
  DebiMarlene, Fenrir, Garnet, Henry, Hisui, Justyna, Katja,
  Kenneth, Leni, Lenore, Niah, Tsubame, YuMin,
  Mirka, Xuelin, Istvan,
] as unknown as SkillOverlay[];
const OVERLAYS: SkillOverlay[] = ALL.filter((o) => o.filled);

const BY_ID = new Map<string, SkillOverlay>(OVERLAYS.map((o) => [o.characterId, o]));

/** 해당 캐릭터의 스킬 계수(없으면 빈 배열). */
export function getSkillsFor(characterId: string): Skill[] {
  return BY_ID.get(characterId)?.skills ?? [];
}

/** 스킬 데이터가 입력된 캐릭터 id 집합. */
export const charactersWithSkills = new Set(BY_ID.keys());
