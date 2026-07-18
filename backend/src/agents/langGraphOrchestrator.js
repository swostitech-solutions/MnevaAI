import { END, START, StateGraph } from '@langchain/langgraph'
import { logger } from '../config/logger.js'
import { runAutonomyEngine } from './autonomyEngine.js'
import { memoryService } from '../services/memory.service.js'
import { prisma } from '../config/prisma.js'

const ORCHESTRATOR_DOMAINS = {
  general: 'General assistant',
  finance: 'Finance agent',
  comms: 'Communication agent',
  calendar: 'Calendar agent',
  travel: 'Travel agent',
  health: 'Health agent',
  memory: 'Memory agent',
  search: 'Search agent',
  notifications: 'Notifications agent',
}

function detectDomain(messages = []) {
  const lastText = (messages[messages.length - 1]?.content || '')
  const text = typeof lastText === 'string' ? lastText : JSON.stringify(lastText)
  const lower = text.toLowerCase()

  // Personal questions about the user → general (has full profile in system prompt)
  if (/(what is my name|who am i|my name|my email|my plan|my account|my profile|tell me about me|about myself)/i.test(lower)) return 'general'

  // Only route to search for explicit document/file/memory queries
  if (/(search|find|document|file|what did i (upload|save|store)|look up|query)/i.test(lower)) return 'search'
  if (/(read|summarize|describe|explain|show me|tell me|find).*(document|file|note|memory|upload)/i.test(lower)) return 'search'

  return 'general'
}

function normalizeMessages(messages = []) {
  return messages.map((msg) => {
    if (typeof msg.content === 'string') return msg
    return {
      ...msg,
      content: typeof msg.content === 'object' && msg.content !== null
        ? JSON.stringify(msg.content)
        : String(msg.content || ''),
    }
  })
}

function createOrchestratorGraph() {
  const graph = new StateGraph({
    channels: {
      messages: {
        value: (x = [], y = []) => [...(Array.isArray(x) ? x : []), ...(Array.isArray(y) ? y : [])],
        default: () => [],
      },
      user: {
        value: (x = {}, y = {}) => (y && Object.keys(y).length ? y : x),
        default: () => ({}),
      },
      context: {
        value: (x = {}, y = {}) => ({ ...(x || {}), ...(y || {}) }),
        default: () => ({}),
      },
      route: {
        value: (x = 'general', y = x) => (y || x || 'general'),
        default: () => 'general',
      },
      agentPlan: {
        value: (x = [], y = []) => (Array.isArray(y) && y.length ? y : x),
        default: () => [],
      },
      response: {
        value: (x = {}, y = {}) => (y && Object.keys(y).length ? y : x),
        default: () => ({}),
      },
      trace: {
        value: (x = [], y = []) => [...(Array.isArray(x) ? x : []), ...(Array.isArray(y) ? y : [])],
        default: () => [],
      },
    },
  })

  graph
    .addNode('classify', async (state) => {
      const normalized = normalizeMessages(state.messages || [])
      const route = detectDomain(normalized)
      const plan = [
        `Detected route: ${route}`,
        `Primary intent: ${ORCHESTRATOR_DOMAINS[route] || ORCHESTRATOR_DOMAINS.general}`,
      ]
      return {
        route,
        agentPlan: plan,
        trace: [{ stage: 'classify', route, ts: new Date().toISOString() }],
      }
    })
    .addNode('execute_agent', async (state) => {
      const user = state.user || {}
      const context = state.context || {}
      const route = state.route || 'general'
      const messages = normalizeMessages(state.messages || [])
      const lastMessage = messages[messages.length - 1]?.content || ''

      let executionResult = {}
      try {
        switch (route) {
          case 'search': {
            const q = typeof lastMessage === 'string' ? lastMessage : JSON.stringify(lastMessage)
            const memoryResults = await memoryService.recall(q, user.id, 5)

            const isReadRequest = /(read|summarize|describe|explain|what('s| is)|tell me|show me|this|that|content)/i.test(q)
            if (isReadRequest && memoryResults?.length) {
              const text = memoryResults
                .map((item) => String(item.payload?.text || item.payload?.content || '').trim())
                .filter(Boolean)
                .slice(0, 3)
                .join('\n\n')

              executionResult = {
                response: text || 'I found a document reference, but it did not contain readable text.',
                domain: route,
                memories: memoryResults,
              }
              break
            }

            if (!memoryResults || !memoryResults.length) {
              executionResult = {
                response: 'I could not find any relevant content from your uploaded documents or images for that query.',
                domain: route,
                memories: memoryResults,
              }
              break
            }

            const aiResult = await runAutonomyEngine({
              messages,
              user,
              context: {
                ...context,
                recentMemory: memoryResults,
              },
            })

            executionResult = {
              response: aiResult.response,
              domain: route,
              toolResults: aiResult.toolResults || [],
              memories: memoryResults,
            }
            break
          }
          default: {
            const result = await runAutonomyEngine({
              messages,
              user,
              context,
            })
            executionResult = {
              ...result,
              domain: route,
            }
          }
        }
      } catch (error) {
        logger.error(`LangGraph orchestrator failed: ${error.message}`)
        executionResult = {
          response: 'The orchestrator hit an issue while routing the request. Please try again.',
          domain: route,
          error: error.message,
        }
      }

      return {
        response: executionResult,
        trace: [{ stage: 'execute_agent', route, ts: new Date().toISOString() }],
      }
    })
    .addNode('finalize', async (state) => {
      const response = state.response || {}
      const payload = {
        response: response.response || 'I’m here to help with your request.',
        route: state.route || 'general',
        agentPlan: state.agentPlan || [],
        toolResults: response.toolResults || [],
        domain: response.domain || state.route || 'general',
        trace: state.trace || [],
        ts: new Date().toISOString(),
      }
      return { response: payload }
    })

  return graph
    .addEdge(START, 'classify')
    .addEdge('classify', 'execute_agent')
    .addEdge('execute_agent', 'finalize')
    .addEdge('finalize', END)
    .compile()
}

export async function runLangGraphOrchestrator({ messages = [], user = {}, context = {} } = {}) {
  const graph = createOrchestratorGraph()
  const result = await graph.invoke({
    messages: normalizeMessages(messages),
    user,
    context,
  })

  const response = result.response || {}
  return {
    response: response.response || 'I’m ready to help with your request.',
    route: response.route || 'general',
    agentPlan: response.agentPlan || [],
    toolResults: response.toolResults || [],
    trace: response.trace || [],
    domain: response.domain || response.route || 'general',
    ts: new Date().toISOString(),
  }
}
