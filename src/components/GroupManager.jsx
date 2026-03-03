import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { useToast } from './Toast'
import DeleteConfirmationModal from './ui/DeleteConfirmationModal'

export default function GroupManager({ user, currentGroup, onGroupChange, onClearChat }) {
  const [groups, setGroups] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitations, setInvitations] = useState([])
  const [groupMembers, setGroupMembers] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showMobileMembers, setShowMobileMembers] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [dismissedInvites, setDismissedInvites] = useState([])
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [showClearChatModal, setShowClearChatModal] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const menuRef = useRef(null)
  const settingsRef = useRef(null)
  const dropdownRef = useRef(null)

  const toast = useToast()

  const fetchGroups = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('group_members')
        .select('groups(*)')
        .eq('user_id', user.id)

      if (error) {
        // Error handled silently
      } else {
        const rawGroups = data?.map(item => item.groups).filter(Boolean) || []
        // Unique by group id to prevent duplicate keys in selector
        const uniqueGroups = Array.from(new Map(rawGroups.map(g => [g.id, g])).values())
        setGroups(uniqueGroups)

        // Validate current group still exists
        if (currentGroup && !uniqueGroups.find(g => g.id === currentGroup.id)) {
          onGroupChange(null)
        }
      }
    } catch (err) {
      // Error handled silently
    }
  }, [user, currentGroup, onGroupChange])

  const fetchInvitations = useCallback(async () => {
    const { data } = await supabase
      .from('group_invitations')
      .select('*, groups(name)')
      .eq('invited_email', user.email)
      .eq('status', 'pending')

    setInvitations(data || [])
  }, [user])

  const fetchGroupMembers = useCallback(async () => {
    if (!currentGroup) {
      setGroupMembers([])
      return
    }

    setLoadingMembers(true)
    try {
      const { data: membersData, error: membersError } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', parseInt(currentGroup.id))

      if (membersError) {
        setGroupMembers([])
        return
      }

      if (!membersData || membersData.length === 0) {
        setGroupMembers([])
        return
      }

      const userIds = membersData.map(m => m.user_id)

      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      if (usersError) {
        setGroupMembers([])
        return
      }

      // Filter out duplicate user IDs
      const uniqueSource = []
      const seen = new Set()
      membersData.forEach(m => {
        if (!seen.has(m.user_id)) {
          seen.add(m.user_id)
          uniqueSource.push(m)
        }
      })

      const combined = uniqueSource.map(member => {
        const userInfo = usersData.find(u => u.id === member.user_id)
        // If no profile exists but this is the current user, use auth data
        if (!userInfo && member.user_id === user.id) {
          return {
            user_id: member.user_id,
            users: {
              id: user.id,
              full_name: user.user_metadata?.name || user.user_metadata?.full_name || null,
              email: user.email
            }
          }
        }
        return {
          user_id: member.user_id,
          users: userInfo || null
        }
      })

      setGroupMembers(combined)
    } catch (err) {
      setGroupMembers([])
    } finally {
      setLoadingMembers(false)
    }
  }, [currentGroup, user])

  useEffect(() => {
    if (user) {
      fetchGroups()
      fetchInvitations()
    }
  }, [user, fetchGroups, fetchInvitations])

  useEffect(() => {
    if (currentGroup) {
      fetchGroupMembers()
    }
  }, [currentGroup, fetchGroupMembers])

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMembers(false)
      }
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettings(false)
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuRef, settingsRef, dropdownRef])

  const acceptInvitation = async (invitationId, groupId) => {
    // Check if already a member first to prevent duplicates
    const { data: existing, error: checkError } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!existing && !checkError) {
      await supabase
        .from('group_members')
        .insert({ group_id: groupId, user_id: user.id })
    }

    await supabase
      .from('group_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitationId)

    fetchGroups()
    fetchInvitations()
  }

  const declineInvitation = async (invitationId) => {
    try {
      const { error } = await supabase
        .from('group_invitations')
        .update({ status: 'declined' })
        .eq('id', invitationId)

      if (error) throw error

      toast.success('Invitation declined')
      fetchInvitations()
    } catch (err) {
      toast.error('Error declining invitation')
    }
  }

  const dismissInvitation = (invitationId) => {
    setDismissedInvites(prev => [...prev, invitationId])
  }

  const createGroup = async (e) => {
    e.preventDefault()
    if (isProcessing) return
    setIsProcessing(true)

    try {
      const { data, error } = await supabase
        .from('groups')
        .insert({ name: groupName, created_by: user.id })
        .select()

      if (error) {
        toast.error('Error creating group: ' + error.message)
        return
      }

      if (data?.[0]) {
        const { error: memberError } = await supabase
          .from('group_members')
          .insert({ group_id: data[0].id, user_id: user.id })

        if (memberError) {
          toast.error('Group created but error adding you as member: ' + memberError.message)
        } else {
          toast.success('Group created successfully!')
          setGroupName('')
          setShowCreate(false)
          onGroupChange(data[0])
          fetchGroups()
        }
      }
    } catch (err) {
      toast.error('Unexpected error creating group: ' + err.message)
    } finally {
      setIsProcessing(false)
    }
  }

  const leaveGroup = () => {
    if (!currentGroup || isProcessing) return
    setShowLeaveModal(true)
  }

  const handleConfirmLeave = async () => {
    setShowLeaveModal(false)
    setIsProcessing(true)
    try {
      await supabase
        .from('group_members')
        .delete()
        .eq('group_id', currentGroup.id)
        .eq('user_id', user.id)

      onGroupChange(null)
      fetchGroups()
      toast.success('Left group successfully')
    } catch (err) {
      toast.error('Error leaving group')
    } finally {
      setIsProcessing(false)
    }
  }

  const deleteGroup = async () => {
    if (!currentGroup || currentGroup.created_by !== user.id || isProcessing) return
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = async () => {
    setIsProcessing(true)
    setShowDeleteModal(false)

    try {
      // Step 1: Delete all dependent data
      const { error: membersErr } = await supabase.from('group_members').delete().eq('group_id', currentGroup.id)
      if (membersErr) throw new Error('Failed to delete members: ' + membersErr.message)

      const { error: inviteErr } = await supabase.from('group_invitations').delete().eq('group_id', currentGroup.id)
      if (inviteErr) throw new Error('Failed to delete invitations: ' + inviteErr.message)

      // Expenses also covers Income and Loans in this app
      const { error: expenseErr } = await supabase.from('expenses').delete().eq('group_id', currentGroup.id)
      if (expenseErr) throw new Error('Failed to delete expenses: ' + expenseErr.message)

      // Step 2: Delete the group itself
      const { error: groupErr } = await supabase.from('groups').delete().eq('id', currentGroup.id)
      if (groupErr) throw new Error('Failed to delete group: ' + groupErr.message)

      onGroupChange(null)
      fetchGroups()
      toast.success('Group deleted successfully')
    } catch (err) {
      toast.error(err.message || 'Error deleting group')
    } finally {
      setIsProcessing(false)
    }
  }

  const inviteUser = async (e) => {
    e.preventDefault()
    if (!currentGroup) return

    const trimmedEmail = inviteEmail.trim()
    if (!trimmedEmail) {
      toast.error('Please enter an email address')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      toast.error('Please enter a valid email address')
      return
    }

    try {
      const { error } = await supabase
        .from('group_invitations')
        .insert({
          group_id: currentGroup.id,
          invited_email: trimmedEmail,
          invited_by: user.id
        })

      if (error) {
        toast.error('Error sending invitation: ' + (error.message || 'Unknown error'))
      } else {
        toast.success(`Invitation sent to ${trimmedEmail}!`)
        setInviteEmail('')
      }
    } catch (err) {
      toast.error('Error sending invitation: ' + (err.message || 'Failed to send invitation'))
    }
  }

  const membersListContent = loadingMembers ? (
    <div className="text-center py-8">
      <div className="inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  ) : (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-2 scrollbar-thin">
      {groupMembers.map((member, idx) => {
        const isAdmin = member.user_id === currentGroup?.created_by
        return (
          <div key={idx} className="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-paper-300 rounded-lg transition-colors">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm ${isAdmin ? 'bg-amber-500' : 'bg-blue-500'}`}>
              {(member.users?.full_name || member.users?.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                {member.users?.full_name || member.users?.email?.split('@')[0] || 'Unknown User'}
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                {member.users?.email || 'No email available'}
              </div>
            </div>
            {isAdmin && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">Admin</span>}
          </div>
        )
      })}
    </div>
  )

  return (
    <>
      {invitations.filter(i => !dismissedInvites.includes(i.id)).length > 0 && (
        <div className="mb-2 p-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/30 rounded-xl shadow-sm animate-fade-in relative group/card">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 p-1 rounded-md text-xs">📧</span>
            <h3 className="font-semibold text-xs text-blue-900 dark:text-blue-100">Pending Invitations</h3>
          </div>
          <div className="space-y-1">
            {invitations.filter(i => !dismissedInvites.includes(i.id)).map(inv => (
              <div key={inv.id} className="flex items-center justify-between gap-3 p-2 bg-white dark:bg-paper-200 rounded-lg border border-gray-100 dark:border-paper-300 shadow-sm relative pr-8">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                  Invited to join <span className="font-bold text-gray-900 dark:text-white">"{inv.groups?.name || 'Unknown'}"</span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => declineInvitation(inv.id)}
                    className="px-2 py-1 text-[10px] font-bold text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => acceptInvitation(inv.id, inv.group_id)}
                    className="px-3 py-1 text-[10px] font-bold bg-blue-600 text-white rounded-md hover:bg-blue-700 shadow-sm active:scale-95 transition-all"
                  >
                    Accept
                  </button>
                </div>
                <button
                  onClick={() => dismissInvitation(inv.id)}
                  className="absolute right-1 top-1 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-paper-300 transition-colors"
                  title="Dismiss for now"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* ── Group bar ── */}
      <div className={`w-full mb-2 flex ${!currentGroup ? 'justify-center' : 'justify-start'}`}>
        <div className={`bg-white dark:bg-paper-100 p-1.5 rounded-xl border border-gray-200 dark:border-paper-300 shadow-sm flex flex-row items-center justify-between gap-2 transition-all hover:shadow-md ${!currentGroup ? 'w-auto' : 'w-full'}`}>

          {/* Group Selector & New Button */}
          <div className="flex items-center gap-2 flex-1 lg:flex-none lg:w-auto bg-gray-50/80 dark:bg-paper-300/30 p-1.5 rounded-xl border border-gray-100/80 dark:border-paper-300/30 min-w-0">
            <div className="relative flex-1 lg:min-w-[200px] min-w-0" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`w-full flex items-center justify-between pl-3 pr-2 py-2.5 text-sm rounded-lg focus:ring-2 focus:ring-black/5 dark:focus:ring-white/10 text-gray-900 dark:text-gray-100 font-semibold cursor-pointer outline-none transition-all duration-200 ${isDropdownOpen ? 'bg-white shadow-sm ring-1 ring-gray-200/50 dark:bg-paper-300' : 'bg-transparent hover:bg-white/80 dark:hover:bg-paper-300/80'}`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span className={`flex items-center justify-center w-6 h-6 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0 transition-colors ${isDropdownOpen ? 'opacity-100' : 'opacity-80'}`}>
                    {currentGroup ? '👥' : '👤'}
                  </span>
                  <span className="truncate">{currentGroup ? currentGroup.name : 'Personal Workspace'}</span>
                </div>
                <span className={`text-gray-400 text-[10px] transition-transform duration-300 ml-2 flex-shrink-0 ${isDropdownOpen ? 'rotate-180 text-gray-900' : ''}`}>▼</span>
              </button>

              {isDropdownOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-[240px] bg-white dark:bg-paper-200 border border-gray-100 dark:border-paper-300 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] z-50 py-1.5 animate-scale-in origin-top">
                  <button
                    className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center gap-3 ${!currentGroup ? 'bg-blue-50/50 text-blue-700 dark:bg-blue-900/10 dark:text-blue-300 font-bold' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-paper-300/50'}`}
                    onClick={() => {
                      onGroupChange(null)
                      setIsDropdownOpen(false)
                      setShowMembers(false)
                    }}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${!currentGroup ? 'bg-blue-500' : 'bg-transparent'}`}></span>
                    Personal Workspace
                  </button>
                  <div className="h-px bg-gray-100/50 dark:bg-paper-300/30 mx-2 my-1"></div>
                  <div className="max-h-60 overflow-y-auto scrollbar-thin">
                    <div className="px-3 py-1.5 text-[10px] font-bold tracking-wider text-gray-400 uppercase select-none">Your Groups</div>
                    {groups.map((group) => (
                      <button
                        key={group.id}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-3 ${currentGroup?.id === group.id ? 'bg-blue-50/50 text-blue-700 dark:bg-blue-900/10 dark:text-blue-300 font-bold' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-paper-300/50'}`}
                        onClick={() => {
                          onGroupChange(group)
                          setIsDropdownOpen(false)
                          setShowMembers(false)
                        }}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${currentGroup?.id === group.id ? 'bg-blue-500' : 'bg-transparent'}`}></span>
                        <span className="truncate">{group.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 text-xs bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-black dark:hover:bg-gray-100 hover:shadow-lg transition-all font-bold whitespace-nowrap active:scale-95 flex items-center gap-1.5"
            >
              <span className="text-base leading-none">+</span> New
            </button>
          </div>

          {/* Desktop Actions */}
          <div className={`hidden lg:flex items-center gap-3 ml-auto ${!currentGroup ? 'hidden lg:hidden' : ''}`}>
            {currentGroup && (
              <>
                {/* Members Avatars */}
                <div
                  className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-paper-300 p-1.5 pr-3 rounded-xl transition-colors border border-transparent hover:border-gray-100 dark:hover:border-paper-300 relative"
                  onClick={(e) => { e.stopPropagation(); setShowMembers(!showMembers); }}
                >
                  <div className="flex -space-x-2">
                    {groupMembers.slice(0, 3).map((member, i) => (
                      <div key={i} className="w-8 h-8 rounded-full border-2 border-white dark:border-paper-100 flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br from-blue-400 to-blue-600 shadow-sm">
                        {(member.users?.full_name || member.users?.email || 'U').charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {groupMembers.length > 3 && (
                      <div className="w-8 h-8 rounded-full border-2 border-white dark:border-paper-100 flex items-center justify-center text-[10px] font-bold bg-gray-100 dark:bg-paper-400 text-gray-600 dark:text-gray-200">
                        +{groupMembers.length - 3}
                      </div>
                    )}
                  </div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {groupMembers.length} Members
                  </div>

                  {/* Members Popover */}
                  {showMembers && (
                    <div ref={menuRef} className="absolute top-full right-0 mt-3 w-80 bg-white dark:bg-paper-200 border border-gray-200 dark:border-paper-300 rounded-2xl shadow-xl z-50 p-4 animate-scale-in origin-top-right">
                      <h4 className="font-bold text-gray-900 dark:text-white mb-3 text-sm flex items-center justify-between">
                        <span>Group Members</span>
                        <span className="text-xs py-0.5 px-2 bg-gray-100 dark:bg-paper-300 rounded-full text-gray-500 dark:text-gray-400">{groupMembers.length}</span>
                      </h4>

                      {membersListContent}
                    </div>
                  )}
                </div>

                <div className="w-px h-8 bg-gray-200 dark:bg-paper-300 mx-1"></div>

                {/* Invite Form Pill */}
                <form onSubmit={inviteUser} className="flex items-center bg-gray-100 dark:bg-paper-300 rounded-full p-1 pl-4 border border-transparent focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all w-72">
                  <input
                    type="email"
                    placeholder="Invite via email..."
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="bg-transparent border-none text-sm w-full outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-4 py-1.5 text-xs font-bold transition-colors shadow-md shadow-blue-500/20 ml-2"
                  >
                    Invite
                  </button>
                </form>

                <div className="w-px h-6 bg-gray-200 dark:bg-paper-300 mx-1"></div>

                {/* Inline Group Actions */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono bg-gray-100 dark:bg-paper-300 px-2 py-1 rounded-lg">
                    ID: {currentGroup.id}
                  </span>
                  <button
                    onClick={leaveGroup}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-all active:scale-95"
                    title="Leave group"
                  >
                    <span>👋</span> Leave
                  </button>
                  {currentGroup.created_by === user.id && (
                    <button
                      onClick={deleteGroup}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all active:scale-95"
                      title="Delete group"
                    >
                      <span>🗑️</span> Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Mobile Menu Button Displayed Only for Groups */}
          {currentGroup && (
            <div className="lg:hidden relative ml-auto">
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-2 text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-100 dark:hover:bg-paper-300 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                </svg>
              </button>
              {showMobileMenu && (
                <>
                  <div className="fixed inset-0 z-40 bg-black/20 cursor-pointer" onClick={() => setShowMobileMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-paper-200 rounded-xl shadow-xl border border-gray-100 dark:border-paper-300 z-50 py-2 overflow-hidden">
                    <button onClick={() => { setShowInviteModal(true); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-paper-300 flex items-center gap-3">
                      <span>✉️</span> Invite Member
                    </button>
                    <button onClick={() => { setShowMobileMembers(true); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-paper-300 flex items-center gap-3">
                      <span>👥</span> View Members
                    </button>
                    <div className="h-px bg-gray-100 dark:bg-paper-300 my-1"></div>
                    <button onClick={() => { leaveGroup(); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-3">
                      <span>👋</span> Leave Group
                    </button>
                    {currentGroup.created_by === user.id && (
                      <button onClick={() => { deleteGroup(); setShowMobileMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-3">
                        <span>⚠️</span> Delete Group
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showInviteModal && currentGroup && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-paper-200 rounded-xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 dark:border-paper-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Invite Member</h3>
              <button onClick={() => setShowInviteModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={(e) => { inviteUser(e); setShowInviteModal(false); }} className="space-y-3">
              <input
                type="email"
                placeholder="Enter email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-paper-300 rounded-lg focus:ring-2 focus:ring-black dark:focus:ring-white/20 focus:border-transparent bg-white dark:bg-paper-300 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                autoFocus
              />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                  Send Invite
                </button>
                <button type="button" onClick={() => setShowInviteModal(false)} className="flex-1 px-4 py-2 text-sm bg-gray-200 dark:bg-paper-300 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-paper-400">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showMobileMembers && currentGroup && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4 z-50 lg:hidden">
          <div className="bg-white dark:bg-paper-200 rounded-xl max-w-sm w-full p-6 shadow-2xl border border-gray-100 dark:border-paper-300 relative flex flex-col max-h-[85vh] animate-scale-in">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                Group Members <span className="text-xs py-0.5 px-2 bg-gray-100 dark:bg-paper-300 rounded-full text-gray-500 dark:text-gray-400">{groupMembers.length}</span>
              </h3>
              <button onClick={() => setShowMobileMembers(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {membersListContent}
            <button onClick={() => setShowMobileMembers(false)} className="mt-4 w-full py-2.5 bg-gray-100 dark:bg-paper-300 text-gray-900 dark:text-white rounded-lg text-sm font-bold active:scale-95 transition-all">Close</button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-start justify-center p-4 z-50 pt-32 md:pt-40">
          <div className="bg-white dark:bg-paper-200 rounded-xl max-w-md w-full p-6 shadow-2xl border border-gray-100 dark:border-paper-300" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Create New Group</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-paper-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={createGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Group Name</label>
                <input
                  placeholder="e.g., Roommates, Trip Budget, Family Expenses"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-paper-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all bg-white dark:bg-paper-300 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  required
                  autoFocus
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                >
                  {isProcessing ? 'Creating...' : 'Create Group'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 px-6 py-3 bg-gray-200 dark:bg-paper-300 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-paper-400 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <DeleteConfirmationModal
          isOpen={showDeleteModal}
          title="Delete group?"
          itemName={currentGroup?.name}
          description="This action cannot be undone. All group data, including expenses and messages, will be permanently removed."
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {showLeaveModal && (
        <DeleteConfirmationModal
          isOpen={showLeaveModal}
          title="Leave group?"
          itemName={currentGroup?.name}
          description="You will lose access to this group's data. You can rejoin later if invited again."
          confirmLabel="Leave"
          confirmColor="bg-amber-500 hover:bg-amber-600 ring-amber-500"
          onConfirm={handleConfirmLeave}
          onCancel={() => setShowLeaveModal(false)}
        />
      )}

      {showClearChatModal && (
        <DeleteConfirmationModal
          isOpen={showClearChatModal}
          title="Delete chat?"
          itemName="all messages in this chat"
          description="This will clear your local chat history. It cannot be undone."
          onConfirm={() => {
            onClearChat?.()
            setShowClearChatModal(false)
          }}
          onCancel={() => setShowClearChatModal(false)}
        />
      )}
    </>
  )
}