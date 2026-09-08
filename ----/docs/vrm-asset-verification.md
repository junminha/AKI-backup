# VRM preset verification trail

Assessment time: 2026-09-04 (KST)
Assessment author: Claude

## Claim

The four built-in presets are photorealistic humanoid VRM avatars distributed for free by VTubeMe, licensed under Creative Commons Attribution 4.0 (CC BY 4.0), and bundled locally with the application.

## Background / why the previous set was replaced

An earlier revision bundled ten low-poly / stylized models from Polygonal Mind's 100Avatars (CC0), fetched from the ToxSam/open-source-avatars registry (Arweave). Those models read as childish and low quality for this booth's purpose, so they were replaced with a higher-quality photorealistic set. The prior state is preserved in git tags (see "Rollback" below).

## Primary evidence

- VTubeMe free VRM page: https://vtubeme.com/free-vrm-avatars
  - Lists four free models (Nova, Kai, Sky, Ember) described as photorealistic.
  - License stated on the page: Creative Commons BY 4.0 — commercial use permitted, modification and redistribution permitted, **attribution required** ("Credit VTubeMe with a link back to vtubeme.com").
- Direct model downloads (HTTP 200, binary glTF, `glTF` magic header verified):
  - `https://vtubeme.com/media/free/nova/model.vrm`
  - `https://vtubeme.com/media/free/kai/model.vrm`
  - `https://vtubeme.com/media/free/sky/model.vrm`
  - `https://vtubeme.com/media/free/ember/model.vrm`

## Selected assets

| Name | Style | Local path | Source URL |
| --- | --- | --- | --- |
| Nova | 실사풍 · 캐주얼 니트 | `public/vrm/nova.vrm` | `https://vtubeme.com/media/free/nova/model.vrm` |
| Kai | 실사풍 · 그래픽 티셔츠 | `public/vrm/kai.vrm` | `https://vtubeme.com/media/free/kai/model.vrm` |
| Sky | 실사풍 · 퍼플 재킷 | `public/vrm/sky.vrm` | `https://vtubeme.com/media/free/sky/model.vrm` |
| Ember | 실사풍 · 블루 후디 | `public/vrm/ember.vrm` | `https://vtubeme.com/media/free/ember/model.vrm` |

## Added set — fantasy creatures (CC0)

Six additional "different feel / fun" presets were added from a directly-downloadable (non-Arweave) GitHub source.

- Source repo: https://github.com/MJMoonbow/VRMavatars — repository license reported by the GitHub API as **Creative Commons Zero v1.0 Universal (CC0)**, description "A collection of free to use VRM models CC0". No attribution required.
- Files fetched from `https://raw.githubusercontent.com/MJMoonbow/VRMavatars/main/...` (HTTP 200), validated as VRM 0.x with a `head` humanoid bone and 13 blendshape expression groups each — compatible with both pose and face tracking.

| Name | Local path | Source path |
| --- | --- | --- |
| Orc (오크) | `public/vrm/orc.vrm` | `fantasy´/orcs/Orc 1.vrm` |
| Goblin (고블린) | `public/vrm/goblin.vrm` | `fantasy´/goblins/goblin elite 6.vrm` |
| Kobold (코볼드) | `public/vrm/kobold.vrm` | `fantasy´/kobolds/kobold 2_1.vrm` |
| Minotaur (미노타우르) | `public/vrm/minotaur.vrm` | `fantasy´/minotaur 1_4.vrm` |
| Wight (와이트) | `public/vrm/wight.vrm` | `fantasy´/wight 2.vrm` |
| Dragon (드래곤) | `public/vrm/dragon.vrm` | `fantasy´/dragons/dragon 9.vrm` |

## Added set — SF / art characters (CC0)

