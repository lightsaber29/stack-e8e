// 대화형 경험 입력 (ARCHITECTURE.md 2번 "대화형 입력 예외"의 유일한 허용 지점).
//
// 예외 조건 대응:
//  1) 사용자 본인 세션만 사용 — @anthropic-ai/claude-agent-sdk 는 로컬에 설치·로그인된
//     Claude Code 세션을 그대로 재사용한다. 이 파일은 API 키를 저장·요구·전송하지 않는다.
//  2) 전송 범위 한정 — 사용자가 대화창에 입력한 내용과 그 대화 문맥만 보낸다.
//     DB의 다른 Experience, 검색 Query, Embedding 은 여기로 들어오지 않는다.
//  3) 도구 최소화 — tools: [] 로 내장 도구를 전부 끄고, save_experience 하나만 노출한다.
//     settingSources: [] 로 로컬 설정/CLAUDE.md 도 읽지 않는다.
//  4) 임베딩/검색은 예외가 아님 — 이 파일은 embedding/store 를 import 하지 않는다.
//  5) 이 기능 없이도 동작 — CLI 미설치/미로그인이면 503 만 반환하고 나머지 기능은 그대로다.
//
// 저장은 하지 않는다. 구조화 결과(draft)를 돌려주면 사용자가 확인·수정한 뒤
// 기존 POST /api/experiences 로 저장한다.
//
// 로그는 메타데이터만 (ARCHITECTURE.md 7번) — 대화 내용은 남기지 않는다.
//
// chatTurn()에 existingExperience 를 넘기면 새 인터뷰가 아니라 기존 경험 수정 대화가 된다 —
// 이때도 그 경험 자기 자신의 필드만 프롬프트에 들어간다 (다른 Experience/검색/임베딩은 여전히 대상 밖).
//
// chatUpload()는 같은 예외 지점 안에서 파일 업로드(md/pdf 원문)를 처리하는 두 번째 진입점이다.
// 조건 1~5는 동일하게 적용된다 — 새 예외 파일이 아니라 이 파일 안의 별도 함수일 뿐.
// 대화가 아니라 단발 추출이라 resume/session이 없고, 문서 하나에 경험이 여럿이면
// save_experience 를 여러 번 호출해 draft 배열로 돌려준다.
import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const SYSTEM = `당신은 경력 인터뷰어다. 사용자가 자기 경험을 이야기하면 이력서에 쓸 수 있는 구조로 정리한다.

규칙:
- 사용자가 실제로 말한 단어·표현만 쓴다. 창작·윤색·과장·유추 금지. 자기소개서를 대신 써주지 않는다.
  절대 하지 말 것: 사용자가 언급한 적 없는 도메인/제품/지표로 바꿔치기 (예: "결제 API"라고 했는데 "리포트 API"로 요약).
- company/project/title도 채운다: 회사명·프로젝트명을 사용자가 말하면 그대로 company/project에 넣는다.
  title은 사용자가 실제로 말한 상황/액션의 핵심 단어를 그대로 조합한다 (없는 소재를 지어내지 않는다).
- Situation / Problem / Action / Result 중 빠진 게 있으면 한 번에 하나씩 짧게 되묻는다.
- 정량 지표(metrics)가 나올 만하면 물어보되, 사용자가 모른다고 하면 비워 둔다.
- save_experience 호출 직전 자기 검증: 지금까지 사용자가 실제로 언급한 핵심 명사(회사명·시스템/API명·기술명·지표)를
  하나씩 짚어보고, 그 단어가 요약 어디에도 없거나 다른 단어로 바뀌었으면 도구를 호출하지 말고 먼저 요약을 고친다.
- 네 개 항목이 어느 정도 채워지면 save_experience 도구를 호출해 정리 결과를 돌려준다.
  도구 호출이 저장을 뜻하지는 않는다 — 사용자가 최종 확인·수정한 뒤 저장한다.
- 한국어로 대화한다.`

