'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Send, ThumbsUp, AlertTriangle, Trash2, Languages } from 'lucide-react'
import Image from 'next/image'
import { publishComment, likeComment, reportComment, deleteComment, checkAdminPassword } from './actions'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface Comment {
  id: string
  content: string
  likes: number
  reports: number
  created_at: string
  category: string
}

export default function Home() {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('生活')
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')

  const fingerprint = typeof window !== 'undefined' 
    ? (localStorage.getItem('user_fingerprint') || (() => {
        const fp = crypto.randomUUID()
        localStorage.setItem('user_fingerprint', fp)
        return fp
      })())
    : ''

  useEffect(() => {
    const loadComments = async () => {
      const { data } = await supabase.from('comments').select('*').eq('is_hidden', false).order('created_at', { ascending: false })
      setComments(data || [])
    }
    loadComments()

    const channel = supabase.channel('comments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, loadComments)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    const loadCategories = async () => {
      const { data } = await supabase.from('categories').select('name')
      setAllCategories(data?.map(c => c.name) || ['生活', '学习', '校园'])
    }
    loadCategories()
  }, [])

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) return
    const formData = new FormData()
    formData.append('content', newComment)
    formData.append('category', selectedCategory)
    try {
      await publishComment(formData)
      setNewComment('')
    } catch (err: any) {
      alert(err.message || '发布失败')
    }
  }

  const handleLike = (id: string) => likeComment(id, fingerprint)
  const handleReport = (id: string) => reportComment(id, fingerprint)

  const handleAdminLogin = async () => {
    const success = await checkAdminPassword(adminPassword)
    if (success) {
      setIsAdmin(true)
      setShowAdminModal(false)
    } else alert('密码错误')
    setAdminPassword('')
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#0ea5e9]">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-4 mb-10">
          <Image src="/logo.png" alt="CWA Logo" width={90} height={90} className="drop-shadow-2xl" />
          <h1 className="text-5xl font-bold text-white">CWA Anonymous Message Board</h1>
        </div>

        <form onSubmit={handlePublish} className="glass rounded-3xl p-8 mb-10">
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="在这里自由表达你的观点..."
            className="w-full h-40 bg-white/10 text-white placeholder-white/60 rounded-2xl p-6 focus:outline-none focus:ring-2 focus:ring-white/40 text-lg resize-none"
          />
          <div className="flex items-end gap-4 mt-6">
            <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="flex-1 bg-white/10 text-white rounded-2xl px-6 py-4">
              {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <button type="submit" className="px-12 py-4 bg-white text-[#1e3a8a] font-semibold rounded-2xl flex items-center gap-3 hover:bg-white/90">
              <Send size={24} /> 发布
            </button>
          </div>
        </form>

        <div className="space-y-6">
          {comments.map(comment => (
            <div key={comment.id} className="glass rounded-3xl p-8">
              <div className="flex justify-between mb-4">
                <span className="bg-white/20 px-5 py-1 rounded-full text-white text-sm">{comment.category}</span>
                <span className="text-white/70 text-sm">{new Date(comment.created_at).toLocaleString()}</span>
              </div>
              <p className="text-white text-xl leading-relaxed">{comment.content}</p>
              <div className="flex justify-end gap-8 mt-8 text-white/80">
                <button onClick={() => handleLike(comment.id)} className="flex items-center gap-2 hover:text-white">
                  <ThumbsUp size={22} /> {comment.likes}
                </button>
                <button onClick={() => handleReport(comment.id)} className="flex items-center gap-2 hover:text-red-300">
                  <AlertTriangle size={22} /> {comment.reports}
                </button>
                {isAdmin && <button onClick={() => deleteComment(comment.id)} className="text-red-300"><Trash2 size={22} /></button>}
              </div>
            </div>
          ))}
        </div>

        <button onClick={() => setShowAdminModal(true)} className="fixed bottom-8 right-8 glass px-6 py-3 rounded-2xl text-white text-sm">Admin</button>

        {showAdminModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="glass rounded-3xl p-8 w-full max-w-md">
              <h2 className="text-2xl font-bold text-white mb-6">管理员登录</h2>
              <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="输入密码" className="w-full px-6 py-5 bg-white/10 text-white rounded-2xl mb-6" />
              <div className="flex gap-4">
                <button onClick={handleAdminLogin} className="flex-1 bg-white text-[#1e3a8a] py-4 rounded-2xl font-semibold">登录</button>
                <button onClick={() => setShowAdminModal(false)} className="flex-1 glass text-white py-4 rounded-2xl">取消</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}