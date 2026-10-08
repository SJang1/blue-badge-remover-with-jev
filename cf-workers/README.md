# Jev / CLEF 판정 Worker

`wrangler init cf-workers`로 생성한 별도 서버 프로젝트입니다. 기존 루트 Git 저장소를 사용하며 중첩 Git 저장소를 만들지 않습니다. Worker 의존성은 이 폴더에서 별도로 설치하며 확장 실행 ZIP·Firefox 소스 ZIP에는 포함하지 않습니다.

## 확장 설정

고급 필터 설정의 **Jev / CLEF AI 필터**에서 Worker 주소, 선택 인증 토큰, 파딱·일반 두 그룹의 숨김 임계값(0~100%)과 부가설명(context)을 설정합니다. AI는 기본적으로 꺼져 있고 두 그룹의 임계값은 모두 70%입니다. AI 설정은 기존 로컬 필터 설정과 별도 저장합니다.

Worker 주소를 저장하면 해당 Worker의 접근 권한을 요청하고 `GET /question`에서 실제 판단 질문을 가져와 표시합니다. AI가 꺼져 있어도 질문을 조회할 수 있으며, 설정 페이지를 다시 열 때도 갱신합니다. 확장에는 질문을 하드코딩하지 않습니다. 질문 조회 실패 시 오류를 표시합니다.

AI를 켜고 저장하면 트윗 이미지 CDN(`pbs.twimg.com`) 접근 권한도 요청합니다. Firefox의 내장 데이터 동의 기능이 있는 경우 게시물 전송 권한도 요청합니다. 질문만 조회할 때는 게시물을 전송하지 않으며, 인증 토큰이 있는 경우에만 인증 정보 전송 권한을 요청합니다. AI 모드는 배지·키워드에 의한 숨김 판정 대신 CLEF 확률을 사용합니다. 팔로우·화이트리스트·보호 키워드 예외, 기존 대상 영역과 숨김 방식, 리트윗·인용 설정은 계속 적용합니다. 일반 작성자도 판정합니다. 응답을 기다리거나 오류가 나면 게시물을 표시하며, 응답이 도착하면 최신 설정으로 다시 판단합니다.

설정을 저장하거나 임계값을 바꾸면 열린 타임라인을 다시 처리합니다. 임계값만 바꾸면 기존 확률을 재사용하고, Worker·토큰·context를 바꾸면 다시 요청합니다. 확장 background에서 중복 요청을 합치고 동시 추론 요청을 2개로 제한합니다. AI를 끄면 기존 로컬 필터로 돌아갑니다.

트윗 상세 화면에는 파딱 경고와 같은 위치에 가로 AI 판정 배너가 붙습니다. 백분율을 바로 표시하고, **자세히**를 펼치면 Worker의 `targetProbability` 원본 값, 작성자 그룹의 숨김 임계값과 이미지 전송 정보를 볼 수 있습니다. 기준 이상은 빨간색, 기준 미만은 초록색입니다. AI가 켜져 있으면 상세 본문도 값 조회를 위해 추론을 요청합니다. 기존 상세 본문 숨김 예외는 유지하며, 임계값과 비교한 결과를 표시합니다. 대기·조회 실패·AI 비활성화 상태에는 숫자를 표시하지 않습니다.

## 실행 및 배포

```sh
cd cf-workers
npm ci
npm run typecheck
npm run dev
```

Workers AI 추론은 Cloudflare에서 실행되므로 로컬 개발에도 Cloudflare 인증과 네트워크가 필요합니다. 실제 배포는 사용할 계정을 확인한 뒤 수행합니다.

```sh
npx wrangler login
npx wrangler whoami
npm run deploy
```

