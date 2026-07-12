import React, { useEffect, useState } from 'react'
import Header from '../Header'
import Sidebar from './Sidebar'
import MobileNav from './MobileNav'
import ThemeToggle from '../ThemeToggle'
import GroupManager from '../GroupManager'


export default function MainLayout({ children, activeTab, setActiveTab, user, onLogout, currentGroup, onGroupChange, onClearChat }) {
    const [isComposerFocused, setIsComposerFocused] = useState(false)

    useEffect(() => {
        const handleComposerFocus = (event) => setIsComposerFocused(Boolean(event.detail?.focused))
        window.addEventListener('pfm:composer-focus', handleComposerFocus)
        return () => window.removeEventListener('pfm:composer-focus', handleComposerFocus)
    }, [])

    return (
        <div className="fixed inset-0 overflow-hidden bg-paper-50">
            {/* Sidebar - Desktop */}
            <Sidebar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                user={user}
                onLogout={onLogout}
                currentGroup={currentGroup}
            />

            {/* Main Content */}
            <main className="lg:ml-64 h-full flex flex-col">
                {/* Mobile Header */}
                <div className="lg:hidden flex-shrink-0 bg-white/80 dark:bg-paper-100/80 backdrop-blur-xl border-b border-paper-200 dark:border-paper-300/50 px-4 py-3 z-20 sticky top-0">
                    <div className="flex items-center gap-2">
                        <button onClick={() => window.location.href = '/'} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                            <div className="w-8 h-8 bg-black dark:bg-white text-white dark:text-black flex items-center justify-center text-xs font-bold rounded-2xl shadow-lg shadow-black/20">PFM</div>
                        </button>
                        <div className="min-w-0 flex-1">
                            <GroupManager
                                user={user}
                                currentGroup={currentGroup}
                                onGroupChange={onGroupChange}
                                onClearChat={onClearChat}
                                compact
                            />
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-1.5">
                            <ThemeToggle />
                            <Header user={user} onLogout={onLogout} onProfileUpdate={() => { }} currentGroup={currentGroup} compact />
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {children}
                </div>
            </main>

            <Header user={user} onLogout={onLogout} onProfileUpdate={() => { }} currentGroup={currentGroup} autoPromptProfile />

            {/* Bottom Nav - Mobile */}
            {!isComposerFocused && <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} />}
        </div>
    )
}
