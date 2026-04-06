'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Send, ThumbsUp, AlertTriangle, Trash2, Clock, Flame, Languages, Plus, X } from 'lucide-react'
import Image from 'next/image'
import { publishComment, likeComment, reportComment, deleteComment, checkAdminPassword, addCategory, deleteCategory, getSensitiveWords, addSensitiveWord, deleteSensitiveWord } from './actions'

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
  const [sensitiveWords, setSensitiveWords] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [sortBy, setSortBy] = useState<'time' | 'hot'>('time')
  const [loading, setLoading] = useState(true)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newSensitiveWord, setNewSensitiveWord] = useState('')
  const [adminTab, setAdminTab] = useState<'category' | 'sensitive'>('category')

  const t = language === 'zh' ? {
    title: 'CWA 匿名留言板',
    placeholder: '在这里自由表达你的观点...',
    publish: '发布',
    timeSort: '最新',
    hotSort: '最热',
    admin: '管理员',
    noComments: '暂无留言，快来发布第一条吧！',
    addCategory: '添加新分类',
    sensitiveWords: '敏感词管理',
  } : {
    title: 'CWA Anonymous Message Board',
    placeholder: 'Share your thoughts anonymously...',
    publish: 'Publish',
    timeSort: 'Latest',
    hotSort: 'Hot',
    admin: 'Admin',
    noComments: 'No messages yet. Be the first!',
    addCategory: 'Add Category',
    sensitiveWords: 'Sensitive Words',
  }

  const fingerprint = typeof window !== 'undefined' 
    ? (localStorage.getItem('user_fingerprint') || (() => {
        const fp = crypto.randomUUID()
        localStorage.setItem('user_fingerprint', fp)
        return fp
      })())
    : ''

  useEffect(() => {
    const loadComments = async () => {
      setLoading(true)
      const { data } = await supabase.from('comments').select('*').eq('is_hidden', false).order('created_at', { ascending: false })
      setComments(data || [])
      setLoading(false)
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

  // 加载敏感词（仅管理员需要）
  useEffect(() => {
    if (isAdmin) {
      const loadSensitive = async () => {
        const words = await getSensitiveWords()
        setSensitiveWords(words.map(w => w.word))
      }
      loadSensitive()
    }
  }, [isAdmin])

  const sortedComments = [...comments].sort((a, b) => {
    if (sortBy === 'hot') return (b.likes + b.reports * 0.5) - (a.likes + a.reports * 0.5)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

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
    if (success) setIsAdmin(true)
    else alert('密码错误')
    setAdminPassword('')
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return
    try {
      await addCategory(newCategoryName.trim())
      setNewCategoryName('')
      const { data } = await supabase.from('categories').select('name')
      setAllCategories(data?.map(c => c.name) || [])
    } catch (err: any) {
      alert(err.message || '添加失败')
    }
  }

  const handleDeleteCategory = async (name: string) => {
    if (!confirm(`确定删除分类 "${name}" 吗？`)) return
    try {
      await deleteCategory(name)
      const { data } = await supabase.from('categories').select('name')
      setAllCategories(data?.map(c => c.name) || [])
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }

  const handleAddSensitiveWord = async () => {
    if (!newSensitiveWord.trim()) return
    try {
      await addSensitiveWord(newSensitiveWord.trim())
      setNewSensitiveWord('')
      const words = await getSensitiveWords()
      setSensitiveWords(words.map(w => w.word))
    } catch (err: any) {
      alert(err.message || '添加失败')
    }
  }

  const handleDeleteSensitiveWord = async (word: string) => {
    if (!confirm(`确定删除敏感词 "${word}" 吗？`)) return
    try {
      await deleteSensitiveWord(word)
      const words = await getSensitiveWords()
      setSensitiveWords(words.map(w => w.word))
    } catch (err: any) {
      alert(err.message || '删除失败')
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#0ea5e9]">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center gap-4 mb-10">
          <Image src="/logo.png" alt="CWA Logo" width={90} height={90} className="drop-shadow-2xl" />
          <h1 className="text-5xl font-bold text-white tracking-tight">{t.title}</h1>
        </div>

        <form onSubmit={handlePublish} className="glass rounded-3xl p-8 mb-10">
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder={t.placeholder}
            className="w-full h-40 bg-white/10 text-white placeholder-white/60 rounded-2xl p-6 focus:outline-none focus:ring-2 focus:ring-white/40 text-lg resize-none"
          />
          <div className="flex items-end gap-4 mt-6">
            <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="flex-1 bg-white/10 text-white rounded-2xl px-6 py-4">
              {allCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            <button type="submit" className="px-12 py-4 bg-white text-[#1e3a8a] font-semibold rounded-2xl flex items-center gap-3 hover:bg-white/90">
              <Send size={24} /> {t.publish}
            </button>
          </div>
        </form>

        <div className="flex gap-3 mb-6">
          <button onClick={() => setSortBy('time')} className={`glass px-6 py-3 rounded-2xl flex items-center gap-2 ${sortBy === 'time' ? 'bg-white/30' : 'hover:bg-white/20'}`}>
            <Clock size={20} /> {t.timeSort}
          </button>
          <button onClick={() => setSortBy('hot')} className={`glass px-6 py-3 rounded-2xl flex items-center gap-2 ${sortBy === 'hot' ? 'bg-white/30' : 'hover:bg-white/20'}`}>
            <Flame size={20} /> {t.hotSort}
          </button>
        </div>

        <div className="space-y-6">
          {loading ? (
            <div className="glass rounded-3xl p-12 text-center text-white/70">加载中...</div>
          ) : sortedComments.length === 0 ? (
            <div className="glass rounded-3xl p-12 text-center text-white/70">{t.noComments}</div>
          ) : (
            sortedComments.map(comment => (
              <div key={comment.id} className="glass rounded-3xl p-8">
                <div className="flex justify-between mb-4">
                  <span className="bg-white/20 px-5 py-1 rounded-full text-white text-sm">{comment.category}</span>
                  <span className="text-white/70 text-sm">{new Date(comment.created_at).toLocaleString()}</span>
                </div>
                <p className="text-white text-xl leading-relaxed">{comment.content}</p>
                <div className="flex justify-end gap-8 mt-8 text-white/80">
                  <button onClick={() => handleLike(comment.id)} className="flex items-center gap-2 hover:text-white"><ThumbsUp size={22} /> {comment.likes}</button>
                  <button onClick={() => handleReport(comment.id)} className="flex items-center gap-2 hover:text-red-300"><AlertTriangle size={22} /> {comment.reports}</button>
                  {isAdmin && <button onClick={() => deleteComment(comment.id)} className="text-red-300"><Trash2 size={22} /></button>}
                </div>
              </div>
            ))
          )}
        </div>

        <button onClick={() => setShowAdminModal(true)} className="fixed bottom-8 right-8 glass px-6 py-3 rounded-2xl text-white text-sm flex items-center gap-2 hover:bg-white/20">
          <Languages size={18} /> {t.admin}
        </button>

        {showAdminModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="glass rounded-3xl p-8 w-full max-w-lg max-h-[90vh] overflow-auto">
              {!isAdmin ? (
                // 登录界面
                <>
                  <h2 className="text-2xl font-bold text-white mb-6">管理员登录</h2>
                  <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="输入密码" className="w-full px-6 py-5 bg-white/10 text-white rounded-2xl mb-6" />
                  <div className="flex gap-4">
                    <button onClick={handleAdminLogin} className="flex-1 bg-white text-[#1e3a8a] py-4 rounded-2xl font-semibold">登录</button>
                    <button onClick={() => setShowAdminModal(false)} className="flex-1 glass text-white py-4 rounded-2xl">取消</button>
                  </div>
                </>
              ) : (
                // 管理面板
                <>
                  <div className="flex border-b border-white/20 mb-6">
                    <button onClick={() => setAdminTab('category')} className={`flex-1 py-3 ${adminTab === 'category' ? 'border-b-2 border-white text-white' : 'text-white/60'}`}>分类管理</button>
                    <button onClick={() => setAdminTab('sensitive')} className={`flex-1 py-3 ${adminTab === 'sensitive' ? 'border-b-2 border-white text-white' : 'text-white/60'}`}>敏感词管理</button>
                  </div>

                  {adminTab === 'category' ? (
                    // 分类管理
                    <>
                      <div className="flex gap-2 mb-6">
                        <input type="text" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} placeholder={t.addCategory} className="flex-1 px-6 py-4 bg-white/10 text-white rounded-2xl" />
                        <button onClick={handleAddCategory} className="px-6 py-4 bg-white text-[#1e3a8a] rounded-2xl"><Plus size={24} /></button>
                      </div>
                      <div className="max-h-80 overflow-auto">
                        {allCategories.map(cat => (
                          <div key={cat} className="flex justify-between items-center py-3 border-b border-white/10">
                            <span className="text-white">{cat}</span>
                            <button onClick={() => handleDeleteCategory(cat)} className="text-red-400 hover:text-red-300"><X size={20} /></button>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    // 敏感词管理
                    <>
                      <div className="flex gap-2 mb-6">
                        <input type="text" value={newSensitiveWord} onChange={e => setNewSensitiveWord(e.target.value)} placeholder="新增敏感词" className="flex-1 px-6 py-4 bg-white/10 text-white rounded-2xl" />
                        <button onClick={handleAddSensitiveWord} className="px-6 py-4 bg-white text-[#1e3a8a] rounded-2xl"><Plus size={24} /></button>
                      </div>
                      <div className="max-h-80 overflow-auto">
                        {sensitiveWords.map(word => (
                          <div key={word} className="flex justify-between items-center py-3 border-b border-white/10">
                            <span className="text-white">{word}</span>
                            <button onClick={() => handleDeleteSensitiveWord(word)} className="text-red-400 hover:text-red-300"><X size={20} /></button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <button onClick={() => { setIsAdmin(false); setShowAdminModal(false) }} className="w-full mt-8 glass text-white py-4 rounded-2xl">退出管理</button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}