API_TOKEN은 선택 사항입니다. 설정하지 않으면 누구나 호출할 수 있는 공개 API로 작동합니다. 인증이 필요한 경우에만 `npx wrangler secret put API_TOKEN`으로 설정하고 확장에도 같은 값을 입력합니다. 로컬 인증은 `.dev.vars.example`을 `.dev.vars`로 복사해 토큰 줄을 활성화하면 됩니다. 확장에는 Cloudflare 계정 API 토큰을 넣지 않습니다. 실제 CLEF 추론과 이미지 입력을 로컬 Worker + 원격 AI 바인딩으로 확인했습니다. 합성 예시에서 짧은 본문만 있으면 대상 확률 4.15%, 같은 본문에 수익 과장·댓글 유도 사진을 넣으면 98.04%였습니다. 키워드가 많은 파딱 투자 분석은 1.14%, 파딱 없는 참여 유도 글은 98.51%였습니다. 이 예시는 실제 타임라인 전체의 정확도를 보장하지 않습니다. 프로덕션 반영에는 수정된 Worker 재배포와 확장 재로드, AI 설정 재저장으로 이미지 CDN 권한 부여가 필요합니다.

## 판정 규칙

질문은 `src/classification.ts`의 `DEFAULT_ADDITIONAL_EXPLANATION` 한 문장입니다. 추가 설명은 긴 질문으로 합치지 않고 CLEF의 구조화된 `state.context`로 전달합니다.

- 파딱 작성자: `src/classifiers/fadak.ts`의 기본 규칙을 적용해 대상일 가능성을 높게 보되, 평범한 글이라는 근거가 있으면 낮춥니다.
- 일반 작성자: `src/classifiers/normal.ts`의 기본 규칙을 적용해 일반인일 가능성을 높게 보되, 대상의 근거가 있으면 대상 확률을 높입니다.

두 규칙은 같은 `@cf/cloudflare/clef` 모델에 사용하는 별도 분류 설정입니다. 확률을 고정하거나 결과에 임의의 숫자를 더하지 않습니다. `src/classifiers/context.ts`의 공통 context에서 맹목적 홍보, 밈·뉴스 재탕, 내용 없는 공감·참여 유도, 호들갑·낚시, 갈등·분노 유도, 자기 수익화 집착 등 여러 "파딱질" 행동을 판단합니다. 내장 필터의 국기·정치·투자·호들갑 표현은 참고 단서이며 단어 일치나 개수로 차단하지 않습니다. 분석·비판·구체적인 일상 경험·창작·제도 안내의 반례도 함께 전달합니다. 그룹별 사용자 context는 추가로 전달합니다. 이 조정은 CLEF에 전달하는 판단 기준이며 모델 가중치를 재학습하는 방식은 아닙니다.

## API

`GET /question`은 추론에 쓰는 현재 질문을 `{ "question": "..." }` 형태로 반환합니다. 추론을 호출하지 않습니다. Worker에 API_TOKEN이 설정된 경우에는 이 엔드포인트도 `Authorization: Bearer <API_TOKEN>`이 필요합니다.

`POST /classify`, `Content-Type: application/json`. Worker에 API_TOKEN이 설정된 경우에만 `Authorization: Bearer <API_TOKEN>`이 필요합니다.

```json
{
  "text": "방금 일어난 사건이라며 오래된 짤을 게시한 내용",
  "handle": "example_user",
  "displayName": "표시 이름",
  "isFadak": false,
  "context": "오래된 밈을 지금 일어난 일처럼 올리는 계정도 포함한다.",
  "images": [{ "content_type": "image/jpeg", "base64": "<사진 바이트의 Base64>" }]
}
```

입력은 게시물 본문, 첨부 사진, @아이디·표시 이름, 작성자 본인의 파딱 여부입니다. 기존 확장의 `extractTweetText`, `extractTweetAuthor`, `extractDisplayName`, `findAuthorBadge` + `isBlueBadgeElement`를 사용합니다. 인용 카드의 배지와 이미지는 원 작성자의 입력과 분리합니다. `displayName`은 생략 또는 null이 가능하며, `isFadak`은 boolean입니다. context는 선택이고 예전 필드명 `additionalExplanation`도 context로 받습니다. `images`는 선택이며 생략하거나 빈 배열이면 본문만 판정합니다.

