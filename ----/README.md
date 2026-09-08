# VRM 아바타 캡처 스튜디오

네 개의 아바타 프로젝트에서 실시간 추적, VRM 렌더링, 촬영 UI를 하나로 통합한 웹 앱입니다.

## 주요 기능

- MediaPipe 기반 전신·얼굴·손가락 추적
- VRM 0.x / 1.0 아바타만 지원
- 프리셋 19종 즉시 선택: 실사풍 4종(Nova·Kai·Sky·Ember) + 판타지 크리처 6종(오크·고블린·코볼드·미노타우르·와이트·드래곤) + SF·아트 6종(오리온·오로라·맥스핵·아이 디바이너·게리 그리프터·프로스티 부기) + 오컬트·다크 3종(아이 질럿·크러스티 왕·킹 뮤타티오)
- 로컬 `.vrm` 파일 업로드
- 다크·스튜디오·크로마키·투명 배경
- 촬영 버튼 클릭 후 3초 카운트다운
- 사진을 `YYYY-MM-DD_HH-mm-ss.png` 이름으로 자동 다운로드
- WebM 녹화와 OBS용 투명 배경 팝아웃
- 카메라 영상과 추적 데이터는 브라우저 안에서만 처리

## 실행

```bash
npm install
npm run dev
```

카메라는 localhost 또는 HTTPS 환경에서만 사용할 수 있습니다.

## 내장 아바타

내장 프리셋은 네 그룹으로, 모두 `public/vrm/`에 로컬 번들되어 있습니다.

- **실사풍 인물 4종**(Nova·Kai·Sky·Ember): [VTubeMe](https://vtubeme.com) 무료 배포, **CC BY 4.0**. 상업적 사용 가능하나 출처 표기가 필요하여 앱 UI와 본 문서에 VTubeMe 출처를 명시합니다.
- **판타지 크리처 6종**(오크·고블린·코볼드·미노타우르·와이트·드래곤): [MJMoonbow/VRMavatars](https://github.com/MJMoonbow/VRMavatars) 배포, **CC0**(출처 표기 불필요).
- **SF·아트 6종**(오리온·오로라·맥스핵·아이 디바이너·게리 그리프터·프로스티 부기): [Open Source Avatars](https://www.opensourceavatars.com) 레지스트리의 ToxSam·Polygonal Mind·NeonGlitch86 컬렉션, 각 모델 임베디드 메타 기준 **CC0 · 상업 사용 허용**(출처 표기 불필요).
- **오컬트·다크 3종**(아이 질럿·크러스티 왕·킹 뮤타티오): [Open Source Avatars](https://www.opensourceavatars.com) 레지스트리의 ToxSam 컬렉션. 각 파일의 임베디드 VRM 메타가 **CC0 · 누구나 사용 · 상업 사용 허용**으로 일치하며, 휴머노이드 리그와 표정 프리셋을 포함합니다.

자세한 검증 기록은 [`docs/vrm-asset-verification.md`](docs/vrm-asset-verification.md)를 참고하세요.

## 통합 출처

- [vision20400/webcam-avatar-studio](https://github.com/vision20400/webcam-avatar-studio): VRM·MediaPipe 추적 엔진
- [LPRS1234/pose-persona-booth](https://github.com/LPRS1234/pose-persona-booth): 포토부스 촬영 흐름
- [jihwan8784/project](https://github.com/jihwan8784/project): 아바타 선택·합성 UI
- [jihwan8784/----](https://github.com/jihwan8784/----): 통합 대상 프로젝트
