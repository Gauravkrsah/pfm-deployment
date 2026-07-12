import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const padDatePart = (value) => String(value).padStart(2, '0')

const toDateKey = (date) => (
    `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
)

const parseDateKey = (dateKey) => {
    if (!dateKey) return null

    const [year, month, day] = dateKey.split('-').map(Number)
    if (!year || !month || !day) return null

    return new Date(year, month - 1, day)
}

const valueToDateKey = (value) => {
    if (!value) return ''
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.slice(0, 10)
    }

    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? '' : toDateKey(date)
}

const formatSelectedDate = (dateKey) => {
    const date = parseDateKey(dateKey)
    if (!date) return 'Select date'

    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    })
}

const getCalendarDays = (visibleMonth) => {
    const year = visibleMonth.getFullYear()
    const month = visibleMonth.getMonth()
    const firstGridDate = new Date(year, month, 1 - new Date(year, month, 1).getDay())

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(firstGridDate)
        date.setDate(firstGridDate.getDate() + index)
        return date
    })
}

export const getDateRange = (rangeType, customStart, customEnd) => {
    const end = new Date()
    const start = new Date()
    end.setHours(23, 59, 59, 999)
    start.setHours(0, 0, 0, 0)

    switch (rangeType) {
        case '7':
            start.setDate(end.getDate() - 6)
            break
        case '30':
            start.setDate(end.getDate() - 29)
            break
        case '90':
            start.setDate(end.getDate() - 89)
            break
        case '365':
            start.setFullYear(end.getFullYear() - 1)
            break
        case 'custom': {
            const selectedStart = parseDateKey(customStart)
            const selectedEnd = parseDateKey(customEnd)

            if (!selectedStart || !selectedEnd) {
                return { start: null, end: null, type: 'custom' }
            }

            selectedStart.setHours(0, 0, 0, 0)
            selectedEnd.setHours(23, 59, 59, 999)
            return { start: selectedStart, end: selectedEnd, type: 'custom' }
        }
        case 'all':
        default:
            return { start: null, end: null, type: 'all' }
    }

    return { start, end, type: rangeType }
}

export default function DateRangePicker({ value, onChange, className = '' }) {
    const [isOpen, setIsOpen] = useState(false)
    const [showCalendar, setShowCalendar] = useState(false)
    const [rangeType, setRangeType] = useState(value?.type || 'all')
    const [customStart, setCustomStart] = useState('')
    const [customEnd, setCustomEnd] = useState('')
    const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    const dropdownRef = useRef(null)
    const calendarRef = useRef(null)

    const syncDraftWithValue = () => {
        const startKey = value?.customStart || valueToDateKey(value?.start)
        const endKey = value?.customEnd || valueToDateKey(value?.end)
        const monthDate = parseDateKey(startKey) || new Date()

        setRangeType(value?.type || 'all')
        setCustomStart(startKey)
        setCustomEnd(endKey)
        setVisibleMonth(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1))
    }

    useEffect(() => {
        syncDraftWithValue()
        // The applied value is the source of truth; draft calendar clicks stay local until Apply.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                dropdownRef.current
                && !dropdownRef.current.contains(event.target)
                && !calendarRef.current?.contains(event.target)
            ) {
                setIsOpen(false)
                setShowCalendar(false)
            }
        }

        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setIsOpen(false)
                setShowCalendar(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        document.addEventListener('keydown', handleEscape)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [])

    useEffect(() => {
        if (!showCalendar) return undefined

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = previousOverflow
        }
    }, [showCalendar])

    const calendarDays = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth])
    const todayKey = toDateKey(new Date())

    const toggleDropdown = () => {
        if (!isOpen) {
            syncDraftWithValue()
            setShowCalendar(false)
        }
        setIsOpen(!isOpen)
    }

    const handleRangeChange = (type) => {
        setRangeType(type)
        const { start, end } = getDateRange(type)
        onChange({ type, start, end })
        setIsOpen(false)
        setShowCalendar(false)
    }

    const openCustomCalendar = () => {
        const monthDate = parseDateKey(customStart) || new Date()
        setRangeType('custom')
        setVisibleMonth(new Date(monthDate.getFullYear(), monthDate.getMonth(), 1))
        setShowCalendar(true)
    }

    const handleDateClick = (date) => {
        const dateKey = toDateKey(date)

        if (dateKey > todayKey) return

        if (!customStart || customEnd) {
            setCustomStart(dateKey)
            setCustomEnd('')
            return
        }

        if (dateKey < customStart) {
            setCustomEnd(customStart)
            setCustomStart(dateKey)
        } else {
            setCustomEnd(dateKey)
        }
    }

    const applyCustomRange = () => {
        if (!customStart || !customEnd || customStart > todayKey || customEnd > todayKey) return

        const { start, end } = getDateRange('custom', customStart, customEnd)
        onChange({ type: 'custom', start, end, customStart, customEnd })
        setRangeType('custom')
        setIsOpen(false)
        setShowCalendar(false)
    }

    const clearDraft = () => {
        setCustomStart('')
        setCustomEnd('')
    }

    const changeMonth = (offset) => {
        setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1))
    }

    const getLabel = () => {
        switch (value?.type) {
            case '7': return 'Last 7 days'
            case '30': return 'Last 30 days'
            case '90': return 'Last 90 days'
            case '365': return 'Last year'
            case 'all': return 'All time'
            case 'custom': {
                const startKey = value?.customStart || valueToDateKey(value?.start)
                const endKey = value?.customEnd || valueToDateKey(value?.end)
                if (startKey && endKey) {
                    const shortDate = (dateKey) => formatSelectedDate(dateKey).replace(/, \d{4}$/, '')
                    return `${shortDate(startKey)} – ${shortDate(endKey)}`
                }
                return 'Custom Range'
            }
            default: return 'All time'
        }
    }

    const presets = [
        { type: '7', label: 'Last 7 days' },
        { type: '30', label: 'Last 30 days' },
        { type: '90', label: 'Last 90 days' },
        { type: '365', label: 'Last year' },
        { type: 'all', label: 'All time' }
    ]
    const today = new Date()
    const isAtOrAfterCurrentMonth = (visibleMonth.getFullYear() * 12 + visibleMonth.getMonth())
        >= (today.getFullYear() * 12 + today.getMonth())

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <button
                type="button"
                onClick={toggleDropdown}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                className="flex items-center gap-2 px-3 py-2 text-sm bg-white dark:bg-paper-200 border border-gray-300 dark:border-paper-300 rounded-lg hover:border-gray-400 dark:hover:border-paper-400 focus:outline-none focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 transition-all w-full justify-between min-w-[140px] text-gray-900 dark:text-gray-100"
            >
                <span className="truncate">{getLabel()}</span>
                <svg className={`w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (() => {
                const panel = (
                <div
                    ref={showCalendar ? calendarRef : undefined}
                    role="dialog"
                    aria-modal={showCalendar || undefined}
                    aria-label={showCalendar ? 'Choose a custom date range' : 'Choose a date range'}
                    className={`bg-white dark:bg-paper-200 rounded-xl shadow-xl border border-gray-100 dark:border-paper-300 z-50 overflow-x-hidden animate-fade-in ${
                        showCalendar
                            ? 'relative w-full max-w-[22rem] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain'
                            : 'absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden'
                    }`}
                >
                    {!showCalendar ? (
                        <div className="py-1">
                            {presets.map(({ type, label }) => (
                                <button
                                    type="button"
                                    key={type}
                                    onClick={() => handleRangeChange(type)}
                                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-paper-300 flex items-center justify-between ${rangeType === type ? 'bg-gray-50 dark:bg-paper-300/50 font-medium text-black dark:text-white' : 'text-gray-700 dark:text-gray-200'}`}
                                >
                                    <span>{label}</span>
                                    {rangeType === type && <span aria-hidden="true">✓</span>}
                                </button>
                            ))}

                            <div className="border-t border-gray-100 dark:border-paper-300 my-1" />

                            <button
                                type="button"
                                onClick={openCustomCalendar}
                                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 dark:hover:bg-paper-300 flex items-center justify-between ${rangeType === 'custom' ? 'bg-gray-50 dark:bg-paper-300/50 font-medium text-black dark:text-white' : 'text-gray-700 dark:text-gray-200'}`}
                            >
                                <span className="flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 2v3m8-3v3M3.5 9h17M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
                                    </svg>
                                    Custom Range
                                </span>
                                {rangeType === 'custom' ? <span aria-hidden="true">✓</span> : <span aria-hidden="true">›</span>}
                            </button>
                        </div>
                    ) : (
                        <div className="p-2.5 sm:p-3">
                            <div className="flex items-center justify-between mb-3">
                                <button
                                    type="button"
                                    onClick={() => setShowCalendar(false)}
                                    className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-md px-1 py-1"
                                >
                                    <span aria-hidden="true">‹</span>
                                    Ranges
                                </button>
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">Custom Range</span>
                                <button
                                    type="button"
                                    onClick={clearDraft}
                                    disabled={!customStart && !customEnd}
                                    className="text-xs font-medium text-gray-500 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 rounded-md px-1 py-1"
                                >
                                    Clear
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-3">
                                <div className={`rounded-lg border px-3 py-2 ${customStart && !customEnd ? 'border-black dark:border-white' : 'border-gray-200 dark:border-paper-400'}`}>
                                    <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Start date</div>
                                    <div className="mt-0.5 text-xs font-medium text-gray-900 dark:text-white truncate">{formatSelectedDate(customStart)}</div>
                                </div>
                                <div className={`rounded-lg border px-3 py-2 ${customStart && !customEnd ? 'border-black dark:border-white' : 'border-gray-200 dark:border-paper-400'}`}>
                                    <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">End date</div>
                                    <div className="mt-0.5 text-xs font-medium text-gray-900 dark:text-white truncate">{formatSelectedDate(customEnd)}</div>
                                </div>
                            </div>

                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3" aria-live="polite">
                                {!customStart ? 'Choose the first date.' : !customEnd ? 'Now choose the second date.' : 'Your selected range is highlighted.'}
                            </p>

                            <div className="flex items-center justify-between mb-2">
                                <button
                                    type="button"
                                    onClick={() => changeMonth(-1)}
                                    aria-label="Previous month"
                                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-paper-300"
                                >
                                    <span className="text-xl leading-none" aria-hidden="true">‹</span>
                                </button>
                                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => changeMonth(1)}
                                    disabled={isAtOrAfterCurrentMonth}
                                    aria-label="Next month"
                                    className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-paper-300 disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                >
                                    <span className="text-xl leading-none" aria-hidden="true">›</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-7 mb-1" aria-hidden="true">
                                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                                    <div key={day} className="h-7 flex items-center justify-center text-[10px] font-semibold uppercase text-gray-400 dark:text-gray-500">
                                        {day}
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-7 gap-y-0.5 sm:gap-y-1" role="grid">
                                {calendarDays.map(date => {
                                    const dateKey = toDateKey(date)
                                    const isCurrentMonth = date.getMonth() === visibleMonth.getMonth()
                                    const isStart = dateKey === customStart
                                    const isEnd = dateKey === customEnd
                                    const isSelected = isStart || isEnd
                                    const isInRange = customStart && customEnd && dateKey > customStart && dateKey < customEnd
                                    const isToday = dateKey === todayKey
                                    const isFuture = dateKey > todayKey

                                    return (
                                        <button
                                            type="button"
                                            role="gridcell"
                                            key={dateKey}
                                            onClick={() => handleDateClick(date)}
                                            disabled={isFuture}
                                            aria-label={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                            aria-selected={Boolean(isSelected)}
                                            className={`h-8 sm:h-9 relative flex items-center justify-center text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/30 ${
                                                isFuture
                                                    ? 'text-gray-200 dark:text-gray-600 cursor-not-allowed'
                                                    : isSelected
                                                    ? 'bg-black dark:bg-white text-white dark:text-black rounded-lg font-semibold z-10'
                                                    : isInRange
                                                        ? 'bg-gray-100 dark:bg-paper-300 text-gray-900 dark:text-white'
                                                        : isCurrentMonth
                                                            ? 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-paper-300 rounded-lg'
                                                            : 'text-gray-300 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-paper-300/60 rounded-lg'
                                            }`}
                                        >
                                            {date.getDate()}
                                            {isToday && !isSelected && <span className="absolute bottom-1 w-1 h-1 rounded-full bg-black dark:bg-white" />}
                                        </button>
                                    )
                                })}
                            </div>

                            <button
                                type="button"
                                onClick={applyCustomRange}
                                disabled={!customStart || !customEnd || customStart > todayKey || customEnd > todayKey}
                                className="w-full px-3 py-2.5 mt-3 text-xs bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-semibold"
                            >
                                Apply date range
                            </button>
                        </div>
                    )}
                </div>
                )

                if (!showCalendar) return panel

                return createPortal(
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
                        onMouseDown={(event) => {
                            if (event.target === event.currentTarget) {
                                setIsOpen(false)
                                setShowCalendar(false)
                            }
                        }}
                    >
                        {panel}
                    </div>,
                    document.body
                )
            })()}
        </div>
    )
}
