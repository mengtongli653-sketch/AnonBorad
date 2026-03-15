'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Languages, ThumbsUp, AlertTriangle, Trash2, Clock, Flame, Send, X } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

interface Comment {
  id: string
  content: string
  likes: number
  reports: number
  created_at: string
  category: string
}

interface Translations {
  title: string
  placeholder: string
  publish: string
  timeSort: string
  hotSort: string
  likes: string
  reports: string
  delete: string
  admin: string
  controversial: string
  noComments: string
}

const translations: Record<string, Translations> = {
  zh: {
    title: '匿名留言板',
    placeholder: '请输入留言内容...',
    publish: '发布',
    timeSort: '时间排序',
    hotSort: '热度排序',
    likes: '点赞',
    reports: '举报',
    delete: '删除',
    admin: '管理员',
    controversial: '内容争议',
    noComments: '暂无留言',
  },
  en: {
    title: '匿名留言板',
    placeholder: 'Enter your message...',
    publish: 'Publish',
    timeSort: 'Time Sort',
    hotSort: 'Hot Sort',
    likes: 'Likes',
    reports: 'Reports',
    delete: 'Delete',
    admin: 'Admin',
    controversial: 'Controversial Content',
    noComments: 'No comments yet',
  },
}

export default function Home() {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [sortBy, setSortBy] = useState<'time' | 'hot'>('time')
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [currentFilter, setCurrentFilter] = useState('全部')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [badWords, setBadWords] = useState<string[]>([])
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false)
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const t = translations[language]

  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('name')
      .order('created_at', { ascending: true })
    if (error) { console.error('Error loading categories:', error); return }
    const names = (data || []).map((row: { name: string }) => row.name)
    setAllCategories(names)
    if (names.length > 0 && !selectedCategory) {
      setSelectedCategory(names[0])
    }
  }, [selectedCategory])

  const loadBadWords = useCallback(async () => {
    const { data, error } = await supabase.from('sensitive_words').select('word')
    if (error) { console.error('Error loading sensitive words:', error); return }
    setBadWords((data || []).map((row: { word: string }) => row.word))
  }, [])

  const loadComments = useCallback(async () => {
    let query = supabase.from('comments').select('*')
    if (currentFilter !== '全部') {
      query = query.eq('category', currentFilter)
    }
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) { console.error('Error loading comments:', error); return }
    setComments(data || [])
  }, [currentFilter])

  useEffect(() => {
    loadComments()
    loadBadWords()
    loadCategories()
  }, [loadComments, loadBadWords, loadCategories])

  useEffect(() => {
    const sub = supabase
      .channel('public:comments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const c = payload.new as Comment
          if (currentFilter === '全部' || c.category === currentFilter) loadComments()
        } else { loadComments() }
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [loadComments, currentFilter])

  useEffect(() => {
    const sub = supabase
      .channel('public:sensitive_words')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sensitive_words' }, () => loadBadWords())
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [loadBadWords])

  useEffect(() => {
    const sub = supabase
      .channel('public:categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => loadCategories())
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [loadCategories])

  const calculateHotScore = (comment: Comment) => {
    const now = new Date()
    const createdAt = new Date(comment.created_at)
    const hoursAgo = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
    return (comment.likes + comment.reports * 0.5) / (hoursAgo + 2)
  }

  const getSortedComments = () => {
    const sorted = [...comments]
    if (sortBy === 'time') {
      return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
    return sorted.sort((a, b) => calculateHotScore(b) - calculateHotScore(a))
  }

  const getRelativeTime = (timestamp: string) => {
    const now = new Date()
    const past = new Date(timestamp)
    const diff = Math.floor((now.getTime() - past.getTime()) / 1000)
    if (diff < 60) return language === 'zh' ? `${diff}秒前` : `${diff}s ago`
    if (diff < 3600) return language === 'zh' ? `${Math.floor(diff / 60)}分钟前` : `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return language === 'zh' ? `${Math.floor(diff / 3600)}小时前` : `${Math.floor(diff / 3600)}h ago`
    return language === 'zh' ? `${Math.floor(diff / 86400)}天前` : `${Math.floor(diff / 86400)}d ago`
  }

  const isControversial = (comment: Comment) =>
    comment.reports / (comment.likes || 1) > 0.5 && comment.reports > 5

  const handleCategoryChange = (value: string) => {
    if (value === '__new__') {
      setNewCategoryInput('')
      setShowNewCategoryModal(true)
    } else {
      setSelectedCategory(value)
    }
  }

  const handleConfirmNewCategory = () => {
    const trimmed = newCategoryInput.trim()
    if (!trimmed) return
    setSelectedCategory(trimmed)
    setShowNewCategoryModal(false)
    setNewCategoryInput('')
  }

  const handlePublish = async () => {
    if (!newComment.trim()) return
    const content = newComment.toLowerCase()
    const hitWord = badWords.find((word) => content.includes(word.toLowerCase()))
    if (hitWord) { alert('内容包含违禁词，请文明发言'); return }
    const category = selectedCategory.trim()
    if (!category) { alert('请选择或创建一个标签'); return }
    if (!allCategories.includes(category)) {
      const { error: catError } = await supabase.from('categories').insert([{ name: category }])
      if (catError && catError.code !== '23505') { console.error('Error creating category:', catError); return }
      await loadCategories()
    }
    const { error } = await supabase.from('comments').insert([{ content: newComment, category }])
    if (error) { console.error('Error publishing comment:', error); return }
    setNewComment('')
    loadComments()
  }

  const handleLike = async (id: string) => {
    await supabase.from('comments').update({ likes: (comments.find(c => c.id === id)?.likes || 0) + 1 }).eq('id', id)
  }

  const handleReport = async (id: string) => {
    await supabase.from('comments').update({ reports: (comments.find(c => c.id === id)?.reports || 0) + 1 }).eq('id', id)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('comments').delete().eq('id', id)
  }

  const handleAdminLogin = () => {
    if (adminPassword === 'anon123') { setIsAdmin(true); setShowAdminModal(false) }
    setAdminPassword('')
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="glass rounded-2xl p-5 mb-6 flex items-center justify-between">
          {/* 左侧：品牌标识区域 */}
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black text-white tracking-tight leading-none">CWA</span>
              <span className="text-white/70 text-sm font-medium tracking-wide">China World Academy</span>
            </div>
            <h1 className="text-base font-medium text-white/80 mt-1">{t.title}</h1>
          </div>
          {/* 右侧：操作按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
              className="glass px-4 py-2 rounded-lg text-white hover:bg-white/20 transition-colors flex items-center gap-2"
            >
              <Languages size={16} />
              {language === 'zh' ? 'EN' : '中文'}
            </button>
            <button
              onClick={() => setShowAdminModal(true)}
              className="glass px-4 py-2 rounded-lg text-white hover:bg-white/20 transition-colors text-sm opacity-50 hover:opacity-100"
            >
              {t.admin}
            </button>
          </div>
        </div>

        {/* Sort Buttons */}
        <div className="glass rounded-2xl p-4 mb-4 flex gap-2 flex-wrap">
          <button
            onClick={() => setSortBy('time')}
            className={`px-4 py-2 rounded-lg text-white transition-colors flex items-center gap-2 ${
              sortBy === 'time' ? 'bg-blue-500/50 border border-blue-300/50' : 'glass hover:bg-white/20'
            }`}
          >
            <Clock size={16} />{t.timeSort}
          </button>
          <button
            onClick={() => setSortBy('hot')}
            className={`px-4 py-2 rounded-lg text-white transition-colors flex items-center gap-2 ${
              sortBy === 'hot' ? 'bg-blue-500/50 border border-blue-300/50' : 'glass hover:bg-white/20'
            }`}
          >
            <Flame size={16} />{t.hotSort}
          </button>
        </div>

        {/* Category Filter */}
        <div className="glass rounded-2xl p-4 mb-4 flex gap-2 flex-wrap">
          <button
            onClick={() => setCurrentFilter('全部')}
            className={`px-4 py-2 rounded-lg text-white transition-colors ${
              currentFilter === '全部' ? 'bg-blue-500/50 border border-blue-300/50' : 'glass hover:bg-white/20'
            }`}
          >
            全部
          </button>
          {allCategories.map((category) => (
            <button
              key={category}
              onClick={() => setCurrentFilter(category)}
              className={`px-4 py-2 rounded-lg text-white transition-colors ${
                currentFilter === category ? 'bg-blue-500/50 border border-blue-300/50' : 'glass hover:bg-white/20'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Input Area */}
        <div className="glass rounded-2xl p-5 mb-6">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder={t.placeholder}
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none mb-3"
          />
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-white/20 text-white focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {selectedCategory && !allCategories.includes(selectedCategory) && (
                  <option value={selectedCategory} className="text-gray-800">{selectedCategory}</option>
                )}
                {allCategories.map((cat) => (
                  <option key={cat} value={cat} className="text-gray-800">{cat}</option>
                ))}
                <option value="__new__" className="text-gray-400">＋ 新建标签</option>
              </select>
            </div>
            <button
              onClick={handlePublish}
              className="bg-blue-500 hover:bg-blue-400 active:bg-blue-600 px-6 py-2 rounded-lg text-white font-semibold shadow-lg shadow-blue-900/30 transition-all flex items-center gap-2"
            >
              <Send size={16} />{t.publish}
            </button>
          </div>
        </div>

        {/* Comments List */}
        <div className="space-y-3">
          {getSortedComments().map((comment) => (
            <div key={comment.id} className="glass rounded-xl p-4 border border-blue-300/20 hover:border-blue-300/40 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs bg-blue-500/30 text-blue-100 px-2 py-0.5 rounded-full border border-blue-400/30">
                  {comment.category}
                </span>
                <span className="text-white/50 text-xs flex items-center gap-1">
                  <Clock size={12} />{getRelativeTime(comment.created_at)}
                </span>
              </div>
              <p className="text-white mb-3 leading-relaxed">{comment.content}</p>
              {isControversial(comment) && (
                <div className="flex items-center gap-1 text-amber-400 text-xs mb-2">
                  <AlertTriangle size={12} />{t.controversial}
                </div>
              )}
              <div className="flex items-center gap-4 pt-2 border-t border-white/10">
                <button onClick={() => handleLike(comment.id)} className="text-white hover:text-blue-300 transition-colors flex items-center gap-1 text-sm">
                  <ThumbsUp size={14} />{comment.likes}
                </button>
                <button onClick={() => handleReport(comment.id)} className="text-white hover:text-red-300 transition-colors flex items-center gap-1 text-sm">
                  <AlertTriangle size={14} />{comment.reports}
                </button>
                {isAdmin && (
                  <button onClick={() => handleDelete(comment.id)} className="text-white hover:text-red-300 transition-colors flex items-center gap-1 text-sm ml-auto">
                    <Trash2 size={14} />{t.delete}
                  </button>
                )}
              </div>
            </div>
          ))}
          {comments.length === 0 && (
            <div className="glass rounded-xl p-8 text-center text-white/50">{t.noComments}</div>
          )}
        </div>

        {/* 新建标签 Modal */}
        {showNewCategoryModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass rounded-2xl p-6 w-80 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-bold text-lg">新建标签</h2>
                <button onClick={() => setShowNewCategoryModal(false)} className="text-white/50 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <input
                type="text"
                value={newCategoryInput}
                onChange={(e) => setNewCategoryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmNewCategory()}
                placeholder="输入标签名..."
                autoFocus
                className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
              />
              <div className="flex gap-3">
                <button onClick={handleConfirmNewCategory} className="flex-1 bg-blue-500 hover:bg-blue-400 text-white py-2 rounded-lg font-semibold transition-colors">
                  确认
                </button>
                <button onClick={() => setShowNewCategoryModal(false)} className="flex-1 glass text-white py-2 rounded-lg hover:bg-white/20 transition-colors">
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Admin Modal */}
        {showAdminModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass rounded-2xl p-6 w-80 shadow-2xl">
              <h2 className="text-white font-bold text-lg mb-4">{t.admin}</h2>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4"
              />
              <div className="flex gap-3">
                <button onClick={handleAdminLogin} className="flex-1 bg-blue-500 hover:bg-blue-400 text-white py-2 rounded-lg font-semibold transition-colors">
                  Login
                </button>
                <button onClick={() => setShowAdminModal(false)} className="flex-1 glass text-white py-2 rounded-lg hover:bg-white/20 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