// 파일 업로드 일괄 추출 모드. 대화가 아니라 한 번에 문서 전체를 훑어 경험 단위로 분리한다.
const SYSTEM_UPLOAD = `당신은 경력 문서(이력서/경력기술서 등)에서 서로 다른 경험을 추출하는 도구다.

규칙:
- 입력은 사용자가 업로드한 파일의 원문 전체다. 되묻지 않는다 — 질문 없이 있는 그대로 정리해서 바로 도구를 호출한다.
- 문서 안에 서로 다른 프로젝트/직무/경험이 여러 개 있으면 각각을 별도의 경험으로 나눠
  save_experience 를 경험 개수만큼 반복 호출한다. 하나만 있으면 한 번만 호출한다.
- 문서에 실제로 적힌 단어·표현만 쓴다. 창작·윤색·과장·유추 금지.
  Situation/Problem/Action/Result 중 문서에 없는 항목은 비워 둔다 (지어내지 않는다).
- 정량 지표(metrics)는 문서에 적힌 것만 담는다.
- 모든 경험을 다 호출했으면 "N개 경험을 찾았습니다"처럼 짧은 한 줄 요약만 답하고 끝낸다.
- 한국어로 응답한다.`

const shape = {
  title: z.string().describe('경험을 한 줄로 요약한 제목'),
  company: z.string().optional(),
  project: z.string().optional(),
  period: z.string().optional().describe('예: 2023.03 ~ 2023.09'),
  situation: z.string().optional().describe('어떤 상황/맥락이었는지'),
  problem: z.string().optional().describe('무엇이 문제였는지'),
  action: z.string().optional().describe('사용자 본인이 무엇을 했는지'),
  result: z.string().optional().describe('결과가 어땠는지'),
  technologies: z.array(z.string()).optional(),
  roles: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  metrics: z.array(z.string()).optional().describe('정량 지표. 사용자가 말한 것만'),
  rawMemo: z.string().optional(),
}

// 기존 경험을 대화로 고칠 때 쓰는 시스템 프롬프트. 처음부터 인터뷰하지 않고,
// 현재 값을 프롬프트에 박아 넣어 "언급 안 한 필드는 그대로 유지"를 모델이 지키게 한다.
function editSystemPrompt(exp) {
  // 빈 필드도 "(비어있음)"으로 그대로 보여준다 — 걸러내면 모델이 뭐가 비어있는지 몰라서
  // 검토 질문을 못 던진다 (실제로 겪은 버그).
  const lines = Object.entries({
    title: exp.title, company: exp.company, project: exp.project, period: exp.period,
    situation: exp.situation, problem: exp.problem, action: exp.action, result: exp.result,
    technologies: exp.technologies?.join(', '), roles: exp.roles?.join(', '),
    keywords: exp.keywords?.join(', '), metrics: exp.metrics?.join(', '), rawMemo: exp.rawMemo,
  }).map(([k, v]) => `${k}: ${v || '(비어있음)'}`).join('\n')

  return `당신은 경력 인터뷰어다. 사용자는 이미 등록된 경험을 대화로 고치고 싶어한다.

현재 등록된 값:
${lines}

규칙:
- 첫 메시지가 검토 요청이면, 사용자 지시를 기다리지 말고 먼저 위 값을 훑어서 "(비어있음)"인 필드와
  모호한 필드(정량 지표 없음, Action이 구체적이지 않음, Result에 수치가 없음 등)를 짚어 하나씩 질문한다.
  특히 situation/problem/action/result 중 "(비어있음)"인 게 있으면 그것부터 먼저 묻는다.
- 사용자가 언급한 필드만 바꾼다. 언급하지 않은 필드는 위 값을 그대로 유지한다 (지어내거나 비우지 않는다).
- 사용자가 실제로 말한 단어·표현만 쓴다. 창작·윤색·과장·유추 금지.
- 무엇을 고치고 싶은지 불분명하면 한 번에 하나씩 짧게 되묻는다.
- 변경 내용이 정리되면 save_experience 를 호출한다. 이때 바뀐 부분만이 아니라, 위 "현재 등록된 값" 전체를 바탕으로
  바뀐 필드만 반영한 완성된 전체 레코드를 담아 호출한다 (부분 patch가 아니라 항상 전체 레코드).
- 도구 호출이 저장을 뜻하지는 않는다 — 사용자가 최종 확인·수정한 뒤 저장한다.
- 한국어로 대화한다.`
}