확장의 background가 트윗의 모든 사진과 동영상 썸네일(합계 최대 4장)을 내려받습니다. 여러 장이면 원래 순서대로 위에서 아래로 한 장에 합쳐 `{ content_type, base64 }`로 변환한 뒤 본문과 같은 요청에 담습니다. 비율을 유지하며 이미지를 자르지 않고, 한 장인 경우에도 전송 크기가 크면 압축·축소합니다. 실제 추론에서 Base64 입력이 65,536 토큰 한도에 걸리는 경우가 확인되어, 클라이언트는 최종 이미지 바이트를 128 KiB 이내로 줄여 본문·context 공간을 남깁니다. Worker는 외부 이미지 URL에 접근하지 않고 전달받은 이미지를 CLEF의 최상위 `images`에 넣어 한 번에 판정합니다. `[data-testid="tweetPhoto"]`의 사진과 동영상 플레이어의 `poster`·썸네일 이미지 중 X 이미지 CDN에 있는 것만 사용합니다. 한 동영상의 중복 썸네일과 인용 게시물의 이미지는 제외하며, 아바타·동영상 원본·오디오·링크 미리보기는 보내지 않습니다. 이미지 URL도 확장 내부의 판정 캐시 키에 포함되어 같은 본문에 다른 이미지가 달리면 별도로 판정합니다. 이미지 다운로드나 검증이 실패하면 AI로 숨기지 않습니다.

추론 실패 응답에는 CLEF 예외의 `details`(이름·메시지·stack·cause 전문)와 `imageInfo`(형식·바이트 수)가 포함됩니다. 같은 정보가 Worker 로그에도 남습니다. 확장의 판정 배너에서 **자세히**를 펼치면 실패 단계, HTTP 상태, Worker 응답 전문 또는 이미지 처리 예외를 확인할 수 있습니다. 오류 문자열은 HTML로 실행하지 않고 텍스트로 표시합니다.

```json
{
  "model": "@cf/cloudflare/clef",
  "classifier": "normal",
  "targetProbability": 0.85
}
```

확률 예시는 설명용입니다. CLEF의 실제 응답은 `answers.filter_target = { "type": "noul", "noul": 0.85 }` 형태이며, Worker는 `.noul`을 읽어 `targetProbability`로 반환합니다. 문서 예시처럼 숫자로 직접 반환되는 형태도 받습니다. `targetProbability`는 `filter_target` noul 질문에 대한 참의 확률이며 0~1입니다. 확장은 작성자의 그룹에 맞는 임계값을 선택하고 **확률 >= 임계값 / 100**이면 가립니다. 파딱 여부 자체를 AI 출력으로 덮어쓰지 않습니다.

본문은 10,000자(이미지 전용 글은 빈 문자열), handle은 100자, 표시 이름은 200자, context는 4,000자, 전체 요청은 13 MiB까지입니다. 확장이 내려받는 원본은 PNG·JPEG·WebP 최대 4장, 장당 4 MiB·16메가픽셀입니다. 처리한 이미지는 최대 가로 2048·세로 8192픽셀, 128 KiB·16메가픽셀 이내의 한 장으로 전송합니다. 압축·축소로 작은 글씨의 판독 정확도가 낮아질 수 있습니다. Worker API 자체는 CLEF 규격대로 최대 4장, 장당 4 MiB·16메가픽셀, 총 8 MiB를 받지만 모델의 토큰 한도에 따라 추론이 실패할 수 있습니다. AI 활성화 시 본문·사진·이름·배지·context를 지정한 Worker와 Cloudflare로 전송하고 추론 사용량이 발생합니다.

공식 모델 문서: https://developers.cloudflare.com/workers-ai/models/clef/
