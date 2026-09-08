# Kinetic Avatar Lab

웹캠의 전신 포즈를 MediaPipe로 분석해 2D 캐릭터에 적용하는 브라우저 앱입니다. 카메라 영상과 포즈 좌표는 서버로 전송하지 않고 사용자의 브라우저 안에서 처리합니다.

## 실행

Node.js 20 이상이 필요합니다.

```powershell
npm install
npm run dev
```

터미널에 표시되는 `http://localhost:5173` 주소를 Chrome 또는 Edge에서 여세요. 카메라 권한은 localhost 또는 HTTPS 환경에서만 정상 동작합니다.

배포용 파일은 다음 명령으로 생성합니다.

```powershell
npm run build
```

완성된 정적 파일은 `dist` 폴더에 저장됩니다.

## 주요 기능

- MediaPipe Pose Landmarker를 Web Worker에서 실행
- 카메라 화면의 관절 가이드와 추적 상태 표시
- 관절 각도만 전달하고 캐릭터 팔다리 길이는 고정하는 비율 보존 리타기팅
- 목, 몸통, 골반, 어깨, 팔꿈치, 손목, 고관절, 무릎, 발목 단위의 독립 회전
- 머리, 몸통, 골반, 좌우 팔, 손, 좌우 다리, 발의 개별 색상 및 표시 설정
- 선택 부위에 사용자 이미지 질감 적용
- 컬러 프리셋, 모션 안정화, 동작 크기, 거울 모드
- 브라우저 설정 저장과 투명 배경 PNG 내보내기
- 카메라가 없어도 확인 가능한 데모 모션
- 데스크톱과 모바일 반응형 레이아웃

## 구조

- `src/main.js`: 2D 관절 리그, 카메라, 커스터마이징, 캔버스 렌더링
- `src/pose-worker.js`: MediaPipe 포즈 추론 워커
- `src/styles.css`: 반응형 인터페이스와 테마
- `public/assets/character-concept-v1.png`: 승인된 캐릭터 원화
- `public/models/pose_landmarker_lite.task`: 로컬 포즈 모델
- `scripts/copy-mediapipe-assets.mjs`: MediaPipe WASM 배포 자산 준비

## 사용 팁

카메라에서 머리부터 발끝까지 보이도록 2-3m 정도 떨어져 서세요. 추적이 시작되면 `중심 맞추기`를 눌러 현재 위치를 캐릭터 중심으로 지정할 수 있습니다. 움직임이 떨리면 `움직임 안정화`를 높이고, 반응이 답답하면 낮추세요.