Six non-anime, stylized "SF / fun" presets were added from the Open Source Avatars registry, screened by embedded VRM license metadata. (Reachable only over a network without the Arweave/IPFS block; fetched via the collections' pinata / githubusercontent gateways.)

- Registry: https://github.com/ToxSam/open-source-avatars — per-collection JSON under `data/avatars/` (`toxsam.json`, `NeonGlitch86.json`). Model files served from `gateway.pinata.cloud/ipfs/...` and `raw.githubusercontent.com/neonglitch86/vrm/...`.
- Selection rule: only models reporting **`licenseName: CC0`** + **`commercialUssageName: Allow`**, a full humanoid (46–54 bones), and ≥17 blendshape expressions.
- Deliberately excluded (license/rig): `EL BUENO`/`EL MALO`/`STEAMBOAT`/`FAST FOOD MAX`/`Summer` (`Redistribution_Prohibited` and/or 0 expressions), `Shapey` (`personalNonProfit`).

| Name | Local path | Collection / author | Embedded meta |
| --- | --- | --- | --- |
| Orion (오리온) | `public/vrm/orion.vrm` | ToxSam reg. / Polygonal Mind | CC0, 50 bones, 17 expr |
| Aurora (오로라) | `public/vrm/aurora.vrm` | ToxSam reg. / Polygonal Mind | CC0, 50 bones, 17 expr |
| MaxHax (맥스핵) | `public/vrm/maxhax.vrm` | ToxSam | CC0, 52 bones, 17 expr |
| EYE Diviner (아이 디바이너) | `public/vrm/eyediviner.vrm` | ToxSam | CC0, 52 bones, 17 expr |
| Gary Grifter (게리 그리프터) | `public/vrm/garygrifter.vrm` | NeonGlitch86 | CC0, 52 bones, 17 expr |
| FrostyBoogie (프로스티 부기) | `public/vrm/frostyboogie.vrm` | ToxSam | CC0, 54 bones, 18 expr |

## Added set — occult / dark characters (CC0)

Assessment time: 2026-09-06 (KST)

Assessment author: Codex

Three additional non-anime presets were selected from the ToxSam collection after visual screening and file-level verification. The collection record identifies ToxSam as the creator and CC0 as the license; the embedded VRM 0.x metadata independently agrees on `licenseName: CC0`, `allowedUserName: Everyone`, and `commercialUssageName: Allow`.

- Collection record: `https://raw.githubusercontent.com/ToxSam/open-source-avatars/main/data/projects.json`
- Per-avatar source record: `https://raw.githubusercontent.com/ToxSam/open-source-avatars/main/data/avatars/toxsam.json`

| Preset | Concept / visual screen | Original model URL | File checks | SHA-256 |
| --- | --- | --- | --- | --- |
| Eye Zealot (아이 질럿) | 단안 문양의 오컬트 교단 사제; 검정·금색 의상과 비대칭 헤드피스 | `https://gateway.pinata.cloud/ipfs/QmYSHP8r4BKwyxMQwJMBWpJc1uE8EM7MDVXzNFhgFBesch/EyeZealot.vrm` | 5,228,396 bytes; 52 bones; 17 expressions; 11,684 triangles | `D45C278CE1746BBF89835B7DB8400FE658082F40DFD8A5EC09283BA3B1BD5FDC` |
| Crustybutt da king (크러스티 왕) | 왕관·비대칭 눈·늘어진 코가 특징인 기괴한 고블린 왕 | `https://gateway.pinata.cloud/ipfs/QmZan3z9nMTmEKSf99bPb8crKcYm4scMJd5YpCTN14B9mn/Crustybutt_da_gobblin_king.vrm` | 7,560,984 bytes; 46 bones; 17 expressions; 11,471 triangles | `A3577F0838CBAF99484B0EBAB129D264429BFFE4BA9C4E8A5FFAE5155DC86069` |
| King Mutatio (킹 뮤타티오) | 왕관·겹눈·비행 벌떼가 결합된 바이오펑크 곤충 군주 | `https://dweb.link/ipfs/QmVXPeQzJhhfjPJyeHdt4PfZddLSLPwNEHuPTu1RauLSsW/king_mutatio.vrm` | 8,257,833 bytes; 52 bones; 17 expressions; 11,978 triangles | `D2370A5323AE34AB4EA825DA454DA89213DA2A44EE339F0ED0C0FB1119A84DD5` |

All three files were retrieved through a public IPFS gateway, then verified as binary glTF (`glTF` magic) before being copied byte-for-byte into `public/vrm/`. King Mutatio's additional permission document was also resolved and agrees on everyone-use, commercial use, modification, no required credit, and no trademark/third-party restriction.

### Rejected after metadata conflict

Three visually strong Halloween Rising candidates (Esktix: Neon, Harvester: Autumm, Wendigo: Hollow) were rejected. The registry labels their collection CC0, but each VRM embeds `allowedUserName: ExplicitlyLicensedPerson`, `licenseName: Other`, and an external license that requires credit and preservation of the license. Because the file-level terms conflict with the registry summary, these files are not bundled.

## Attribution obligation

CC BY 4.0 requires visible credit. The requirement is satisfied in-app by a credit line in the VRM avatar panel (`VRM_PRESET_CREDIT` in `src/lib/avatar/presets.ts`, rendered in `src/components/ControlPanel.tsx`) and in the README. Keep this credit in any distribution or screenshot that ships the built-in avatars.

## Checks, conflicts, and limits

- Each file was downloaded and validated as a binary glTF container (`glTF` magic) before bundling under `public/vrm`. Sizes are ~5–8 MB, consistent with textured photorealistic meshes.
- License is CC BY 4.0, **not** CC0 — this differs from the previous 100Avatars set. Attribution is mandatory; the previous "CC0 VRM" UI label was removed.
- Per-file embedded VRM metadata (author/usage permissions) was not exhaustively re-inspected; the collection-level license on the distribution page is the basis for reuse. Reassess if a model's embedded metadata conflicts with the page license or if a download URL stops resolving.

## Rollback

The pre-swap state is preserved in git:

- `restore-v1` → commit `414446e` ("Restore Avatar Studio to 7b54d37 state"): last fully-working committed state, restorable **offline**.
- `restore-v1-wip` → snapshot of the exact pre-swap working tree (the Codex low-poly WIP code).

Note: the ten previous low-poly `.vrm` binaries were sourced from Arweave (`arweave.net/<txid>`), which is unreachable from the current network. A byte-exact restore of those model files therefore requires a network with Arweave access; the `restore-v1` clean state does not depend on them.

## Result

Supported with obligation. Provenance and license are corroborated by the VTubeMe distribution page and verified downloads. The only ongoing obligation is the CC BY 4.0 attribution, which is implemented in-app and documented here.