// 세션마다 새로 만든다 — draft 를 클로저로 받기 때문에 요청 간에 섞이지 않는다.
function buildServer(onDraft) {
  return createSdkMcpServer({
    name: 'career',
    version: '1.0.0',
    tools: [tool(
      'save_experience',
      '정리된 경험을 사용자에게 돌려준다. 저장이 아니라 확인 요청이다.',
      shape,
      async (args) => {
        onDraft(args)
        return { content: [{ type: 'text', text: '정리 결과를 사용자에게 보여줬다. 확인/수정을 기다린다.' }] }
      },
    )],
  })
}

// 한 턴 진행. existingExperience 를 주면 새 인터뷰가 아니라 그 경험을 고치는 대화가 된다.
// 반환: { reply, sessionId, draft|null }
export async function chatTurn(message, sessionId, existingExperience) {
  let draft = null
  let session = sessionId
  const reply = []

  const it = query({
    prompt: message,
    options: {
      systemPrompt: existingExperience ? editSystemPrompt(existingExperience) : SYSTEM,
      resume: sessionId,
      mcpServers: { career: buildServer((d) => { draft = d }) },
      tools: [],                                   // 내장 도구 전부 차단
      allowedTools: ['mcp__career__save_experience'],
      permissionMode: 'dontAsk',                   // 미허용 도구는 묻지 않고 거부
      settingSources: [],                          // 로컬 설정/CLAUDE.md 미로딩
      maxTurns: 10,
    },
  })

  for await (const m of it) {
    if (m.type === 'system' && m.subtype === 'init') session = m.session_id
    else if (m.type === 'assistant') {
      for (const b of m.message.content) if (b.type === 'text') reply.push(b.text)
    } else if (m.type === 'result') {
      session = m.session_id || session
      if (m.subtype !== 'success' && reply.length === 0) throw new Error(`agent ${m.subtype}`)
    }
  }

  return { reply: reply.join('\n').trim(), sessionId: session, draft }
}

// 파일 업로드 일괄 추출. 대화 세션이 아니라 단발 호출 — save_experience 가 여러 번 불릴 수 있어
// draft 하나가 아니라 배열로 모은다 (파일 하나에 경험이 여러 개인 경우 대응).
export async function chatUpload(text) {
  const drafts = []
  const reply = []

  const it = query({
    prompt: text,
    options: {
      systemPrompt: SYSTEM_UPLOAD,
      mcpServers: { career: buildServer((d) => drafts.push(d)) },
      tools: [],
      allowedTools: ['mcp__career__save_experience'],
      permissionMode: 'dontAsk',
      settingSources: [],
      maxTurns: 40, // 경험이 여러 개면 그만큼 도구 호출이 반복된다
    },
  })

  for await (const m of it) {
    if (m.type === 'assistant') {
      for (const b of m.message.content) if (b.type === 'text') reply.push(b.text)
    } else if (m.type === 'result' && m.subtype !== 'success' && drafts.length === 0) {
      throw new Error(`agent ${m.subtype}`)
    }
  }

  return { reply: reply.join('\n').trim(), drafts }
}

// CLI 미설치/미로그인 등 환경 문제인지 판별 (예외 조건 5번: 안내만 하고 나머지는 계속 동작).
export function isUnavailable(err) {
  return /ENOENT|not found|login|authenticat|credential|Claude Code/i.test(err?.message || '')
}
