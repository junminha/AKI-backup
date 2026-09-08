# 문제맞추기AIK

웹캠으로 사용자의 전신 동작을 인식해 아바타를 움직이고, 로봇 친구의 포즈를 따라 하며 싱크로율을 겨루는 브라우저 기반 아바타 스튜디오입니다.

## 주요 기능

- MediaPipe Pose Landmarker 기반 실시간 전신 동작 인식
- 발을 기준으로 한 접지 보정과 앉기·달리기·점프 동작 표현
- 팔 교차와 앞뒤 깊이를 반영한 자연스러운 팔 동작
- 기본형, 여성형, 로봇형, 스포츠형, 탐험가형, 외계인형 아바타
- 얼굴, 머리카락, 체형, 의상, 신발과 색상 세부 커스터마이징
- 웹캠 얼굴 화면을 아바타 얼굴에 적용
- 로봇 친구 위치 및 배경 장면 선택
- 랜덤 포즈 문제와 3초 준비 카운트다운
- 15초 동안의 포즈 싱크로율 측정
- 캠 화면 또는 캐릭터 화면을 선택해 이름·점수와 함께 저장하는 명예의 전당
- 아바타 장면 PNG 캡처 및 다운로드
- 반응형 화면과 다크 모드 지원

## 로컬에서 실행하기

### 준비물

- Git
- Node.js 20 이상과 npm
- 웹캠

### 설치 및 실행

```bash
git clone https://github.com/junminha/avatar-studio.git
cd avatar-studio
npm install
npm run dev
```

터미널에 표시되는 주소로 접속합니다. 현재 기본 경로는 다음과 같습니다.

```text
http://localhost:5173/
```

최신 코드를 다시 받을 때는 다음 명령을 사용합니다.

```bash
git pull origin main
npm install
npm run dev
```

## 프로덕션 빌드

```bash
npm run build
npm run preview
```

빌드 결과는 `dist/` 폴더에 생성됩니다.

## 웹캠 사용 팁

- 카메라에 머리부터 발목까지 보이도록 거리를 조절하세요.
- 처음 연결한 뒤 잠시 정자세를 유지하면 기준 높이가 안정적으로 보정됩니다.
- 앉기나 한쪽 발 들기는 바닥에 고정되며, 골반과 양발이 함께 상승할 때만 점프로 판단합니다.
- 웹캠은 브라우저 보안 정책상 `localhost` 또는 HTTPS 주소에서 사용해야 합니다.
- 카메라가 열리지 않으면 주소창의 카메라 아이콘에서 권한을 다시 허용하세요.

## 랭킹 데이터

랭킹은 서버가 아닌 현재 브라우저의 `localStorage`에 저장됩니다. 다른 컴퓨터나 브라우저와 자동으로 공유되지 않습니다.

랭킹만 초기화하려면 개발자 도구의 Console에서 실행하세요.

```javascript
localStorage.removeItem('morph-pose-leaderboard')
location.reload()
```

모든 로컬 설정을 초기화하려면 다음을 사용합니다.

```javascript
localStorage.clear()
location.reload()
```

## 사용 기술

- React 19
- TypeScript
- Vite 7
- MediaPipe Tasks Vision
- Motion
- Canvas 2D

## 데이터 처리

포즈 인식과 아바타 렌더링은 브라우저 안에서 처리됩니다. 별도의 백엔드 서버로 웹캠 영상을 전송하지 않으며, 랭킹 사진과 기록은 해당 브라우저의 로컬 저장소에 보관됩니다.
