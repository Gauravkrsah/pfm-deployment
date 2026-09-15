import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { Send, MessageCircle, Receipt, Wallet, ArrowLeftRight, Trash2, ChevronLeft, ChevronRight, Plus, Image as ImageIcon, AudioLines, Square, X, Mic, Play } from 'lucide-react'
import { supabase } from '../supabase'
import { API_BASE_URL } from '../config/api'
import { applyRememberedCategories, rememberCategoryChoice } from '../utils/categoryMemory'
import { buildRememberedExpenseReply } from '../utils/transactionReplies'
import DeleteConfirmationModal from './ui/DeleteConfirmationModal'

const getApiBaseUrl = () => {
  if (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) {
    return window.APP_CONFIG.API_BASE_URL
  }
  return API_BASE_URL
}

const INPUT_MODES = [
  { id: 'chat', label: 'Chat', icon: MessageCircle, placeholder: 'Ask about your finances...', hint: 'e.g., "how much did I spend on food?"', emoji: '💬', desc: 'Ask questions about your finances' },
  { id: 'income', label: 'Income', icon: Wallet, placeholder: 'e.g., salary 50000', hint: 'e.g., "salary 50000" or "freelance 15000"', emoji: '💰', desc: 'Log your income sources' },
  { id: 'expense', label: 'Expense', icon: Receipt, placeholder: 'e.g., lunch 250, coffee 80', hint: 'e.g., "lunch 250" or "coffee 80"', emoji: '🧾', desc: 'Add your expenses quickly' },
  { id: 'loan', label: 'Loan', icon: ArrowLeftRight, placeholder: 'e.g., lent 1000 to Ram', hint: 'e.g., "lent 1000 to Ram" or "borrowed 500 from Sita"', emoji: '🤝', desc: 'Track loans and borrowings' },
]

const REVIEW_CATEGORIES = [
  'Food', 'Groceries', 'Transport', 'Utilities', 'Rent', 'Shopping', 'Medical',
  'Entertainment', 'Education', 'Travel', 'Accommodation', 'Electronics',
  'Personal Care', 'Fitness', 'Gifts', 'Finance', 'Maintenance', 'Income', 'Loan',
  'Household Cleaning', 'Kitchenware', 'Furniture', 'Pet Supplies', 'Software Services', 'Other'
]

const INPUT_MODE_STORAGE_KEY = 'pfm_input_mode'
const AUTO_INTENT_STORAGE_KEY = 'pfm_auto_intent_enabled'
const VOICE_END_SILENCE_MS = 2100
const VOICE_MIN_SPEECH_MS = 650
const VOICE_LEVEL_FLOOR = 0.016

const getSavedInputMode = () => {
  const savedMode = localStorage.getItem(INPUT_MODE_STORAGE_KEY)
  return INPUT_MODES.some(mode => mode.id === savedMode) ? savedMode : 'expense'
}

const getSavedAutoIntent = () => localStorage.getItem(AUTO_INTENT_STORAGE_KEY) !== 'false'

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '')
  reader.onerror = () => reject(new Error('Unable to read the selected media.'))
  reader.readAsDataURL(file)
})

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result || ''))
  reader.onerror = () => reject(new Error('Unable to preview the selected image.'))
  reader.readAsDataURL(file)
})

const createImagePreview = async (file) => {
  const sourceUrl = await fileToDataUrl(file)
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => {
      const maxDimension = 640
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.78))
    }
    image.onerror = () => reject(new Error('The selected image could not be previewed.'))
    image.src = sourceUrl
  })
}

