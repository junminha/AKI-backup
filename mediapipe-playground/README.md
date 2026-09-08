# MediaPipe Bench

MediaPipe Tasks Vision 8종을 라이브 카메라 위에서 채널처럼 켜고 끄면서 보는 도구.

## 실행

카메라 API는 보안 컨텍스트에서만 열립니다. `file://` 로 열면 동작하지 않으니 로컬 서버로 띄우세요.

```
cd mediapipe-playground
python -m http.server 8000
```

브라우저에서 http://localhost:8000 접속.

## 채널

| # | 채널 | Task API | 출력 |
|---|------|----------|------|
| 1 | 얼굴 검출 | FaceDetector | 바운딩 박스 + 눈코입 6점 |
| 2 | 얼굴 메시 | FaceLandmarker | 478 랜드마크 + 52 블렌드셰이프 |
| 3 | 손 랜드마크 | HandLandmarker | 손당 21점, 좌우 판별 |
| 4 | 제스처 인식 | GestureRecognizer | 따봉/브이/주먹 등 7종 |
| 5 | 전신 포즈 | PoseLandmarker | 33점 스켈레톤 |
| 6 | 사물 검출 | ObjectDetector | COCO 80종 |
| 7 | 인물 분리 | ImageSegmenter | 픽셀 단위 인물/배경 마스크 |
| 8 | 장면 분류 | ImageClassifier | ImageNet 1000종 상위 4개 |

## 단축키

- `1` ~ `8` 채널 토글
- `M` 거울 모드

## 동작 방식

- 모델과 WASM 런타임은 jsDelivr와 Google 스토리지에서 처음 켤 때 한 번만 받습니다. 끈 뒤 다시 켜면 메모리에 남은 인스턴스를 바로 씁니다.
- 추론은 전부 브라우저 안에서 돕니다. 영상 프레임은 어디로도 전송되지 않습니다.
- GPU 델리게이트가 거부되면 자동으로 CPU로 한 번 내려갑니다. 상태바의 백엔드 값에서 확인할 수 있습니다.
- 채널을 여러 개 동시에 켜면 프레임마다 모든 모델이 순차 실행되므로 FPS가 떨어집니다. 상태바의 추론 시간이 프레임당 합계입니다.
