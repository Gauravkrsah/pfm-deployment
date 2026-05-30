import { supabase } from '../supabase'

export function getUserDisplayName(user) {
  return user?.user_metadata?.name || user?.user_metadata?.full_name || ''
}

export async function syncUserProfile(user, nameOverride) {
  if (!user?.id) return null

  const fullName = (nameOverride || getUserDisplayName(user)).trim()
  if (!fullName && !user.email) return null

  return supabase
    .from('profiles')
    .upsert({
      id: user.id,
      full_name: fullName || null,
      email: user.email || null
    }, { onConflict: 'id' })
}