const formatDuration = (seconds) => {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0))
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`
}

const getFirstName = (value, fallback = 'User') => {
  const source = String(value || '').trim()
  if (!source) return fallback
  const emailName = source.includes('@') ? source.split('@')[0] : source
  const first = emailName.split(/[.\s_-]+/).find(Boolean)
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : fallback
}

const cleanSpokenTranscript = (value) => {
  let text = String(value || '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) return ''

  const fillerPatterns = [
    /\b(?:uh+|um+|erm+|er+|ah+|hmm+|mm+)\b/gi,
    /\b(?:you know|i mean|kind of|sort of|basically|actually|literally)\b/gi,
    /^(?:so|okay|ok|alright|right)\s+/i,
  ]
  fillerPatterns.forEach(pattern => {
    text = text.replace(pattern, ' ')
  })
  text = text.replace(/\s+/g, ' ').trim()

  const tokens = text.split(' ')
  const compact = []
  for (const token of tokens) {
    const previous = compact[compact.length - 1]
    if (previous && previous.toLowerCase().replace(/[^\w]/g, '') === token.toLowerCase().replace(/[^\w]/g, '')) {
      continue
    }
    compact.push(token)
  }

  let cleaned = compact
  for (let size = 4; size >= 2; size -= 1) {
    const next = []
    for (let index = 0; index < cleaned.length; index += 1) {
      const currentPhrase = cleaned.slice(index, index + size).join(' ').toLowerCase()
      const nextPhrase = cleaned.slice(index + size, index + size * 2).join(' ').toLowerCase()
      if (currentPhrase && currentPhrase === nextPhrase) {
        next.push(...cleaned.slice(index, index + size))
        index += size * 2 - 1
      } else {
        next.push(cleaned[index])
      }
    }
    cleaned = next
  }

  return cleaned.join(' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

const isIncompleteVoiceUtterance = (value) => {
  const text = cleanSpokenTranscript(value).toLowerCase().replace(/[?.!,]$/g, '').trim()
  if (!text) return true
  if (/\d/.test(text)) return false
  return /^(can you|could you|would you|please|tell me|show me|add|add this|record|save|how much|how much i|how much did i|i spent|i spend|i got|i earned|income|expense|loan)$/.test(text)
}

const buildMediaReviewSummary = (mediaType, transactions) => {
  const source = mediaType === 'image' ? 'image' : 'voice message'
  const details = transactions.slice(0, 4).map(transaction => (
    `${transaction.item} (Rs.${Math.abs(Number(transaction.amount) || 0).toLocaleString()}, ${transaction.category})`
  )).join(', ')
  const extra = transactions.length > 4 ? `, and ${transactions.length - 4} more` : ''
  return `From the ${source}, I found ${transactions.length} transaction${transactions.length === 1 ? '' : 's'}: ${details}${extra}. Please review before saving.`
}

const createWavFile = (chunks, inputSampleRate) => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(totalLength)
  let offset = 0
  chunks.forEach(chunk => {
    merged.set(chunk, offset)
    offset += chunk.length
  })

  const targetRate = Math.min(16000, inputSampleRate)
  const ratio = inputSampleRate / targetRate
  const outputLength = Math.max(1, Math.round(merged.length / ratio))
  const samples = new Float32Array(outputLength)

  for (let index = 0; index < outputLength; index += 1) {
    const start = Math.floor(index * ratio)
    const end = Math.min(Math.floor((index + 1) * ratio), merged.length)
    let sum = 0
    for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
      sum += merged[sourceIndex]
    }
    samples[index] = sum / Math.max(1, end - start)
  }

  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeText = (position, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(position + index, value.charCodeAt(index))
    }
  }

  writeText(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, targetRate, true)
  view.setUint32(28, targetRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  })

  return new File([buffer], `voice-${Date.now()}.wav`, { type: 'audio/wav' })
}

const MODE_STYLES = {
  chat: {
    active: 'bg-gray-900 dark:bg-white/10 text-white dark:text-white border border-gray-800 dark:border-white/10 shadow-sm',
    activeText: 'text-white dark:text-white',
    border: 'border-black/10 dark:border-white/10',
    sendBg: 'bg-gray-900 dark:bg-white text-white dark:text-black hover:bg-black dark:hover:bg-gray-200',
    focusRing: 'focus-within:ring-2 focus-within:ring-black/5 dark:focus-within:ring-white/10',
  },
  expense: {
    active: 'bg-red-500/15 dark:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/25 shadow-sm',
    activeText: 'text-red-600 dark:text-red-400',
    border: 'border-red-200 dark:border-red-500/20',
    sendBg: 'bg-red-500 text-white hover:bg-red-600',
    focusRing: 'focus-within:ring-2 focus-within:ring-red-500/15',
  },
  income: {
    active: 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/25 shadow-sm',
    activeText: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-200 dark:border-emerald-500/20',
    sendBg: 'bg-emerald-500 text-white hover:bg-emerald-600',
    focusRing: 'focus-within:ring-2 focus-within:ring-emerald-500/15',
  },
  loan: {
    active: 'bg-amber-500/15 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/25 shadow-sm',
    activeText: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-500/20',
    sendBg: 'bg-amber-500 text-white hover:bg-amber-600',
    focusRing: 'focus-within:ring-2 focus-within:ring-amber-500/15',
  },
}

const renderInlineContent = (text) => {
  const tokens = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)

  return tokens.map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={index} className="font-semibold text-gray-950 dark:text-white">{token.slice(2, -2)}</strong>
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={index} className="rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5 text-[0.92em]">{token.slice(1, -1)}</code>
    }
    return <span key={index}>{token}</span>
  })
}

const isTableDivider = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)

const splitTableRow = (line) => line
  .trim()
  .replace(/^\|/, '')
  .replace(/\|$/, '')
  .split('|')
  .map(cell => cell.trim())

const renderAssistantMessage = (text) => {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      blocks.push(
        <h3 key={`heading-${index}`} className="pt-1 text-[15px] sm:text-base font-semibold tracking-tight text-gray-950 dark:text-white">
          {renderInlineContent(heading[2])}
        </h3>
      )
      index += 1
      continue
    }

    if (index + 1 < lines.length && trimmed.includes('|') && isTableDivider(lines[index + 1])) {
      const headers = splitTableRow(line)
      const rows = []
      index += 2
      while (index < lines.length && lines[index].trim().includes('|') && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]))
        index += 1
      }
      blocks.push(
        <div key={`table-${index}`} className="overflow-x-auto rounded-xl border border-gray-200/70 dark:border-white/10">
          <table className="min-w-full text-left text-xs sm:text-sm">
            <thead className="bg-gray-50 dark:bg-white/[0.04] text-gray-600 dark:text-gray-300">
              <tr>
                {headers.map((header, cellIndex) => (
                  <th key={cellIndex} className="px-3 py-2.5 font-semibold">{renderInlineContent(header)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/70 dark:divide-white/10">
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="px-3 py-2 text-gray-700 dark:text-gray-200">{renderInlineContent(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/)
    if (bulletMatch) {
      const items = []
      while (index < lines.length) {
        const match = lines[index].trim().match(/^[-*]\s+(.+)$/)
        if (!match) break
        items.push(match[1])
        index += 1
      }
      blocks.push(
        <ul key={`bullets-${index}`} className="space-y-1.5 pl-5 list-disc marker:text-gray-400 dark:marker:text-gray-500">
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="pl-1">{renderInlineContent(item)}</li>
          ))}
        </ul>
      )
      continue
    }

    const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/)
    if (numberedMatch) {
      const items = []
      while (index < lines.length) {
        const match = lines[index].trim().match(/^\d+\.\s+(.+)$/)
        if (!match) break
        items.push(match[1])
        index += 1
      }
      blocks.push(
        <ol key={`numbered-${index}`} className="space-y-1.5 pl-5 list-decimal marker:font-semibold marker:text-gray-500 dark:marker:text-gray-400">
          {items.map((item, itemIndex) => (
            <li key={itemIndex} className="pl-1">{renderInlineContent(item)}</li>
          ))}
        </ol>
      )
      continue
    }

    const paragraphLines = [trimmed]
    index += 1
    while (index < lines.length && lines[index].trim()) {
      const next = lines[index].trim()
      if (/^(#{1,4})\s+/.test(next) || /^[-*]\s+/.test(next) || /^\d+\.\s+/.test(next)) break
      if (index + 1 < lines.length && next.includes('|') && isTableDivider(lines[index + 1])) break
      paragraphLines.push(next)
      index += 1
    }
    blocks.push(
      <p key={`paragraph-${index}`} className="leading-6 sm:leading-7">
        {renderInlineContent(paragraphLines.join(' '))}
      </p>
    )
  }

  return (
    <div className="space-y-3.5 text-sm sm:text-[15px] text-gray-800 dark:text-gray-100">
      {blocks}
    </div>
  )
}

export default function Chat({ onExpenseAdded, onTableRefresh, user, currentGroup, isVisible = true, compact = false, onClearChat, showMessagesArea = true }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // Chat messages are saved only in this browser (localStorage).
  // Financial records are saved separately in Supabase.
  const [messages, setMessages] = useState(() => {
    try {
      const storedMessages = JSON.parse(localStorage.getItem('pfm_messages') || '[]')
      return Array.isArray(storedMessages)
        ? storedMessages.map((message, index) => (
            message?.type === 'confirmation' && !message.id
              ? { ...message, id: `restored-confirmation-${index}` }
              : message
          ))
        : []
    } catch { return [] }
  })
  // A local copy of the user's Supabase records. Chat mode sends these records
  // to the backend so it can answer questions using the user's real data.
  const [expensesData, setExpensesData] = useState([])

  // Parsed transactions wait here when the user must confirm a category,
  // loan type, or transactions found in an uploaded image/audio file.
  const [pendingTransactions, setPendingTransactions] = useState(null)
  const [pendingIntent, setPendingIntent] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [attachment, setAttachment] = useState(null)
  const [previewImage, setPreviewImage] = useState(null)
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [voiceSessionOpen, setVoiceSessionOpen] = useState(false)
  const [voiceSessionStatus, setVoiceSessionStatus] = useState('idle')
  const [voiceSessionText, setVoiceSessionText] = useState('')
  const [voiceAutoSubmit, setVoiceAutoSubmit] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const keyboardCheckTimerRef = useRef(null)
  const largestViewportHeightRef = useRef(
    typeof window !== 'undefined' ? (window.visualViewport?.height || window.innerHeight) : 0
  )
  const messagesRef = useRef(messages)
  const tabRefs = useRef({})
  const imageInputRef = useRef(null)
  const attachmentMenuRef = useRef(null)
  const attachmentUrlRef = useRef(null)
  const recordingChunksRef = useRef([])
  const recordingSampleRateRef = useRef(16000)
  const recordingStreamRef = useRef(null)
  const recordingContextRef = useRef(null)
  const recordingSourceRef = useRef(null)
  const recordingProcessorRef = useRef(null)
  const recordingIntervalRef = useRef(null)
  const recordingTimeoutRef = useRef(null)
  const recordingStartedAtRef = useRef(0)
  const isRecordingRef = useRef(false)
  const recordingPurposeRef = useRef('attachment')
  const processingAbortRef = useRef(null)
  const confirmationInFlightRef = useRef(new Set())
  const confirmedIntentRef = useRef(null)
  const messageSequenceRef = useRef(0)
  const handleSubmitRef = useRef(null)
  const startAudioRecordingRef = useRef(null)
  const voiceAwaitingReplyRef = useRef(false)
  const voiceReplyStartIndexRef = useRef(0)
  const lastSpokenMessageRef = useRef(null)
  const voiceSessionOpenRef = useRef(false)
  const voiceContinueListeningRef = useRef(false)
  const voiceSessionPausedRef = useRef(false)
  const voicePlaybackRef = useRef(null)
  const voicePlaybackUrlRef = useRef(null)
  const voiceTtsAbortRef = useRef(null)
  const voiceHadSpeechRef = useRef(false)
  const voiceSpeechStartedAtRef = useRef(0)
  const voiceLastSpeechAtRef = useRef(0)
  const voiceNoiseFloorRef = useRef(0.006)
  const voiceConsecutiveFramesRef = useRef(0)
  const voiceAutoStopRef = useRef(false)
  const toggleVoicePauseRef = useRef(null)
  const startVoiceListeningRef = useRef(null)
  const voiceRecognitionRef = useRef(null)
  const voiceRecognitionActiveRef = useRef(false)
  const voiceRecognitionTranscriptRef = useRef('')
  const voiceRecognitionFinalTranscriptRef = useRef('')
  const voiceRecognitionFinalizeTimerRef = useRef(null)
  const voiceRecognitionStartedAtRef = useRef(0)
  const voicePendingPartialTranscriptRef = useRef('')
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  const [carouselDir, setCarouselDir] = useState(0) // -1 left, 1 right
  const [animating, setAnimating] = useState(false)
  const touchStartX = useRef(null)

  // The four modes are: chat, expense, income, and loan.
  // The last selected mode is restored from localStorage.
  const [inputMode, setInputMode] = useState(getSavedInputMode)
  const [autoIntentEnabled, setAutoIntentEnabled] = useState(getSavedAutoIntent)
  const [isComposerFocused, setIsComposerFocused] = useState(false)

  const updateComposerFocus = useCallback((focused) => {
    setIsComposerFocused(focused)
    window.dispatchEvent(new CustomEvent('pfm:composer-focus', { detail: { focused } }))
  }, [])

  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent('pfm:composer-focus', { detail: { focused: false } }))
  }, [updateComposerFocus])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return undefined

    const syncKeyboardState = () => {
      window.clearTimeout(keyboardCheckTimerRef.current)
      keyboardCheckTimerRef.current = window.setTimeout(() => {
        const viewportHeight = viewport.height
        largestViewportHeightRef.current = Math.max(largestViewportHeightRef.current, viewportHeight)
        const keyboardIsOpen = largestViewportHeightRef.current - viewportHeight > 120

        if (!keyboardIsOpen && document.activeElement === inputRef.current) {
          inputRef.current?.blur()
        }
        updateComposerFocus(keyboardIsOpen)
      }, 100)
    }

    viewport.addEventListener('resize', syncKeyboardState)
    window.addEventListener('orientationchange', syncKeyboardState)

    return () => {
      window.clearTimeout(keyboardCheckTimerRef.current)
      viewport.removeEventListener('resize', syncKeyboardState)
      window.removeEventListener('orientationchange', syncKeyboardState)
    }
  }, [updateComposerFocus])

  useEffect(() => {
    localStorage.setItem(INPUT_MODE_STORAGE_KEY, inputMode)
  }, [inputMode, isVisible])

  useEffect(() => {
    localStorage.setItem(AUTO_INTENT_STORAGE_KEY, String(autoIntentEnabled))
  }, [autoIntentEnabled])

  // Update sliding indicator position whenever inputMode changes
  useEffect(() => {
    const btn = tabRefs.current[inputMode]
    if (btn) {
      const parent = btn.parentElement
      const parentLeft = parent.getBoundingClientRect().left
      const btnRect = btn.getBoundingClientRect()
      setIndicatorStyle({
        left: btnRect.left - parentLeft,
        width: btnRect.width,
      })
    }
  }, [inputMode])

  // Carousel helpers
  const currentModeIndex = INPUT_MODES.findIndex(m => m.id === inputMode)
  const prevMode = INPUT_MODES[(currentModeIndex - 1 + INPUT_MODES.length) % INPUT_MODES.length]
  const nextMode = INPUT_MODES[(currentModeIndex + 1) % INPUT_MODES.length]

  const switchCarousel = (dir) => {
    if (animating) return
    setAnimating(true)
    setCarouselDir(dir)
    const newIndex = (currentModeIndex + dir + INPUT_MODES.length) % INPUT_MODES.length
    setTimeout(() => {
      setInputMode(INPUT_MODES[newIndex].id)
      setCarouselDir(0)
      setAnimating(false)
    }, 260)
  }

  // Touch swipe for carousel
  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 40) switchCarousel(diff > 0 ? 1 : -1)
    touchStartX.current = null
  }

  const currentModeConfig = INPUT_MODES.find(m => m.id === inputMode) || INPUT_MODES[0]
  const CurrentModeIcon = currentModeConfig.icon
  const currentStyle = MODE_STYLES[inputMode] || MODE_STYLES.chat

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  useEffect(() => {
    messagesRef.current = messages

    // Canvas previews are compact data URLs and remain valid after a reload.
    // Blob URLs (used for audio) are temporary and must not be persisted.
    const persistableMessages = messages.map(message => {
      if (!message.attachment) return message
      const previewUrl = message.attachment.previewUrl
      return {
        ...message,
        attachment: {
          ...message.attachment,
          previewUrl: previewUrl?.startsWith('data:image/') ? previewUrl : undefined,
        },
      }
    })

    try {
      localStorage.setItem('pfm_messages', JSON.stringify(persistableMessages))
    } catch {
      // Keep chat usable if the browser's local storage quota is full. Text
      // history is more important than retaining old image thumbnails.
      const messagesWithoutPreviews = persistableMessages.map(message => message.attachment
        ? { ...message, attachment: { ...message.attachment, previewUrl: undefined } }
        : message)
      try {
        localStorage.setItem('pfm_messages', JSON.stringify(messagesWithoutPreviews))
      } catch { }
    }
  }, [messages])

  useEffect(() => {
    if (!previewImage) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setPreviewImage(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [previewImage])

  const fetchExpensesData = useCallback(async () => {
    try {
      // All expense, income, and loan records live in the same Supabase table.
      // Personal mode reads this user's rows; group mode reads the group's rows.
      let query = supabase.from('expenses').select('*')
      if (currentGroup) {
        query = query.eq('group_id', currentGroup.id)
      } else {
        query = query.eq('user_id', user.id).is('group_id', null)
      }
      const { data, error } = await query.order('created_at', { ascending: false }).limit(1000)
      if (!error) setExpensesData(data || [])
    } catch (err) { }
  }, [user, currentGroup])

  useEffect(() => {
    if (user) fetchExpensesData()
  }, [user, currentGroup, fetchExpensesData])

  const replaceAttachment = useCallback((nextAttachment) => {
    if (attachmentUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(attachmentUrlRef.current)
    }
    attachmentUrlRef.current = nextAttachment?.previewUrl || null
    setAttachment(nextAttachment)
  }, [])

  const stopAudioRecording = useCallback(() => {
    if (!isRecordingRef.current) return

    isRecordingRef.current = false
    setIsRecording(false)
    clearInterval(recordingIntervalRef.current)
    clearTimeout(recordingTimeoutRef.current)

    const duration = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000))
    const chunks = recordingChunksRef.current
    const sampleRate = recordingSampleRateRef.current
    const recordingPurpose = recordingPurposeRef.current
    const voiceHadSpeech = voiceHadSpeechRef.current
    const isVoicePurpose = recordingPurpose === 'voice'
    recordingPurposeRef.current = 'attachment'

    if (recordingProcessorRef.current) {
      recordingProcessorRef.current.onaudioprocess = null
      recordingProcessorRef.current.disconnect()
    }
    recordingSourceRef.current?.disconnect()
    recordingStreamRef.current?.getTracks().forEach(track => track.stop())
    recordingContextRef.current?.close().catch(() => {})
    voiceRecognitionRef.current?.abort()

    recordingProcessorRef.current = null
    recordingSourceRef.current = null
    recordingStreamRef.current = null
    recordingContextRef.current = null
    recordingChunksRef.current = []
    setRecordingSeconds(0)

    if (recordingPurpose === 'discard') return

    if (isVoicePurpose && !voiceHadSpeech) {
      setVoiceSessionStatus(voiceSessionPausedRef.current ? 'paused' : 'idle')
      setVoiceSessionText(voiceSessionPausedRef.current
        ? 'Voice conversation paused'
        : 'I did not hear speech · listening will resume')
      if (recordingPurpose === 'voice' && voiceSessionOpenRef.current && voiceContinueListeningRef.current && !voiceSessionPausedRef.current) {
        window.setTimeout(() => startAudioRecordingRef.current?.('voice'), 500)
      }
      return
    }

    if (!chunks.length) {
      setMessages(prev => [...prev, { type: 'bot', text: 'No audio was captured. Please try recording again.' }])
      if (recordingPurpose === 'voice') {
        setVoiceSessionStatus('idle')
        setVoiceSessionText('No audio was captured · tap to try again')
      }
      return
    }

    const file = createWavFile(chunks, sampleRate)
    replaceAttachment({
      type: 'audio',
      file,
      name: 'Voice recording',
      duration,
      previewUrl: URL.createObjectURL(file),
    })
    if (isVoicePurpose) {
      setVoiceSessionStatus('processing')
      setVoiceSessionText('Understanding your voice…')
      setVoiceAutoSubmit(true)
    }
  }, [replaceAttachment])

  const startAudioRecording = async (purpose = 'attachment') => {
    if (!navigator.mediaDevices?.getUserMedia || isRecordingRef.current) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessages(prev => [...prev, { type: 'bot', text: 'Audio recording is not supported by this browser.' }])
      }
      return
    }

    let stream = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) throw new Error('Audio recording is not supported by this browser.')

      const audioContext = new AudioContextClass()
      await audioContext.resume()
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)

      recordingChunksRef.current = []
      recordingSampleRateRef.current = audioContext.sampleRate
      voiceHadSpeechRef.current = false
      voiceSpeechStartedAtRef.current = 0
      voiceLastSpeechAtRef.current = 0
      voiceNoiseFloorRef.current = 0.006
      voiceConsecutiveFramesRef.current = 0
      voiceAutoStopRef.current = false
      processor.onaudioprocess = (event) => {
        const channel = event.inputBuffer.getChannelData(0)
        recordingChunksRef.current.push(new Float32Array(channel))
        event.outputBuffer.getChannelData(0).fill(0)

        if (purpose !== 'voice' || voiceSessionPausedRef.current) return

        let energy = 0
        for (let index = 0; index < channel.length; index += 1) {
          energy += channel[index] * channel[index]
        }
        const rms = Math.sqrt(energy / Math.max(1, channel.length))
        const now = performance.now()
        const threshold = Math.max(VOICE_LEVEL_FLOOR, voiceNoiseFloorRef.current * 2.8)

        if (!voiceHadSpeechRef.current) {
          voiceNoiseFloorRef.current = (voiceNoiseFloorRef.current * 0.94) + (Math.min(rms, 0.03) * 0.06)
          voiceConsecutiveFramesRef.current = rms > threshold
            ? voiceConsecutiveFramesRef.current + 1
            : Math.max(0, voiceConsecutiveFramesRef.current - 1)
          if (voiceConsecutiveFramesRef.current >= 2) {
            voiceHadSpeechRef.current = true
            voiceSpeechStartedAtRef.current = now
            voiceLastSpeechAtRef.current = now
            setVoiceSessionText('I’m listening…')
          }
          return
        }

        if (rms > Math.max(VOICE_LEVEL_FLOOR * 0.75, threshold * 0.72)) {
          voiceLastSpeechAtRef.current = now
        }
        const speechDuration = now - voiceSpeechStartedAtRef.current
        const silenceDuration = now - voiceLastSpeechAtRef.current
        if (
          !voiceAutoStopRef.current
          && speechDuration >= VOICE_MIN_SPEECH_MS
          && silenceDuration >= VOICE_END_SILENCE_MS
        ) {
          voiceAutoStopRef.current = true
          window.setTimeout(() => stopAudioRecording(), 0)
        }
      }
      source.connect(processor)
      processor.connect(audioContext.destination)

      replaceAttachment(null)
      recordingStreamRef.current = stream
      recordingContextRef.current = audioContext
      recordingSourceRef.current = source
      recordingProcessorRef.current = processor
      recordingStartedAtRef.current = Date.now()
      recordingPurposeRef.current = purpose
      isRecordingRef.current = true
      setRecordingSeconds(0)
      setIsRecording(true)
      if (purpose === 'voice') {
        voiceContinueListeningRef.current = true
        setVoiceSessionStatus('listening')
        setVoiceSessionText('Listening…')
      }

      recordingIntervalRef.current = setInterval(() => {
        setRecordingSeconds(Math.min(30, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000)))
      }, 250)
      recordingTimeoutRef.current = setTimeout(stopAudioRecording, 45000)
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop())
      if (purpose === 'voice') {
        setVoiceSessionStatus('idle')
        setVoiceSessionText(error.name === 'NotAllowedError'
          ? 'Microphone access is required for voice conversations'
          : 'Could not start the microphone · tap to try again')
      }
      setMessages(prev => [...prev, {
        type: 'bot',
        text: error.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow microphone access and try again.'
          : (error.message || 'Unable to start audio recording.'),
      }])
    }
  }

  startAudioRecordingRef.current = startAudioRecording

  const cancelVoiceRecognition = () => {
    voiceRecognitionActiveRef.current = false
    voiceRecognitionTranscriptRef.current = ''
    voiceRecognitionFinalTranscriptRef.current = ''
    clearTimeout(voiceRecognitionFinalizeTimerRef.current)
    voiceRecognitionFinalizeTimerRef.current = null
    clearInterval(recordingIntervalRef.current)
    setRecordingSeconds(0)
    if (voiceRecognitionRef.current) {
      voiceRecognitionRef.current.onend = null
      try { voiceRecognitionRef.current.abort() } catch (error) { }
      voiceRecognitionRef.current = null
    }
  }

  const startVoiceListening = () => {
    if (
      !voiceSessionOpenRef.current
      || !voiceContinueListeningRef.current
      || voiceSessionPausedRef.current
      || voiceRecognitionActiveRef.current
    ) return

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      startAudioRecordingRef.current?.('voice')
      return
    }

    const recognition = new SpeechRecognition()
    let fallbackToRecorder = false
    recognition.lang = navigator.language?.startsWith('en') ? navigator.language : 'en-IN'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    voiceRecognitionRef.current = recognition
    voiceRecognitionActiveRef.current = true
    voiceRecognitionTranscriptRef.current = ''
    voiceRecognitionFinalTranscriptRef.current = ''
    voiceRecognitionStartedAtRef.current = Date.now()
    setRecordingSeconds(0)
    setVoiceSessionStatus('listening')

    const startedAt = Date.now()
    recordingIntervalRef.current = setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 250)

    const submitAfterSilence = () => {
      clearTimeout(voiceRecognitionFinalizeTimerRef.current)
      voiceRecognitionFinalizeTimerRef.current = window.setTimeout(() => {
        if (!voiceRecognitionActiveRef.current || !voiceSessionOpenRef.current || voiceSessionPausedRef.current) return
        const rawTranscript = (voiceRecognitionFinalTranscriptRef.current || voiceRecognitionTranscriptRef.current || '').trim()
        const transcript = cleanSpokenTranscript(rawTranscript)
        if (!transcript || Date.now() - voiceRecognitionStartedAtRef.current < VOICE_MIN_SPEECH_MS) return
        setVoiceSessionStatus('processing')
        voiceRecognitionTranscriptRef.current = transcript
        try { recognition.stop() } catch (error) { }
      }, VOICE_END_SILENCE_MS)
    }

    recognition.onresult = (event) => {
      let finalTranscript = voiceRecognitionFinalTranscriptRef.current
      let interimTranscript = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const text = result[0]?.transcript || ''
        if (result.isFinal) finalTranscript = `${finalTranscript} ${text}`.trim()
        else interimTranscript = `${interimTranscript} ${text}`.trim()
      }
      voiceRecognitionFinalTranscriptRef.current = cleanSpokenTranscript(finalTranscript)
      const transcript = cleanSpokenTranscript(`${voiceRecognitionFinalTranscriptRef.current} ${interimTranscript}`)
      if (transcript) {
        voiceRecognitionTranscriptRef.current = transcript
        setVoiceSessionText(transcript)
        submitAfterSilence()
      }
    }
    recognition.onspeechend = () => {
      submitAfterSilence()
    }
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        voiceContinueListeningRef.current = false
        voiceRecognitionActiveRef.current = false
        setVoiceSessionStatus('idle')
        setVoiceSessionText('Microphone access is required')
      } else if (event.error === 'network' || event.error === 'audio-capture') {
        fallbackToRecorder = true
      }
    }
    recognition.onend = () => {
      const shouldHandle = voiceRecognitionActiveRef.current
      const transcript = cleanSpokenTranscript(`${voicePendingPartialTranscriptRef.current} ${voiceRecognitionTranscriptRef.current}`)
      voiceRecognitionActiveRef.current = false
      voiceRecognitionRef.current = null
      clearTimeout(voiceRecognitionFinalizeTimerRef.current)
      voiceRecognitionFinalizeTimerRef.current = null
      clearInterval(recordingIntervalRef.current)
      setRecordingSeconds(0)
      if (!shouldHandle || !voiceSessionOpenRef.current || voiceSessionPausedRef.current) return

      if (fallbackToRecorder) {
        startAudioRecordingRef.current?.('voice')
        return
      }
      if (!transcript) {
        window.setTimeout(() => startVoiceListeningRef.current?.(), 180)
        return
      }

      if (isIncompleteVoiceUtterance(transcript)) {
        voicePendingPartialTranscriptRef.current = transcript
        setVoiceSessionStatus('listening')
        setVoiceSessionText('Go ahead, I’m still listening…')
        window.setTimeout(() => startVoiceListeningRef.current?.(), 120)
        return
      }

      voicePendingPartialTranscriptRef.current = ''
      setVoiceSessionStatus('processing')
      voiceReplyStartIndexRef.current = messagesRef.current.length
      voiceAwaitingReplyRef.current = true
      handleSubmitRef.current?.({ preventDefault: () => {} }, { text: transcript, voice: true })
    }

    try {
      recognition.start()
    } catch (error) {
      cancelVoiceRecognition()
      startAudioRecordingRef.current?.('voice')
    }
  }

  startVoiceListeningRef.current = startVoiceListening

  const attachImageFile = async (file) => {
    if (!file) return

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setMessages(prev => [...prev, { type: 'bot', text: 'Please attach a JPG or PNG image.' }])
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessages(prev => [...prev, { type: 'bot', text: 'Please choose an image smaller than 5 MB.' }])
      return
    }

    try {
      const previewUrl = await createImagePreview(file)
      replaceAttachment({ type: 'image', file, name: file.name, previewUrl })
    } catch (error) {
      setMessages(prev => [...prev, { type: 'bot', text: error.message || 'Unable to preview that image.' }])
    }
  }

  const handleImageSelected = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    setAttachmentMenuOpen(false)
    await attachImageFile(file)
  }

  const handleImagePaste = async (event) => {
    const clipboardItems = Array.from(event.clipboardData?.items || [])
    const imageItem = clipboardItems.find(item => item.kind === 'file' && item.type.startsWith('image/'))
    if (!imageItem) return

    // An image paste is an attachment action, so do not also insert any text
    // representation of the clipboard contents into the composer.
    event.preventDefault()
    setAttachmentMenuOpen(false)

    const clipboardFile = imageItem.getAsFile()
    if (!clipboardFile) {
      setMessages(prev => [...prev, { type: 'bot', text: 'Unable to read the pasted image. Please try the photo picker.' }])
      return
    }

    const extension = clipboardFile.type === 'image/jpeg' ? 'jpg' : 'png'
    const pastedFile = new File(
      [clipboardFile],
      `pasted-image-${Date.now()}.${extension}`,
      { type: clipboardFile.type, lastModified: Date.now() },
    )
    await attachImageFile(pastedFile)
  }

  useEffect(() => {
    const closeAttachmentMenu = (event) => {
      if (attachmentMenuRef.current && !attachmentMenuRef.current.contains(event.target)) {
        setAttachmentMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', closeAttachmentMenu)
    return () => document.removeEventListener('mousedown', closeAttachmentMenu)
  }, [])

  useEffect(() => () => {
    clearInterval(recordingIntervalRef.current)
    clearTimeout(recordingTimeoutRef.current)
    recordingProcessorRef.current?.disconnect()
    recordingSourceRef.current?.disconnect()
    recordingStreamRef.current?.getTracks().forEach(track => track.stop())
    recordingContextRef.current?.close().catch(() => {})
    if (attachmentUrlRef.current?.startsWith('blob:')) URL.revokeObjectURL(attachmentUrlRef.current)
    processingAbortRef.current?.abort()
    voiceTtsAbortRef.current?.abort()
    voicePlaybackRef.current?.pause()
    if (voicePlaybackUrlRef.current) URL.revokeObjectURL(voicePlaybackUrlRef.current)
  }, [])

  const stopVoicePlayback = useCallback(() => {
    voiceTtsAbortRef.current?.abort()
    voiceTtsAbortRef.current = null
    window.speechSynthesis?.cancel()
    if (voicePlaybackRef.current) {
      voicePlaybackRef.current.onended = null
      voicePlaybackRef.current.onerror = null
      voicePlaybackRef.current.pause()
      voicePlaybackRef.current.currentTime = 0
      voicePlaybackRef.current = null
    }
    if (voicePlaybackUrlRef.current) {
      URL.revokeObjectURL(voicePlaybackUrlRef.current)
      voicePlaybackUrlRef.current = null
    }
  }, [])

  const stopProcessing = () => {
    processingAbortRef.current?.abort()
    processingAbortRef.current = null
    setLoading(false)
    if (voiceSessionOpen) {
      voiceAwaitingReplyRef.current = false
      setVoiceSessionStatus('idle')
      setVoiceSessionText('Stopped · tap the microphone to continue')
    }
  }

  const openVoiceSession = () => {
    voiceSessionOpenRef.current = true
    voiceContinueListeningRef.current = true
    voiceSessionPausedRef.current = false
    voicePendingPartialTranscriptRef.current = ''
    setVoiceSessionOpen(true)
    setVoiceSessionText('Listening…')
    window.setTimeout(() => startVoiceListeningRef.current?.(), 0)
  }

  const closeVoiceSession = () => {
    voiceSessionOpenRef.current = false
    voiceContinueListeningRef.current = false
    voiceSessionPausedRef.current = false
    voicePendingPartialTranscriptRef.current = ''
    stopVoicePlayback()
    cancelVoiceRecognition()
    voiceAwaitingReplyRef.current = false
    if (isRecordingRef.current && recordingPurposeRef.current === 'voice') {
      recordingPurposeRef.current = 'discard'
      stopAudioRecording()
    }
    setVoiceSessionOpen(false)
    setVoiceSessionStatus('idle')
    setVoiceSessionText('')
  }

  const interruptVoiceAndListen = useCallback(() => {
    stopVoicePlayback()
    if (processingAbortRef.current) {
      processingAbortRef.current.abort()
      processingAbortRef.current = null
      setLoading(false)
      voiceAwaitingReplyRef.current = false
    }
    cancelVoiceRecognition()
    voiceContinueListeningRef.current = true
    voiceSessionPausedRef.current = false
    setVoiceSessionStatus('listening')
    setVoiceSessionText('Listening…')
    startVoiceListeningRef.current?.()
  }, [stopVoicePlayback])

  const toggleVoicePause = () => {
    if (voiceSessionPausedRef.current) {
      voiceSessionPausedRef.current = false
      voiceContinueListeningRef.current = true
      setVoiceSessionText('Listening…')
      startVoiceListeningRef.current?.()
      return
    }

    voiceSessionPausedRef.current = true
    voiceContinueListeningRef.current = false
    stopVoicePlayback()
    cancelVoiceRecognition()
    if (isRecordingRef.current && recordingPurposeRef.current === 'voice') {
      recordingPurposeRef.current = 'discard'
      stopAudioRecording()
    }
    if (processingAbortRef.current) stopProcessing()
    setVoiceSessionStatus('paused')
    setVoiceSessionText('Voice conversation paused')
  }

  toggleVoicePauseRef.current = toggleVoicePause

  useEffect(() => {
    if (!voiceSessionOpen) return undefined
    const handleVoiceKeyboard = (event) => {
      if (event.code !== 'Space' || event.repeat) return
      event.preventDefault()
      if (voiceSessionStatus === 'speaking' || voiceSessionStatus === 'processing') {
        interruptVoiceAndListen()
      } else if (voiceSessionStatus === 'paused') {
        toggleVoicePauseRef.current?.()
      }
    }
    window.addEventListener('keydown', handleVoiceKeyboard)
    return () => window.removeEventListener('keydown', handleVoiceKeyboard)
  }, [voiceSessionOpen, voiceSessionStatus, interruptVoiceAndListen])

  // Check if a word looks like a real word (has vowels, not random consonants)
  const isRealWord = (word) => {
    const clean = word.replace(/[^a-zA-Z]/g, '')
    if (clean.length < 2) return false
    // Must contain at least one vowel
    if (!/[aeiouAEIOU]/.test(clean)) return false
    // No more than 4 consecutive consonants
    if (/[^aeiouAEIOU\s]{5,}/i.test(clean)) return false
    // For longer words, vowel ratio must be at least 15%
    if (clean.length > 5) {
      const vowelCount = (clean.match(/[aeiouAEIOU]/g) || []).length
      if (vowelCount / clean.length < 0.15) return false
    }
    return true
  }

  const handleSubmit = async (e, submissionOverride = null) => {
    e.preventDefault()

    // This is the main message flow:
    // 1. Read text/image/audio input.
    // 2. Detect whether it is chat, expense, income, or loan.
    // 3. Ask the backend to answer or parse it.
    // 4. Save parsed transactions through onExpenseAdded when ready.
    const requestedText = submissionOverride?.text !== undefined
      ? String(submissionOverride.text || '').trim()
      : input.trim()
    const requestedAttachment = submissionOverride?.attachment !== undefined
      ? submissionOverride.attachment
      : attachment
    if ((!requestedText && !requestedAttachment) || isRecordingRef.current || loading) return

    const originalText = submissionOverride?.voice
      ? cleanSpokenTranscript(requestedText)
      : requestedText
    if (!originalText && !requestedAttachment) return
    const submittedAttachment = requestedAttachment
    const existingMessageId = submissionOverride?.existingMessageId || null
    const messageId = existingMessageId || `message-${Date.now()}-${messageSequenceRef.current += 1}`
    const controller = new AbortController()
    const messageAttachment = submittedAttachment
      ? {
        type: submittedAttachment.type,
        name: submittedAttachment.name,
        duration: submittedAttachment.duration,
        previewUrl: submittedAttachment.type === 'image' ? submittedAttachment.previewUrl : undefined,
      }
      : null
    let userMsg = originalText
    let displayText = originalText
    let mediaTransactions = []
    let mediaSummary = ''
    let mediaIntent = null
    const confirmedIntent = submissionOverride?.confirmedMode || (
      confirmedIntentRef.current?.text === originalText
        ? confirmedIntentRef.current.mode
        : null
    )
    if (confirmedIntent) confirmedIntentRef.current = null
    let resolvedMode = confirmedIntent || inputMode

    processingAbortRef.current = controller
    setLoading(true)
    setAttachmentMenuOpen(false)
    setInput('')
    replaceAttachment(null)
    if (existingMessageId) {
      setMessages(prev => prev.map(message => (
        message.id === existingMessageId
          ? { ...message, mode: resolvedMode }
          : message
      )))
    } else {
      setMessages(prev => [...prev, {
        id: messageId,
        type: 'user',
        text: originalText,
        mode: inputMode,
        attachment: messageAttachment,
        fromAudio: Boolean(submissionOverride?.voice || submittedAttachment?.type === 'audio'),
      }])
    }

    const finishProcessing = () => {
      if (processingAbortRef.current === controller) {
        processingAbortRef.current = null
        setLoading(false)
      }
    }

    const updateSubmittedMessage = (changes) => {
      setMessages(prev => prev.map(message => (
        message.id === messageId ? { ...message, ...changes } : message
      )))
    }

    if (submittedAttachment) {
      try {
        // Images and voice recordings are converted to base64 and sent to the
        // backend. The backend returns readable text and possible transactions.
        const encodedMedia = await fileToBase64(submittedAttachment.file)
        const mediaResponse = await axios.post(`${getApiBaseUrl()}/api/expenses/media/understand`, {
          media_type: submittedAttachment.type,
          mime_type: submittedAttachment.file.type,
          data: encodedMedia,
          prompt: originalText,
        }, { signal: controller.signal })
        const extractedText = submittedAttachment.type === 'audio'
          ? cleanSpokenTranscript(mediaResponse.data?.text || '')
          : String(mediaResponse.data?.text || '').trim()
        if (!extractedText) throw new Error('No usable text was found in the media.')

        mediaTransactions = Array.isArray(mediaResponse.data?.transactions)
          ? mediaResponse.data.transactions
          : []
        mediaSummary = String(mediaResponse.data?.summary || mediaResponse.data?.brief || '').trim()
        mediaIntent = INPUT_MODES.some(mode => mode.id === mediaResponse.data?.intent)
          ? mediaResponse.data.intent
          : null

        userMsg = submittedAttachment.type === 'audio' && originalText
          ? `${originalText}\nVoice transcript: ${extractedText}`
          : extractedText
        displayText = submittedAttachment.type === 'audio' ? (originalText || extractedText) : originalText
        updateSubmittedMessage({ text: displayText })
      } catch (error) {
        if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
          finishProcessing()
          return
        }
        const mediaError = error.response?.data?.detail || error.message || 'Unable to process the attached media.'
        setMessages(prev => [...prev, { type: 'bot', text: mediaError }])
        finishProcessing()
        return
      }
    }

    if (submissionOverride?.voice && !submittedAttachment && isIncompleteVoiceUtterance(userMsg)) {
      voicePendingPartialTranscriptRef.current = userMsg
      setMessages(prev => prev.filter(message => message.id !== messageId))
      setVoiceSessionStatus('listening')
      setVoiceSessionText('Go ahead, I’m still listening…')
      window.setTimeout(() => startVoiceListeningRef.current?.(), 120)
      finishProcessing()
      return
    }

    if (submissionOverride?.voice && !submittedAttachment && /^[\d\s,.-]+$/.test(userMsg)) {
      setMessages(prev => [...prev, {
        type: 'bot',
        text: `What does ${userMsg} refer to: an expense, income, or loan?`,
      }])
      finishProcessing()
      return
    }

    // When intent detection is enabled it is authoritative, including when a
    // transaction tab was selected previously. Turning it off preserves the
    // manually selected mode.
    const shouldClassifyIntent = autoIntentEnabled && !confirmedIntent
    if (shouldClassifyIntent) {
      const hasStructuredMediaTransactions = submittedAttachment && mediaTransactions.length > 0
      if (mediaIntent && !hasStructuredMediaTransactions) {
        resolvedMode = mediaIntent
      } else {
        try {
          // Intent detection only chooses the correct mode. It does not save
          // anything. Unclear input creates confirmation buttons for the user.
          const response = await axios.post(`${getApiBaseUrl()}/api/expenses/intent`, {
            text: userMsg,
            current_mode: inputMode,
          }, { signal: controller.signal })
          // Structured media already has a transaction review step below, so
          // keep that safer review flow instead of creating a text-only intent
          // confirmation that would lose the attachment. For media, the text
          // classifier corrects a multimodal model that tagged a handwritten
          // loan or income note as an expense.
          if (response.data?.needs_confirmation && !hasStructuredMediaTransactions) {
            const candidates = Array.isArray(response.data?.candidates)
              ? response.data.candidates.filter(candidate => ['expense', 'income', 'loan'].includes(candidate))
              : ['expense', 'income', 'loan']
            const confirmationId = `intent-confirmation-${messageId}`
            setPendingIntent({ text: userMsg, candidates, messageId, confirmationId })
            setMessages(prev => [...prev, {
              id: confirmationId,
              type: 'confirmation',
              confirmMode: 'intent',
              targetMessageId: messageId,
              candidates,
              text: response.data?.reason || 'I’m not certain what kind of transaction this is. Please confirm before I save it.',
            }])
            finishProcessing()
            return
          }
          if (response.data?.needs_confirmation && hasStructuredMediaTransactions) {
            // A media review already protects the write. Keep the media
            // model's validated transaction mode instead of falling back to
            // the currently selected tab when text classification is unsure.
            resolvedMode = mediaIntent || mediaTransactions[0]?.transaction_type || 'expense'
          }
          if (INPUT_MODES.some(mode => mode.id === response.data?.intent)) {
            const classifiedMode = response.data.intent
            resolvedMode = classifiedMode !== 'chat' || !mediaIntent ? classifiedMode : mediaIntent
          }
        } catch (error) {
          if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
            finishProcessing()
            return
          }
          // A failed classifier must never cause an unintended transaction write.
          resolvedMode = mediaIntent || (hasStructuredMediaTransactions ? mediaTransactions[0]?.transaction_type : null) || 'chat'
        }
      }

      if (resolvedMode !== inputMode) {
        setInputMode(resolvedMode)
      }
    }

    updateSubmittedMessage({ mode: resolvedMode })

    // Validate: expense/income/loan modes need an amount + a real description
    if (resolvedMode !== 'chat' && mediaTransactions.length === 0) {
      const resolvedModeConfig = INPUT_MODES.find(mode => mode.id === resolvedMode) || currentModeConfig
      const hasNumber = /\d/.test(userMsg)
      const words = userMsg.replace(/[\d.,;:!?]/g, '').trim().split(/\s+/).filter(w => w.length >= 2)
      const hasRealWord = words.some(w => isRealWord(w))

      if (!hasNumber || !hasRealWord) {
        const hint = !hasNumber
          ? `Include an amount. ${resolvedModeConfig.hint}`
          : `Use a real description. ${resolvedModeConfig.hint}`
        setMessages(prev => [...prev, { type: 'bot', text: hint }])
        finishProcessing()
        return
      }
    }

    try {
      if (resolvedMode === 'chat') {
        // CHAT MODE: Ask a question about existing financial records.
        // We send the records plus the last eight messages so follow-up
        // questions such as "what about last month?" have enough context.
        const { data: { user: freshUser } } = await supabase.auth.getUser()
        const currentUser = freshUser || user
        const userName = getFirstName(currentUser?.user_metadata?.name || currentUser?.email, 'User')

        const payload = {
          text: userMsg,
          user_id: currentUser?.id,
          user_email: currentUser?.email,
          user_name: userName,
          voice_mode: Boolean(submissionOverride?.voice),
          conversation_history: messages
            .filter(message => (message.type === 'user' || message.type === 'bot') && typeof message.text === 'string')
            .slice(-8)
            .map(message => ({
              role: message.type === 'user' ? 'user' : 'assistant',
              content: message.text
            }))
        }

        if (currentGroup) {
          // In group mode the assistant answers from the group's transactions.
          payload.group_name = currentGroup.name
          payload.group_expenses_data = expensesData
        } else {
          // Otherwise it answers from the signed-in user's personal records.
          payload.expenses_data = expensesData
        }

        let response
        try {
          response = await axios.post(`${getApiBaseUrl()}/api/expenses/chat`, payload, { signal: controller.signal })
        } catch (voiceError) {
          if (!submissionOverride?.voice || axios.isCancel(voiceError) || voiceError.code === 'ERR_CANCELED') throw voiceError
          response = await axios.post(
            `${getApiBaseUrl()}/api/expenses/chat`,
            { ...payload, voice_mode: false },
            { signal: controller.signal },
          )
        }
        // The backend calculates/retrieves the financial facts and returns a
        // ready-to-display natural-language answer in `reply`.
        setMessages(prev => [...prev, { type: 'bot', text: response.data.reply }])

      } else if (resolvedMode === 'expense') {
        // EXPENSE MODE: Convert text such as "lunch 250" into structured rows.
        // Structured image records can skip this second parsing request.
        let expenses = mediaTransactions.filter(transaction => transaction.transaction_type === 'expense')
        let reply = mediaSummary
        let rememberedCategories = []
        if (expenses.length === 0) {
          const response = await axios.post(`${getApiBaseUrl()}/api/expenses/parse`, { text: userMsg, mode: 'expense' }, { signal: controller.signal })
          expenses = response.data.expenses || []
          reply = response.data.reply
        }

        if (expenses && expenses.length > 0) {
          if (submittedAttachment) {
            const reviewSummary = submittedAttachment.type === 'image' && reply
              ? `${reply} Please review before saving.`
              : buildMediaReviewSummary(submittedAttachment.type, expenses)
            const confirmationId = `media-confirmation-${messageId}`
            setPendingTransactions({ confirmationId, expenses, forceMode: 'media', mediaType: submittedAttachment.type, summary: reviewSummary })
            setMessages(prev => [...prev, {
              id: confirmationId,
              type: 'confirmation',
              text: reviewSummary,
              expenses,
              confirmMode: 'media'
            }])
            return
          }

          const memoryResult = applyRememberedCategories(expenses, {
            userId: user?.id,
            transactionHistory: expensesData,
          })
          expenses = memoryResult.transactions
          rememberedCategories = memoryResult.applied
          const hasAmbiguous = expenses.some(exp => exp.needs_confirmation || (!exp.ai_classified && exp.category === 'Other'))

          if (hasAmbiguous) {
            // Do not save an uncertain category. Let the user choose first.
            const confirmationId = `expense-confirmation-${messageId}`
            setPendingTransactions({ confirmationId, expenses, forceMode: 'expense' })
            setMessages(prev => [...prev, {
              id: confirmationId,
              type: 'confirmation',
              text: reply || 'Choose a category for this expense:',
              expenses: expenses,
              confirmMode: 'expense'
            }])
          } else {
            // Chat.jsx does not write to Supabase directly. This callback goes
            // to App.js, where the rows are inserted into the `expenses` table.
            await onExpenseAdded(expenses)
            const rememberedReply = buildRememberedExpenseReply(expenses, rememberedCategories)
            setMessages(prev => [...prev, { type: 'bot', text: rememberedReply || reply || 'Saved expense.' }])
          }
        } else {
          setMessages(prev => [...prev, { type: 'bot', text: reply || 'I could not understand that expense. Include an item and amount.' }])
        }

      } else if (resolvedMode === 'income') {
        // INCOME MODE: Income uses the same Supabase `expenses` table, but is
        // identified by category `Income` and stored as a negative amount.
        let expenses = mediaTransactions.filter(transaction => transaction.transaction_type === 'income')
        let reply = mediaSummary
        // Re-run the extracted wording through the deterministic parser for
        // image income notes. This fixes cases where the vision model found
        // the amount but mislabeled a salary/bonus as an expense.
        if (submittedAttachment?.type === 'image' && userMsg) {
          const parsedMediaResponse = await axios.post(`${getApiBaseUrl()}/api/expenses/parse`, { text: userMsg, mode: 'income' }, { signal: controller.signal })
          if (parsedMediaResponse.data?.expenses?.length) {
            expenses = parsedMediaResponse.data.expenses
            reply = parsedMediaResponse.data.reply || reply
          }
        }
        if (expenses.length === 0) {
          const response = await axios.post(`${getApiBaseUrl()}/api/expenses/parse`, { text: userMsg, mode: 'income' }, { signal: controller.signal })
          expenses = response.data.expenses || []
          reply = response.data.reply
        }

        if (expenses && expenses.length > 0) {
          const incomeExpenses = expenses.map(exp => ({
            ...exp,
            category: 'Income',
            amount: -Math.abs(exp.amount),
            remarks: exp.remarks || `Income: ${exp.item}`
          }))
          if (submittedAttachment) {
            const reviewSummary = submittedAttachment.type === 'image' && reply
              ? `${reply} Please review before saving.`
              : buildMediaReviewSummary(submittedAttachment.type, incomeExpenses)
            const confirmationId = `media-confirmation-${messageId}`
            setPendingTransactions({ confirmationId, expenses: incomeExpenses, forceMode: 'media', mediaType: submittedAttachment.type, summary: reviewSummary })
            setMessages(prev => [...prev, {
              id: confirmationId,
              type: 'confirmation',
              text: reviewSummary,
              expenses: incomeExpenses,
              confirmMode: 'media'
            }])
            return
          }
          await onExpenseAdded(incomeExpenses)
          setMessages(prev => [...prev, { type: 'bot', text: reply || 'Saved income.' }])
        } else {
          setMessages(prev => [...prev, { type: 'bot', text: reply || 'I could not understand that income entry. Include a source and amount.' }])
        }

      } else if (resolvedMode === 'loan') {
        // LOAN MODE: Loans also use the `expenses` table with category `Loan`.
        // The amount sign and description distinguish lending, borrowing,
        // repayment, and receiving money back.
        let expenses = mediaTransactions.filter(transaction => transaction.transaction_type === 'loan')
        let reply = mediaSummary
        // The regular parser has explicit direction rules (borrowed = money
        // in, lent = money out), so use it to correct a vision model's loan
        // direction before saving an image-derived transaction.
        if (submittedAttachment?.type === 'image' && userMsg) {
          const parsedMediaResponse = await axios.post(`${getApiBaseUrl()}/api/expenses/parse`, { text: userMsg, mode: 'loan' }, { signal: controller.signal })
          if (parsedMediaResponse.data?.expenses?.length) {
            expenses = parsedMediaResponse.data.expenses
            reply = parsedMediaResponse.data.reply || reply
          }
        }
        if (expenses.length === 0) {
          const response = await axios.post(`${getApiBaseUrl()}/api/expenses/parse`, { text: userMsg, mode: 'loan' }, { signal: controller.signal })
          expenses = response.data.expenses || []
          reply = response.data.reply
        }

        if (expenses && expenses.length > 0) {
          // Try to extract person name
          const exp = expenses[0]
          const stopWords = ['i', 'me', 'my', 'to', 'from', 'for', 'on', 'in', 'at', 'the', 'a', 'an', 'send', 'sent', 'gave', 'given', 'lent', 'borrowed', 'took', 'paid', 'loan', 'transaction', 'transfer', 'money', 'cash', 'online', 'upi']
          let person = exp.paid_by || null

          if (!person) {
            const words = (exp.remarks || exp.item || '').split(' ')
            for (const word of words) {
              const cleanWord = word.replace(/[^a-zA-Z]/g, '')
              if (cleanWord.length > 2 && !stopWords.includes(cleanWord.toLowerCase())) {
                person = cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1).toLowerCase()
                break
              }
            }
          }

          const updatedExpenses = expenses.map(e => ({ ...e, paid_by: person, category: 'Loan' }))
          const needsConfirmation = updatedExpenses.some(exp => exp.needs_confirmation)

          if (needsConfirmation) {
            // If the backend cannot safely decide the loan direction, ask the
            // user to choose before creating a financial record.
            const confirmationId = `loan-confirmation-${messageId}`
            setPendingTransactions({ confirmationId, expenses: updatedExpenses, forceMode: 'loan' })
            setMessages(prev => [...prev, {
              id: confirmationId,
              type: 'confirmation',
              text: reply || (person ? `Transaction with ${person}. What type?` : 'What type of loan transaction?'),
              expenses: updatedExpenses,
              confirmMode: 'loan'
            }])
          } else if (submittedAttachment) {
            const reviewSummary = submittedAttachment.type === 'image' && reply
              ? `${reply} Please review before saving.`
              : buildMediaReviewSummary(submittedAttachment.type, updatedExpenses)
            const confirmationId = `media-confirmation-${messageId}`
            setPendingTransactions({ confirmationId, expenses: updatedExpenses, forceMode: 'media', mediaType: submittedAttachment.type, summary: reviewSummary })
            setMessages(prev => [...prev, {
              id: confirmationId,
              type: 'confirmation',
              text: reviewSummary,
              expenses: updatedExpenses,
              confirmMode: 'media'
            }])
            return
          } else {
            await onExpenseAdded(updatedExpenses)
            setMessages(prev => [...prev, { type: 'bot', text: reply || 'Saved loan transaction.' }])
          }
        } else {
          setMessages(prev => [...prev, { type: 'bot', text: reply || 'I could not understand that loan entry. Include the amount and person.' }])
        }
      }
    } catch (error) {
      if (axios.isCancel(error) || error.code === 'ERR_CANCELED') return
      const serverMessage = error.response?.data?.detail || error.response?.data?.reply
      const errorText = submissionOverride?.voice
        ? 'I missed that. Please say it again.'
        : serverMessage
          ? `Unable to answer right now: ${serverMessage}`
          : 'Unable to reach the finance assistant right now. Please try again.'
      setMessages(prev => [...prev, { type: 'bot', text: errorText }])
    } finally {
      finishProcessing()
    }
  }

  handleSubmitRef.current = handleSubmit

  useEffect(() => {
    if (!voiceAutoSubmit || !attachment || attachment.type !== 'audio' || loading) return

    voiceReplyStartIndexRef.current = messages.length
    voiceAwaitingReplyRef.current = true
    setVoiceAutoSubmit(false)
    handleSubmitRef.current?.(
      { preventDefault: () => {} },
      { text: '', attachment, voice: true },
    )
  }, [voiceAutoSubmit, attachment, loading, messages.length])

  useEffect(() => {
    if (!voiceSessionOpen || !voiceAwaitingReplyRef.current) return

    const newMessages = messages.slice(voiceReplyStartIndexRef.current)
    let response = null
    for (let index = newMessages.length - 1; index >= 0; index -= 1) {
      if (newMessages[index].type === 'bot' || newMessages[index].type === 'confirmation') {
        response = newMessages[index]
        break
      }
    }
    if (!response) {
      const transcriptMessage = [...newMessages].reverse().find(message => message.type === 'user' && message.text)
      if (transcriptMessage) setVoiceSessionText(transcriptMessage.text)
      return
    }

    const responseKey = response.id || `${voiceReplyStartIndexRef.current}-${response.type}-${response.text}`
    if (lastSpokenMessageRef.current === responseKey) return
    lastSpokenMessageRef.current = responseKey
    voiceAwaitingReplyRef.current = false

    const spokenText = String(response.text || '')
      .replace(/[*#`|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    setVoiceSessionText(spokenText || 'Done')

    if (!spokenText) {
      setVoiceSessionStatus('idle')
      return
    }

    const ttsController = new AbortController()
    voiceTtsAbortRef.current = ttsController
    setVoiceSessionStatus('processing')
    setVoiceSessionText('Preparing a natural voice response…')

    const continueConversation = () => {
      if (
        response.type === 'bot'
        && voiceSessionOpenRef.current
        && voiceContinueListeningRef.current
        && !voiceSessionPausedRef.current
      ) {
        setVoiceSessionText('Listening…')
        window.setTimeout(() => {
          if (voiceSessionOpenRef.current && voiceContinueListeningRef.current && !isRecordingRef.current) {
            startVoiceListeningRef.current?.()
          }
        }, 300)
      } else {
        setVoiceSessionStatus(voiceSessionPausedRef.current ? 'paused' : 'idle')
        setVoiceSessionText(response.type === 'confirmation'
          ? 'Review the transaction in chat before saving'
          : 'Tap the microphone to continue')
      }
    }

    const playNativeFallback = () => {
      if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') return false
      const utterance = new window.SpeechSynthesisUtterance(spokenText)
      const voices = window.speechSynthesis.getVoices()
      const preferredNames = ['Google UK English Female', 'Microsoft Aria Online', 'Samantha', 'Daniel']
      utterance.voice = preferredNames
        .map(name => voices.find(voice => voice.name.includes(name)))
        .find(Boolean) || voices.find(voice => /^en[-_]/i.test(voice.lang)) || null
      utterance.lang = utterance.voice?.lang || 'en-IN'
      utterance.rate = 1.03
      utterance.pitch = 1
      utterance.onstart = () => setVoiceSessionStatus('speaking')
      utterance.onend = continueConversation
      utterance.onerror = continueConversation
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
      return true
    }

    const playNeuralResponse = async () => {
      try {
        const audioResponse = await axios.post(
          `${getApiBaseUrl()}/api/expenses/voice/synthesize`,
          { text: spokenText },
          { responseType: 'arraybuffer', signal: ttsController.signal, timeout: 1800 },
        )
        if (!voiceSessionOpenRef.current || voiceSessionPausedRef.current || ttsController.signal.aborted) return

        const audioBlob = new Blob([audioResponse.data], { type: 'audio/wav' })
        const audioUrl = URL.createObjectURL(audioBlob)
        const audio = new Audio(audioUrl)
        voicePlaybackUrlRef.current = audioUrl
        voicePlaybackRef.current = audio
        audio.onplay = () => {
          setVoiceSessionStatus('speaking')
          setVoiceSessionText(spokenText)
        }
        audio.onended = () => {
          voicePlaybackRef.current = null
          if (voicePlaybackUrlRef.current === audioUrl) voicePlaybackUrlRef.current = null
          URL.revokeObjectURL(audioUrl)
          continueConversation()
        }
        audio.onerror = () => {
          voicePlaybackRef.current = null
          if (voicePlaybackUrlRef.current === audioUrl) voicePlaybackUrlRef.current = null
          URL.revokeObjectURL(audioUrl)
          if (!playNativeFallback()) continueConversation()
        }
        await audio.play()
      } catch (error) {
        if (axios.isCancel(error) || error.code === 'ERR_CANCELED') return
        if (!playNativeFallback()) continueConversation()
      } finally {
        if (voiceTtsAbortRef.current === ttsController) voiceTtsAbortRef.current = null
      }
    }

    playNeuralResponse()
  }, [messages, voiceSessionOpen])

  const clearChat = () => {
    setMessages([])
    setPendingIntent(null)
    setPendingTransactions(null)
    confirmedIntentRef.current = null
    localStorage.removeItem('pfm_messages')
  }

  const getConfirmationKey = (confirmation) => {
    if (confirmation?.id) return confirmation.id
    const signature = (confirmation?.expenses || [])
      .map(expense => `${expense.item || ''}:${expense.amount || ''}:${expense.paid_by || ''}`)
      .join('|')
    return `legacy-${confirmation?.confirmMode || 'confirmation'}-${signature}`
  }

  const finishConfirmation = (confirmation, resolution) => {
    const confirmationKey = getConfirmationKey(confirmation)
    setMessages(prev => prev.map(message => (
      message === confirmation || getConfirmationKey(message) === confirmationKey
        ? { ...message, resolved: true, resolution }
        : message
    )))
    setPendingTransactions(current => {
      if (!current) return current
      const currentKey = current.confirmationId || current.confirmationKey
      return currentKey === confirmationKey ? null : current
    })
  }

  // Save the transactions embedded in the confirmation that was clicked. This
  // keeps old cards reliable after a reload and prevents one card from saving a
  // newer card's in-memory transaction.
  const handleConfirmSave = async (category, confirmation) => {
    const confirmationKey = getConfirmationKey(confirmation)
    const sourceExpenses = confirmation?.expenses || []
    if (confirmation?.resolved || sourceExpenses.length === 0 || confirmationInFlightRef.current.has(confirmationKey)) return
    confirmationInFlightRef.current.add(confirmationKey)

    try {
      const updatedExpenses = sourceExpenses.map(exp => ({
        ...exp,
        category,
        needs_confirmation: false,
      }))

      await onExpenseAdded(updatedExpenses)
      updatedExpenses.forEach(expense => {
        rememberCategoryChoice(user?.id, expense.item, category)
      })
      const learnedItems = [...new Set(updatedExpenses.map(expense => expense.item).filter(Boolean))]
      const learnedLabel = learnedItems.length === 1 ? learnedItems[0] : `${learnedItems.length} items`
      finishConfirmation(confirmation, `Saved to ${category}`)
      setMessages(prev => [...prev, {
        type: 'bot',
        text: `✓ Saved to ${category}. I'll remember ${learnedLabel} as ${category}.`,
      }])
    } catch (error) {
      setMessages(prev => [...prev, { type: 'bot', text: 'Error saving transaction' }])
    } finally {
      confirmationInFlightRef.current.delete(confirmationKey)
    }
  }

  const handleMediaTransactionChange = (confirmation, index, field, value) => {
    const confirmationKey = getConfirmationKey(confirmation)
    setPendingTransactions(current => {
      const currentKey = current?.confirmationId || current?.confirmationKey
      const source = current?.forceMode === 'media' && currentKey === confirmationKey
        ? current
        : {
            confirmationId: confirmation?.id,
            confirmationKey,
            expenses: confirmation?.expenses || [],
            forceMode: 'media',
          }
      return {
        ...source,
        expenses: source.expenses.map((expense, expenseIndex) => (
          expenseIndex === index ? { ...expense, [field]: value } : expense
        ))
      }
    })
  }

  const handleConfirmMediaSave = async (confirmation) => {
    const confirmationKey = getConfirmationKey(confirmation)
    const pendingKey = pendingTransactions?.confirmationId || pendingTransactions?.confirmationKey
    const transactions = pendingKey === confirmationKey
      ? pendingTransactions.expenses
      : (confirmation?.expenses || [])
    if (confirmation?.resolved || !transactions.length || confirmationInFlightRef.current.has(confirmationKey)) return
    if (transactions.some(transaction => !String(transaction.item || '').trim() || !Number(transaction.amount))) {
      setMessages(prev => [...prev, { type: 'bot', text: 'Each transaction needs a clear item and amount before saving.' }])
      return
    }
    confirmationInFlightRef.current.add(confirmationKey)

    try {
      await onExpenseAdded(transactions.map(transaction => ({
        ...transaction,
        item: String(transaction.item).trim(),
        remarks: String(transaction.remarks || transaction.item).trim(),
        needs_confirmation: false,
      })))
      finishConfirmation(confirmation, `Saved ${transactions.length} reviewed transaction${transactions.length === 1 ? '' : 's'}`)
      setMessages(prev => [...prev, {
        type: 'bot',
        text: `Saved ${transactions.length} reviewed transaction${transactions.length === 1 ? '' : 's'}.`
      }])
    } catch (error) {
      setMessages(prev => [...prev, { type: 'bot', text: 'Unable to save the reviewed transactions.' }])
    } finally {
      confirmationInFlightRef.current.delete(confirmationKey)
    }
  }

  // Handle confirmation with specific type (for loan transactions)
  const handleConfirmSaveWithType = async (confirmation, category, itemType, amount) => {
    const confirmationKey = getConfirmationKey(confirmation)
    const exp = confirmation?.expenses?.[0]
    if (confirmation?.resolved || !exp || confirmationInFlightRef.current.has(confirmationKey)) return
    confirmationInFlightRef.current.add(confirmationKey)

    try {
      let typeLabel, remarks
      if (itemType === 'received from') {
        typeLabel = 'RECEIVED'
        remarks = `Received from ${exp.paid_by}`
      } else if (itemType === 'lent to') {
        typeLabel = 'LENT'
        remarks = `Lent to ${exp.paid_by}`
      } else if (itemType === 'borrowed from') {
        typeLabel = 'BORROWED'
        remarks = `Borrowed from ${exp.paid_by}`
      } else if (itemType === 'paid to') {
        typeLabel = 'PAID'
        remarks = `Paid to ${exp.paid_by}`
      } else {
        typeLabel = itemType.toUpperCase()
        remarks = `${itemType} ${exp.paid_by}`
      }

      const updatedExpense = {
        ...exp,
        category: category,
        item: itemType,
        amount: amount,
        remarks: remarks
      }

      await onExpenseAdded([updatedExpense])
      finishConfirmation(confirmation, `Saved as ${typeLabel}${exp.paid_by ? ` (${exp.paid_by})` : ''}`)
      setMessages(prev => [...prev, { type: 'bot', text: `✓ Saved as ${typeLabel}${exp.paid_by ? ` (${exp.paid_by})` : ''}` }])
    } catch (error) {
      setMessages(prev => [...prev, { type: 'bot', text: 'Error saving transaction' }])
    } finally {
      confirmationInFlightRef.current.delete(confirmationKey)
    }
  }

  const handleCancelPending = (confirmation) => {
    if (!confirmation || confirmation.resolved) return
    const confirmationKey = getConfirmationKey(confirmation)
    setPendingTransactions(current => {
      if (!current) return current
      const currentKey = current.confirmationId || current.confirmationKey
      return currentKey === confirmationKey ? null : current
    })
    setPendingIntent(current => (
      confirmation.confirmMode === 'intent' && current?.confirmationId === confirmation.id
        ? null
        : current
    ))
    finishConfirmation(confirmation, 'Cancelled — nothing was saved')
    setMessages(prev => [...prev, { type: 'bot', text: 'No problem—I did not save anything.' }])
  }

  const handleIntentChoice = (mode, confirmation) => {
    const confirmationKey = getConfirmationKey(confirmation)
    if (confirmation?.resolved || confirmationInFlightRef.current.has(confirmationKey)) return
    const targetMessage = messagesRef.current.find(message => message.id === confirmation.targetMessageId)
    const text = pendingIntent?.messageId === confirmation.targetMessageId
      ? pendingIntent.text
      : targetMessage?.text
    if (!text || !confirmation.targetMessageId) return
    confirmationInFlightRef.current.add(confirmationKey)
    setInputMode(mode)
    setPendingIntent(current => current?.messageId === confirmation.targetMessageId ? null : current)
    setMessages(prev => prev.filter(message => message !== confirmation && message.id !== confirmation.id))
    window.setTimeout(() => {
      handleSubmitRef.current?.(
        { preventDefault: () => {} },
        {
          text,
          confirmedMode: mode,
          existingMessageId: confirmation.targetMessageId,
        },
      )
      confirmationInFlightRef.current.delete(confirmationKey)
    }, 0)
  }

  // Render confirmation buttons based on mode
  const renderConfirmation = (msg) => {
    if (msg.resolved) {
      return <p className="mt-3 text-xs font-semibold text-gray-600 dark:text-gray-300">{msg.resolution || 'This confirmation has been resolved.'}</p>
    }

    if (msg.confirmMode === 'intent') {
      const labels = {
        expense: 'This was an expense',
        income: 'This was income or a gift',
        loan: 'This was a loan or repayment',
      }
      const isActiveConfirmation = Boolean(
        msg.targetMessageId && (
          pendingIntent?.messageId === msg.targetMessageId
          || messagesRef.current.some(message => message.id === msg.targetMessageId && message.type === 'user')
        )
      )
      const candidates = msg.candidates || ['expense', 'income', 'loan']
      if (!isActiveConfirmation) {
        return <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">This confirmation is no longer active.</p>
      }
      return (
        <div className="flex flex-col gap-2 mt-3">
          <p className="text-xs text-gray-600 dark:text-gray-300">I won’t save anything until you choose.</p>
          <div className="flex flex-wrap gap-2">
            {candidates.map(mode => (
              <button key={mode} type="button" onClick={() => handleIntentChoice(mode, msg)} className="px-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-paper-300 text-gray-800 dark:text-gray-100 border border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                {labels[mode]}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => handleCancelPending(msg)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-paper-300 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-paper-400 transition-colors self-start">
            Cancel
          </button>
        </div>
      )
    }

    if (msg.confirmMode === 'media') {
      const confirmationKey = getConfirmationKey(msg)
      const pendingKey = pendingTransactions?.confirmationId || pendingTransactions?.confirmationKey
      const reviewTransactions = pendingTransactions?.forceMode === 'media' && pendingKey === confirmationKey
        ? pendingTransactions.expenses
        : (msg.expenses || [])

      return (
        <div className="space-y-3 mt-3">
          <div className="space-y-2">
            {reviewTransactions.map((transaction, index) => (
              <div key={`${transaction.item}-${index}`} className="grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-2 p-3 rounded-xl bg-white/70 dark:bg-black/10 border border-amber-200/70 dark:border-amber-800/30">
                <div className="min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <input
                      value={transaction.item || ''}
                      onChange={(event) => handleMediaTransactionChange(msg, index, 'item', event.target.value)}
                      aria-label={`Item ${index + 1}`}
                      className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-gray-800 dark:text-gray-100 outline-none border-b border-transparent focus:border-amber-400"
                    />
                    <span className="text-sm font-bold text-gray-800 dark:text-gray-100 whitespace-nowrap">Rs.{Math.abs(Number(transaction.amount) || 0).toLocaleString()}</span>
                  </div>
                  <input
                    value={transaction.remarks || ''}
                    onChange={(event) => handleMediaTransactionChange(msg, index, 'remarks', event.target.value)}
                    aria-label={`Remarks ${index + 1}`}
                    placeholder="Optional remarks"
                    className="w-full bg-transparent text-xs text-gray-600 dark:text-gray-300 outline-none border-b border-transparent focus:border-amber-400"
                  />
                </div>
                <select
                  value={transaction.category || 'Other'}
                  onChange={(event) => handleMediaTransactionChange(msg, index, 'category', event.target.value)}
                  aria-label={`Category ${index + 1}`}
                  className="w-full px-2.5 py-2 text-xs font-medium rounded-lg border border-gray-200 dark:border-paper-400 bg-white dark:bg-paper-300 text-gray-700 dark:text-gray-100 outline-none"
                >
                  {REVIEW_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleConfirmMediaSave(msg)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-black dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity"
            >
              Save reviewed {reviewTransactions.length === 1 ? 'transaction' : 'transactions'}
            </button>
            <button
              type="button"
              onClick={() => handleCancelPending(msg)}
              className="px-4 py-2 text-xs font-medium rounded-xl bg-gray-100 dark:bg-paper-300 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-paper-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )
    }

    if (msg.confirmMode === 'loan' && msg.expenses?.[0]) {
      const exp = msg.expenses[0]
      const person = exp.paid_by
      const item = (exp.item || '').toLowerCase()
      const remarks = (exp.remarks || '').toLowerCase()

      const isGaveOrTo = item.includes('i gave') || item.includes('to person') || remarks.includes('i gave')
      const isFrom = item.includes('from') || remarks.includes(' from ')

      let buttons = []

      if (isGaveOrTo && !isFrom) {
        buttons = [
          { label: `I lent to ${person || '?'}`, tag: 'LENT', onClick: () => handleConfirmSaveWithType(msg, 'Loan', 'lent to', Math.abs(exp.amount)), bg: 'bg-green-100 text-green-700 hover:bg-green-200' },
          { label: `I paid back ${person || '?'}`, tag: 'PAID', onClick: () => handleConfirmSaveWithType(msg, 'Loan', 'paid to', Math.abs(exp.amount)), bg: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
        ]
      } else if (isFrom) {
        buttons = [
          { label: `${person || '?'} paid back`, tag: 'RECEIVED', onClick: () => handleConfirmSaveWithType(msg, 'Loan', 'received from', -Math.abs(exp.amount)), bg: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
          { label: `I borrowed from ${person || '?'}`, tag: 'BORROWED', onClick: () => handleConfirmSaveWithType(msg, 'Loan', 'borrowed from', -Math.abs(exp.amount)), bg: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
        ]
      } else {
        buttons = [
          { label: `${person || '?'} paid back`, tag: 'RECEIVED', onClick: () => handleConfirmSaveWithType(msg, 'Loan', 'received from', -Math.abs(exp.amount)), bg: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
          { label: `I gave to ${person || '?'}`, tag: 'LENT', onClick: () => handleConfirmSaveWithType(msg, 'Loan', 'lent to', Math.abs(exp.amount)), bg: 'bg-green-100 text-green-700 hover:bg-green-200' },
          { label: `I took from ${person || '?'}`, tag: 'BORROWED', onClick: () => handleConfirmSaveWithType(msg, 'Loan', 'borrowed from', -Math.abs(exp.amount)), bg: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
          { label: `I paid back ${person || '?'}`, tag: 'PAID', onClick: () => handleConfirmSaveWithType(msg, 'Loan', 'paid to', Math.abs(exp.amount)), bg: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
        ]
      }

      return (
        <div className="flex flex-col gap-2 mt-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">What type of transaction?</p>
          <div className="flex flex-wrap gap-2">
            {buttons.map((btn, i) => (
              <button key={i} type="button" onClick={btn.onClick} className={`px-3 py-2 text-xs font-medium rounded-xl transition-colors ${btn.bg}`}>
                {btn.label} → <span className="font-bold">{btn.tag}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => handleCancelPending(msg)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-paper-300 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-paper-400 transition-colors self-start">
            Cancel
          </button>
        </div>
      )
    }

    // Expense mode confirmation — pick a category
    return (
      <div className="flex flex-col gap-2 mt-3">
        <div className="flex flex-wrap gap-2">
          {['Food', 'Transport', 'Utilities', 'Entertainment', 'Health', 'Education', 'Shopping', 'Groceries', 'Investment', 'Other'].map(cat => (
            <button key={cat} type="button" onClick={() => handleConfirmSave(cat, msg)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-paper-300 text-gray-700 dark:text-gray-200 rounded-full hover:bg-gray-200 dark:hover:bg-paper-400 transition-colors">
              {cat}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => handleCancelPending(msg)} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-paper-300 text-gray-600 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-paper-400 transition-colors self-start">
          Cancel
        </button>
      </div>
    )
  }

  // Mode badge for user messages
  const getModeBadge = (mode) => {
    const modeConf = INPUT_MODES.find(m => m.id === mode)
    if (!modeConf) return null
    const Icon = modeConf.icon
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider opacity-60 mb-1">
        <Icon size={10} />
        {modeConf.label}
      </span>
    )
  }

  return (
    <div className="flex flex-col h-full relative" style={{ display: isVisible ? 'flex' : 'none' }}>

      {/* Messages Area */}
      {showMessagesArea && (
        <>
          {messages.length === 0 ? (
            <div className={`flex-1 flex items-center justify-center px-4 lg:px-8 antialiased lg:pb-40 ${isComposerFocused ? 'pb-20' : 'pb-28 sm:pb-36'}`}>
              <div className={`text-center px-2 max-w-sm mx-auto transition-opacity ${isComposerFocused ? 'opacity-0 pointer-events-none lg:opacity-100' : 'opacity-100'}`}>
                <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-[2rem] bg-gray-50 dark:bg-paper-200 shadow-sm border border-gray-100 dark:border-paper-300 text-4xl sm:text-5xl mb-4 sm:mb-5">
                  {currentModeConfig.emoji}
                </div>
                <p className="text-base sm:text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1.5 sm:mb-2 tracking-tight">{currentModeConfig.desc}</p>
                <p className="text-[14px] sm:text-[15px] text-gray-500 dark:text-gray-400 leading-relaxed font-medium">{currentModeConfig.hint}</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto scrollbar-hide px-4 lg:px-8 py-4 pb-72 lg:pb-72">
              <div className="max-w-7xl mx-auto space-y-3 pt-6">
                {messages.map((msg, i) => (
                  <div key={msg.id || i} className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.type === 'confirmation' ? (
                      <div className="max-w-[90%] lg:max-w-[80%] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-4 py-3 rounded-2xl">
                        <p className="text-sm text-amber-800 dark:text-amber-200 mb-1">{msg.text}</p>
                        {msg.confirmMode !== 'media' && msg.expenses && msg.expenses.map((exp, j) => (
                          <p key={j} className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                            Rs.{Math.abs(exp.amount).toLocaleString()} → {exp.remarks || exp.item}
                          </p>
                        ))}
                        {renderConfirmation(msg)}
                      </div>
                    ) : (
                      <div className={`${msg.type === 'user' ? 'max-w-[80%] lg:max-w-[60%] px-4 py-2.5 bg-black dark:bg-white text-white dark:text-black text-sm whitespace-pre-wrap' : 'max-w-[94%] lg:max-w-[76%] px-5 sm:px-6 py-4 sm:py-5 bg-gray-100 dark:bg-paper-200 text-gray-900 dark:text-gray-100'} rounded-2xl`}>
                        {msg.type === 'user' && msg.mode && msg.mode !== 'chat' && getModeBadge(msg.mode)}
                        {msg.type === 'user' && msg.attachment && (
                          <div className="mb-2">
                            {msg.attachment.type === 'image' && msg.attachment.previewUrl ? (
                              <button
                                type="button"
                                onClick={() => setPreviewImage({ src: msg.attachment.previewUrl, name: msg.attachment.name || 'Attached image' })}
                                aria-label="Preview attached image"
                                title="Click to preview image"
                                className="block max-w-full rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70"
                              >
                                <img
                                  src={msg.attachment.previewUrl}
                                  alt={msg.attachment.name || 'User attachment'}
                                  className="max-h-52 max-w-full cursor-zoom-in rounded-xl object-contain bg-black/5 dark:bg-black/10"
                                />
                              </button>
                            ) : (
                              <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-70">
                                {msg.attachment.type === 'image' ? <ImageIcon size={13} /> : <Mic size={13} />}
                                <span>
                                  {msg.attachment.type === 'image'
                                    ? 'Image attached'
                                    : `Voice message${msg.attachment.duration ? ` · ${formatDuration(msg.attachment.duration)}` : ''}`}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        {msg.type === 'bot' ? renderAssistantMessage(msg.text) : (msg.text ? <div className={msg.fromAudio ? 'italic' : ''}>{msg.text}</div> : null)}
                      </div>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 dark:bg-paper-200 px-4 py-3 rounded-2xl">
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Premium Input Area ─── */}
      <div className={`fixed lg:bottom-0 left-0 right-0 lg:left-64 z-30 ${isComposerFocused ? 'bottom-0' : 'bottom-20'}`} style={{ transform: 'translateZ(0)' }}>
        <div className="absolute inset-x-0 bottom-full h-16 sm:h-24 bg-gradient-to-t from-paper-50 dark:from-paper-50 to-transparent pointer-events-none" />
        <div className="bg-paper-50/95 dark:bg-paper-50/95 backdrop-blur-md px-3 sm:px-6 lg:px-8 pb-3 lg:pb-6 pt-2">
          <div className="max-w-3xl mx-auto relative" style={{ zIndex: 1 }}>

            {/* ── MOBILE: Mode and composer controls ── */}
            {isComposerFocused ? (
              <div className="mb-2 flex items-center px-1 lg:hidden">
                <div className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold shadow-sm ${autoIntentEnabled
                  ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
                  : 'border-gray-200 bg-white text-gray-700 dark:border-paper-300 dark:bg-paper-200 dark:text-gray-200'
                }`}>
                  {autoIntentEnabled ? <span className="h-2 w-2 rounded-full bg-blue-500" /> : <CurrentModeIcon size={13} />}
                  {autoIntentEnabled ? 'Intent on' : `${currentModeConfig.label} mode`}
                </div>
              </div>
            ) : (
            <div className="lg:hidden mb-2.5 rounded-2xl border border-gray-200/70 dark:border-paper-300/50 bg-white/90 dark:bg-paper-100/95 p-1.5 shadow-[0_4px_18px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_18px_rgba(0,0,0,0.22)]">
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-gray-100/90 p-1 dark:bg-paper-200/80" aria-label="Transaction type">
                  {INPUT_MODES.map(mode => {
                    const Icon = mode.icon
                    const isActive = inputMode === mode.id
                    return (
                      <button
                        key={mode.id}
                        onClick={() => setInputMode(mode.id)}
                        aria-pressed={isActive}
                        className={`min-w-0 flex h-11 items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-bold transition-all duration-200 active:scale-[0.97] ${isActive
                          ? inputMode === 'chat' ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5 dark:bg-paper-300 dark:text-white dark:ring-white/5'
                            : inputMode === 'expense' ? 'bg-white text-red-700 shadow-sm ring-1 ring-black/5 dark:bg-paper-300 dark:text-red-400 dark:ring-white/5'
                              : inputMode === 'income' ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-black/5 dark:bg-paper-300 dark:text-emerald-400 dark:ring-white/5'
                                : 'bg-white text-amber-700 shadow-sm ring-1 ring-black/5 dark:bg-paper-300 dark:text-amber-400 dark:ring-white/5'
                          : 'text-gray-500 hover:bg-white/60 dark:text-gray-400 dark:hover:bg-paper-300/60'
                          }`}
                      >
                        <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                        <span className="truncate">{mode.label}</span>
                      </button>
                    )
                  })}
              </div>

              <div className="mt-1.5 flex items-center justify-between border-t border-gray-200/70 px-1.5 pt-1.5 dark:border-paper-300/50">
                <button
                  type="button"
                  onClick={() => setAutoIntentEnabled(enabled => !enabled)}
                  role="switch"
                  aria-checked={autoIntentEnabled}
                  className="flex min-h-8 items-center gap-2 rounded-lg px-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-paper-200"
                >
                  <span className={`relative block h-[18px] w-8 rounded-full transition-colors duration-200 ${autoIntentEnabled ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-300 dark:bg-paper-400'}`}>
                    <span className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${autoIntentEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </span>
                  <span>Intent</span>
                  <span className={autoIntentEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}>{autoIntentEnabled ? 'On' : 'Off'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 active:scale-95 dark:text-gray-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  title="Clear conversation"
                >
                  <Trash2 size={14} strokeWidth={2} />
                  <span>Clear</span>
                </button>
              </div>
            </div>
            )}

            {/* ── DESKTOP: Full Tab Bar ── */}
            <div className="hidden lg:flex justify-center mb-4 w-full">
              <div className="flex items-center justify-center bg-gray-100/90 dark:bg-paper-200/80 backdrop-blur-sm rounded-[1.25rem] p-1 sm:p-1.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] border border-gray-200/50 dark:border-paper-300/40 w-full max-w-[calc(100%-16px)] sm:w-fit min-w-[550px] overflow-hidden">

                {/* Tabs row — relative so pill can be positioned inside */}
                <div className="relative flex items-center justify-between w-full min-w-0">
                  {/* Sliding pill indicator */}
                  <div
                    className="absolute top-0 bottom-0 rounded-xl bg-white dark:bg-paper-300 shadow-[0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] border-t border-white/50 dark:border-white/5 pointer-events-none z-0"
                    style={{
                      left: indicatorStyle.left,
                      width: indicatorStyle.width,
                      transition: 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                    }}
                  />

                  {INPUT_MODES.map(mode => {
                    const Icon = mode.icon
                    const isActive = inputMode === mode.id
                    return (
                      <button
                        key={mode.id}
                        ref={el => tabRefs.current[mode.id] = el}
                        onClick={() => setInputMode(mode.id)}
                        className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-[13.5px] font-bold tracking-wide transition-all duration-200 ${isActive
                          ? inputMode === 'chat' ? 'text-gray-900 dark:text-white scale-[1.02]'
                            : inputMode === 'expense' ? 'text-red-700 dark:text-red-400 scale-[1.02]'
                              : inputMode === 'income' ? 'text-emerald-800 dark:text-emerald-400 scale-[1.02]'
                                : 'text-amber-800 dark:text-amber-400 scale-[1.02]'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200/40 dark:hover:bg-paper-300/40'
                          }`}
                      >
                        <Icon className="w-3.5 h-3.5 sm:w-[16px] sm:h-[16px] flex-shrink-0" strokeWidth={isActive ? 2.5 : 2} />
                        <span className="truncate">{mode.label}</span>
                      </button>
                    )
                  })}

                  {/* Divider inside the pill area */}
                  <div className="w-[1px] h-5 sm:h-7 bg-gray-300/80 dark:bg-paper-300/80 mx-0.5 sm:mx-2 flex-shrink-0 z-10 relative" />

                  {/* Intent detection */}
                  <button
                    type="button"
                    onClick={() => setAutoIntentEnabled(enabled => !enabled)}
                    role="switch"
                    aria-checked={autoIntentEnabled}
                    title="Intent detection: automatically choose Chat, Expense, Income, or Loan"
                    className="relative z-10 flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 transition-all duration-200 active:scale-95 flex-shrink-0 font-semibold text-[12px]"
                  >
                    <span>Intent</span>
                    <span className={`relative block w-8 h-[18px] rounded-full transition-colors duration-200 ${autoIntentEnabled ? 'bg-blue-600 dark:bg-blue-500' : 'bg-gray-300 dark:bg-paper-400'}`}>
                      <span className={`absolute left-0.5 top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${autoIntentEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
                    </span>
                  </button>

                  <div className="w-[1px] h-5 sm:h-7 bg-gray-300/80 dark:bg-paper-300/80 mx-0.5 sm:mx-2 flex-shrink-0 z-10 relative" />

                  {/* Delete Chat */}
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="relative z-10 flex items-center justify-center gap-1 sm:gap-2 px-1.5 sm:px-4 py-2 sm:py-3 rounded-xl text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all duration-200 active:scale-95 flex-shrink-0 font-bold text-[10px] sm:text-[13.5px]"
                    title="Delete Chat"
                  >
                    <Trash2 className="w-3.5 h-3.5 sm:w-[16px] sm:h-[16px] flex-shrink-0" strokeWidth={2} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ── Input Card ── */}
            <div className={`relative bg-white dark:bg-paper-100 rounded-3xl border ${currentStyle.border} shadow-[0_4px_20px_rgba(0,0,0,0.06),0_8px_32px_-8px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3),0_8px_32px_-8px_rgba(0,0,0,0.4)] transition-all duration-300 ${currentStyle.focusRing} overflow-visible`}>
              {attachment && (
                <div className="flex items-center gap-3 mx-3 mt-3 p-2.5 rounded-2xl bg-gray-50 dark:bg-paper-200 border border-gray-200/70 dark:border-paper-300/70">
                  {attachment.type === 'image' ? (
                    <img
                      src={attachment.previewUrl}
                      alt="Selected attachment"
                      className="w-12 h-12 rounded-xl object-cover border border-gray-200 dark:border-paper-400"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                      <Mic size={17} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
                      {attachment.type === 'image' ? attachment.name : `Voice recording · ${formatDuration(attachment.duration)}`}
                    </div>
                    {attachment.type === 'image' ? (
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Ready to analyze</div>
                    ) : (
                      <audio controls preload="metadata" src={attachment.previewUrl} className="h-7 w-full max-w-[240px] mt-1" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => replaceAttachment(null)}
                    aria-label="Remove attachment"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-100 hover:bg-gray-200 dark:hover:bg-paper-300 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex items-center gap-3 px-4 py-3 sm:p-4">
                <div className="relative flex-shrink-0" ref={attachmentMenuRef}>
                  <button
                    type="button"
                    onClick={() => setAttachmentMenuOpen(open => !open)}
                    disabled={isRecording}
                    aria-label="Add attachment"
                    aria-expanded={attachmentMenuOpen}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-paper-200 disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:focus-visible:ring-white/20 transition-colors"
                  >
                    <Plus size={21} strokeWidth={1.8} />
                  </button>

                  {attachmentMenuOpen && (
                    <div className="absolute left-0 bottom-full mb-3 w-64 p-1.5 rounded-2xl bg-white dark:bg-paper-200 border border-gray-200 dark:border-paper-300 shadow-xl z-[70] animate-fade-in">
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-paper-300 transition-colors"
                      >
                        <span className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                          <ImageIcon size={18} />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Add photo</span>
                          <span className="block text-[11px] text-gray-500 dark:text-gray-400">JPG or PNG · up to 5 MB · or paste</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setAttachmentMenuOpen(false)
                          startAudioRecording()
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-gray-50 dark:hover:bg-paper-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <span className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                          <Mic size={18} />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Record audio</span>
                          <span className="block text-[11px] text-gray-500 dark:text-gray-400">Attach a voice message</span>
                        </span>
                      </button>
                    </div>
                  )}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={handleImageSelected}
                    className="hidden"
                  />
                </div>

                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={handleImagePaste}
                  onFocus={() => updateComposerFocus(true)}
                  onBlur={() => {
                    window.setTimeout(() => {
                      if (document.activeElement !== inputRef.current) updateComposerFocus(false)
                    }, 100)
                  }}
                  placeholder={isRecording ? 'Listening…' : currentModeConfig.placeholder}
                  className="flex-1 bg-transparent text-[15px] sm:text-[16px] leading-relaxed text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none min-w-0"
                  disabled={isRecording}
                />

                {isRecording && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-red-500 tabular-nums">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    {formatDuration(recordingSeconds)}
                  </div>
                )}

                {loading ? (
                  <button
                    type="button"
                    onClick={stopProcessing}
                    aria-label="Stop response"
                    title="Stop response"
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-gray-900 dark:bg-white text-white dark:text-black shadow-md hover:scale-105 active:scale-90 transition-transform"
                  >
                    <Square size={13} fill="currentColor" />
                  </button>
                ) : isRecording ? (
                  <button
                    type="button"
                    onClick={stopAudioRecording}
                    aria-label="Stop recording"
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-red-500 text-white hover:bg-red-600 shadow-md active:scale-90 transition-all"
                  >
                    <Square size={15} fill="currentColor" />
                  </button>
                ) : !input.trim() && !attachment ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (voiceSessionOpen && (voiceSessionStatus === 'speaking' || voiceSessionStatus === 'processing')) {
                        interruptVoiceAndListen()
                      } else if (voiceSessionOpen) {
                        startVoiceListeningRef.current?.()
                      } else {
                        openVoiceSession()
                      }
                    }}
                    aria-label={voiceSessionOpen ? 'Interrupt and speak' : 'Start voice conversation'}
                    title={voiceSessionOpen ? 'Interrupt and speak' : 'Start voice conversation'}
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-paper-200 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-paper-300 active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/10 dark:focus-visible:ring-white/20 transition-all"
                  >
                    <AudioLines size={19} strokeWidth={2} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    aria-label="Send message"
                    className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${currentStyle.sendBg} scale-100 shadow-md active:scale-90`}
                  >
                    <Send size={18} strokeWidth={2} className="ml-0.5" />
                  </button>
                )}
              </form>
            </div>

          </div>
        </div>
      </div>

      {voiceSessionOpen && (
        <div className="fixed bottom-[13rem] lg:bottom-48 left-0 right-0 lg:left-64 z-[80] px-3 pointer-events-none animate-fade-in">
          <h2 className="sr-only">Voice conversation</h2>
          <div className="pointer-events-auto mx-auto w-full max-w-sm flex items-center gap-3 rounded-[1.4rem] border border-gray-200/80 dark:border-white/10 bg-white/95 dark:bg-paper-100/95 backdrop-blur-xl p-2.5 shadow-[0_16px_48px_rgba(0,0,0,0.16)] dark:shadow-[0_18px_56px_rgba(0,0,0,0.5)]">
            <button
              type="button"
              onClick={() => {
                if (voiceSessionStatus === 'speaking' || voiceSessionStatus === 'processing') interruptVoiceAndListen()
                else if (voiceSessionStatus === 'paused') toggleVoicePause()
                else if (voiceSessionStatus === 'idle') startVoiceListeningRef.current?.()
              }}
              aria-label={voiceSessionStatus === 'speaking' || voiceSessionStatus === 'processing' ? 'Interrupt and speak' : voiceSessionStatus === 'paused' ? 'Resume conversation' : 'Voice conversation control'}
              className="relative w-14 h-14 rounded-full flex-shrink-0 flex items-center justify-center shadow-[0_8px_24px_rgba(37,99,235,0.28)] active:scale-95 transition-transform overflow-hidden"
            >
              <span className={`absolute inset-0 bg-[radial-gradient(circle_at_35%_25%,#ffffff_0%,#bfdbfe_22%,#3b82f6_58%,#1d4ed8_100%)] ${voiceSessionStatus === 'listening' ? 'animate-pulse' : ''}`} />
              <span className={`absolute inset-1.5 rounded-full border border-white/40 ${voiceSessionStatus === 'processing' ? 'animate-spin' : ''}`} style={{ borderRightColor: 'transparent', animationDuration: '1.4s' }} />
              <span className="relative z-10 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
                {voiceSessionStatus === 'paused'
                  ? <Play size={16} fill="currentColor" />
                  : voiceSessionStatus === 'idle'
                    ? <Mic size={17} />
                    : voiceSessionStatus === 'speaking'
                      ? <Mic size={17} />
                      : <AudioLines size={17} />}
              </span>
            </button>

            <div className="min-w-0 flex-1 px-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
                {voiceSessionStatus === 'listening' && 'Listening'}
                {voiceSessionStatus === 'processing' && 'Responding'}
                {voiceSessionStatus === 'speaking' && 'Speaking'}
                {voiceSessionStatus === 'idle' && 'Ready'}
                {voiceSessionStatus === 'paused' && 'Paused'}
              </p>
              {voiceSessionStatus === 'idle' && !voiceContinueListeningRef.current && voiceSessionText && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">{voiceSessionText}</p>
              )}
            </div>

            <button
              type="button"
              onClick={closeVoiceSession}
              aria-label="Close voice conversation"
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 active:scale-90 transition-all"
            >
              <X size={17} />
            </button>
          </div>
        </div>
      )}

      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4 sm:p-8 backdrop-blur-sm animate-fade-in"
        >
          <div className="relative flex max-h-full max-w-6xl flex-col items-center" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              aria-label="Close image preview"
              className="absolute -right-2 -top-12 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <X size={22} />
            </button>
            <img
              src={previewImage.src}
              alt={previewImage.name}
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
            />
            <p className="mt-3 max-w-full truncate text-sm font-medium text-white/80">{previewImage.name}</p>
          </div>
        </div>
      )}

      <DeleteConfirmationModal
        isOpen={showDeleteConfirm}
        title="Delete chat?"
        itemName="all messages in this chat"
        description="This will clear your local chat history. It cannot be undone."
        onConfirm={() => {
          onClearChat?.()
          setShowDeleteConfirm(false)
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
