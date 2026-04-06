'use server'

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function publishComment(formData: FormData) {
  const content = formData.get('content') as string
  const category = formData.get('category') as string

  if (!content?.trim()) throw new Error('留言内容不能为空')

  const { data: badWords } = await supabase.from('sensitive_words').select('word')
  const hasBadWord = badWords?.some(w => content.toLowerCase().includes(w.word.toLowerCase()))
  if (hasBadWord) throw new Error('包含敏感词汇，请修改后发布')

  const { error } = await supabase.from('comments').insert([{ content, category }])
  if (error) throw error
}

export async function likeComment(commentId: string, fingerprint: string) {
  await supabase.from('interactions').insert([{
    comment_id: commentId,
    user_fingerprint: fingerprint,
    action: 'like'
  }])
  await supabase.rpc('increment_likes', { comment_id: commentId })
}

export async function reportComment(commentId: string, fingerprint: string) {
  await supabase.from('interactions').insert([{
    comment_id: commentId,
    user_fingerprint: fingerprint,
    action: 'report'
  }])
  await supabase.rpc('increment_reports', { comment_id: commentId })
}

export async function deleteComment(commentId: string) {
  await supabase.from('comments').delete().eq('id', commentId)
}

export async function checkAdminPassword(password: string) {
  const { data } = await supabase.rpc('check_admin_password', { input_password: password })
  return data === true
}