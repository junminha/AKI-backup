# 표정연구소 보안 점검 보고서

`security-best-practices` 스킬의 아래 레퍼런스를 적용해 **생성 모드**로 작성했고,
완성 후 **감사 모드**로 한 번 더 훑었습니다.

- `javascript-express-web-server-security.md` (Express 5 백엔드)
- `javascript-typescript-react-web-frontend-security.md` (React 19 프런트엔드)
- `javascript-general-web-frontend-security.md` (브라우저 공통)

## 요약

미해결 High/Critical 발견 사항은 없습니다. 이 앱은 인증·세션·데이터베이스가 없고
사용자 콘텐츠를 다른 사용자에게 렌더링하지 않으므로, XSS·CSRF·인젝션 계열의
주요 공격면 자체가 존재하지 않습니다. 실제 위험은 **API 키 노출**과 **비용 남용**에
집중되어 있고 두 가지 모두 처리했습니다.

아래 Low 항목 3건은 로컬 실행 기준에서 의도적으로 남겨 둔 설계 결정이며,
공개 배포 시 조치가 필요합니다.

---

## 적용한 항목

| 규칙 | 적용 내용 | 위치 |
| --- | --- | --- |
| REACT-CONFIG-001 | Groq 키는 서버 `.env`에서만 읽습니다. 프런트엔드 번들에 키 문자열이 0건인 것을 빌드 산출물에서 확인했습니다. | `server.js:83` |
| EXPRESS-INPUT-001 | 요청 본문의 타입·구조·크기를 모두 검사합니다. `active` 배열 길이, 각 원소의 키 타입, 숫자 필드의 유한성, 직렬화 길이 4000자 상한. | `server.js:139-160` |
| EXPRESS-INPUT-001 | 이미지는 허용 목록 정규식(`data:image/{jpeg,png,webp};base64,...`)만 통과시키고 900KB로 제한합니다. | `server.js:162-168` |
| EXPRESS-HEADERS-001 | `helmet()`으로 CSP를 명시했습니다. `script-src`는 `'self'`, `'wasm-unsafe-eval'`, jsdelivr만 허용하고 `object-src 'none'`, `frame-ancestors 'none'`을 걸었습니다. | `server.js:25-52` |
| EXPRESS-FINGERPRINT-001 | `x-powered-by` 비활성화, 커스텀 404 핸들러, 커스텀 에러 핸들러. | `server.js:24`, `server.js:332-345` |
| EXPRESS-ERROR-001 | 프로덕션에서는 일반 메시지만 반환하고 스택 트레이스를 노출하지 않습니다. 실제로 잘못된 JSON을 보내 `{"error":"요청을 처리하지 못했습니다."}`만 돌아오는 것을 확인했습니다. | `server.js:337-345` |
| EXPRESS-BODY-001 | `express.json({ limit: "900kb" })`를 전역이 아니라 `/api/analyze` 라우트에만 붙였습니다. | `server.js:68`, `server.js:206` |
| EXPRESS-AUTH-001 / DOS-001 | `express-rate-limit`으로 IP당 분당 8회 제한. 초과 시 429를 반환하는 것을 10연속 요청으로 검증했습니다. | `server.js:59-65` |
| EXPRESS-DOS-001 | `headersTimeout` 20초, `requestTimeout` 40초, `keepAliveTimeout` 10초를 명시하고 `clientError` 핸들러를 붙였습니다. | `server.js:353-360` |
| EXPRESS-PROXY-001 | `trust proxy`를 `false`로 명시했습니다. 무조건 `true`로 두면 `X-Forwarded-For` 위조로 rate limit을 우회할 수 있습니다. | `server.js:56` |
| EXPRESS-STATIC-001 | `dist`만 정적으로 제공하고 `dotfiles: "deny"`, `index: false`를 걸었습니다. `/.env`, `/server.js`, `/..%2f.env` 요청이 파일 대신 SPA 폴백을 받는 것을 확인했습니다. | `server.js:323` |
| REACT-XSS-001/002, JS-XSS-001~004 | `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write`를 한 곳도 쓰지 않습니다. 모든 판독 결과는 React 텍스트 노드로 렌더링됩니다. | `src/App.jsx` 전역 |
| REACT-FILE-001 | 업로드 파일은 MIME 타입 정규식과 12MB 상한으로 거르고, `URL.createObjectURL`로만 미리보기하며 교체·언마운트 시 `revokeObjectURL`로 해제합니다. 파일을 활성 콘텐츠로 실행하지 않습니다. | `src/App.jsx:449-475` |
| JS-STORAGE-001 | `localStorage` / `sessionStorage`를 사용하지 않습니다. 판독 캐시는 메모리 `Map`이며 새로고침 시 사라집니다. | `src/App.jsx:154` |
| EXPRESS-DEPS-001 | `npm audit --omit=dev` 결과 취약점 0건입니다. | — |
| 서버 응답 정제 | Groq 응답은 신뢰하지 않고 키별로 타입 변환·길이 절단·0~1 범위 클램프를 거쳐 반환합니다. LLM 출력이 그대로 클라이언트로 흐르지 않습니다. | `server.js:269-310` |

---

## 남겨 둔 결정 사항 (Low)

### L-1. 인증 없이 열린 분석 엔드포인트

`/api/analyze`에 인증이 없습니다. 로컬 전용 앱이고 서버가 `127.0.0.1`에만 바인딩되어
외부에서 접근할 수 없으므로 현재 구성에서는 위험하지 않습니다.

**공개 배포 시**: rate limit만으로는 부족합니다. 세션 또는 API 키 기반 인증을 추가하고,
쿠키 인증을 쓴다면 EXPRESS-CSRF-001에 따라 CSRF 토큰이 필요합니다.

### L-2. 사용량 집계와 rate limit이 프로세스 메모리에 있음

하루 호출 상한(`usage`)과 rate limit 저장소가 단일 프로세스 메모리입니다.
프로세스를 재시작하면 카운터가 0으로 돌아가고, 여러 인스턴스로 배포하면 상한이 인스턴스마다
따로 적용됩니다. 비용 상한이 목적이라면 Redis 같은 공유 저장소로 옮겨야 합니다.

### L-3. HSTS와 upgrade-insecure-requests가 기본 비활성

스킬의 TLS 지침에 따라 HSTS는 기본으로 끄고 `ENABLE_HSTS=true`일 때만 켜지도록 했습니다.
HSTS를 HTTP 환경에 잘못 걸면 되돌리기 어렵고 사용자를 잠글 수 있기 때문입니다.
`upgrade-insecure-requests`도 `NODE_ENV=production`에서만 붙습니다.

**실제 HTTPS 배포 시**: `NODE_ENV=production`과 `ENABLE_HSTS=true`를 함께 설정하세요.

---

## 이 앱에 해당하지 않는 규칙

인증·세션(EXPRESS-SESS-001/002), 쿠키(EXPRESS-COOKIE-001), CSRF(EXPRESS-CSRF-001),
SQL/NoSQL 인젝션(EXPRESS-INJECT-001/002), 명령 실행(EXPRESS-CMD-001),
템플릿 렌더링(EXPRESS-TEMPLATE-001), 오픈 리다이렉트(EXPRESS-REDIRECT-001),
`postMessage`(REACT-POSTMSG-001), 서비스 워커(REACT-SW-001)는 해당 코드가 없습니다.

SSRF(EXPRESS-SSRF-001)의 경우 외부 요청은 하드코딩된 Groq 엔드포인트 한 곳뿐이고
사용자 입력이 URL에 관여하지 않습니다.
