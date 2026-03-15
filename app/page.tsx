'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import {
  Languages, ThumbsUp, AlertTriangle, Trash2, Clock, Flame,
  Send, X, Pin, PinOff, MessageCircle, Sun, Moon, BarChart2
} from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const MAX_CHARS = 200
const ANTI_SPAM_MS = 60000

interface Comment {
  id: string
  content: string
  likes: number
  reports: number
  created_at: string
  category: string
  pinned: boolean
  parent_id: string | null
}

interface Translations {
  title: string; placeholder: string; publish: string
  timeSort: string; hotSort: string; likes: string; reports: string
  delete: string; admin: string; controversial: string; noComments: string
}

const translations: Record<string, Translations> = {
  zh: {
    title: '匿名留言板', placeholder: '请输入留言内容...', publish: '发布',
    timeSort: '时间排序', hotSort: '热度排序', likes: '点赞', reports: '举报',
    delete: '删除', admin: '管理员', controversial: '内容争议', noComments: '暂无留言',
  },
  en: {
    title: '匿名留言板', placeholder: 'Enter your message...', publish: 'Publish',
    timeSort: 'Time Sort', hotSort: 'Hot Sort', likes: 'Likes', reports: 'Reports',
    delete: 'Delete', admin: 'Admin', controversial: 'Controversial Content', noComments: 'No comments yet',
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
  const [isDark, setIsDark] = useState(true)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [lastSubmission, setLastSubmission] = useState<{ content: string; time: number } | null>(null)
  const [showHeatmap, setShowHeatmap] = useState(false)
  // ── 已点赞/已举报状态（同步 localStorage）──
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set())
  const t = translations[language]

  // ── 初始化：从 localStorage 恢复点赞/举报记录 ──
  useEffect(() => {
    const liked = Object.keys(localStorage)
      .filter(k => k.startsWith('liked_'))
      .map(k => k.replace('liked_', ''))
    const reported = Object.keys(localStorage)
      .filter(k => k.startsWith('reported_'))
      .map(k => k.replace('reported_', ''))
    setLikedIds(new Set(liked))
    setReportedIds(new Set(reported))
  }, [])

  // ── 主题配置 ──
  const th = isDark ? {
    bg: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #0ea5e9 100%)',
    text: 'text-white', textSub: 'text-white/70', textMuted: 'text-white/50',
    glass: 'glass', input: 'bg-white/20 text-white placeholder-white/50',
    select: 'bg-white/20 text-white',
    badge: 'bg-blue-500/30 text-blue-100 border-blue-400/30',
    activeBtn: 'bg-blue-500/50 border border-blue-300/50 text-white',
    inactBtn: 'glass text-white hover:bg-white/20',
    divider: 'border-white/10',
    heatEmpty: 'bg-white/10', heat1: 'bg-blue-300/50', heat2: 'bg-blue-400/70', heat3: 'bg-blue-400',
  } : {
    bg: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 50%, #bfdbfe 100%)',
    text: 'text-blue-950', textSub: 'text-blue-700', textMuted: 'text-blue-400',
    glass: 'glass-light', input: 'bg-white/80 text-blue-950 placeholder-blue-300',
    select: 'bg-white/80 text-blue-900',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    activeBtn: 'bg-blue-500 border border-blue-600 text-white',
    inactBtn: 'glass-light text-blue-800 hover:bg-blue-100',
    divider: 'border-blue-200',
    heatEmpty: 'bg-blue-100', heat1: 'bg-blue-200', heat2: 'bg-blue-400', heat3: 'bg-blue-600',
  }

  const loadCategories = useCallback(async () => {
    const { data, error } = await supabase.from('categories').select('name').order('created_at', { ascending: true })
    if (error) { console.error('Error loading categories:', error); return }
    const names = (data || []).map((row: { name: string }) => row.name)
    setAllCategories(names)
    if (names.length > 0 && !selectedCategory) setSelectedCategory(names[0])
  }, [selectedCategory])

  const loadBadWords = useCallback(async () => {
    const { data } = await supabase.from('sensitive_words').select('word')
    setBadWords((data || []).map((row: { word: string }) => row.word))
  }, [])

  const loadComments = useCallback(async () => {
    const { data, error } = await supabase.from('comments').select('*').order('created_at', { ascending: false })
    if (error) { console.error('Error loading comments:', error); return }
    setComments(data || [])
  }, [])

  useEffect(() => { loadComments(); loadBadWords(); loadCategories() }, [loadComments, loadBadWords, loadCategories])

  useEffect(() => {
    const sub = supabase.channel('public:comments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => loadComments())
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [loadComments])

  useEffect(() => {
    const sub = supabase.channel('public:sensitive_words')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sensitive_words' }, () => loadBadWords())
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [loadBadWords])

  useEffect(() => {
    const sub = supabase.channel('public:categories')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => loadCategories())
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [loadCategories])

  const calculateHotScore = (c: Comment) => {
    const hoursAgo = (Date.now() - new Date(c.created_at).getTime()) / 3600000
    return (c.likes + c.reports * 0.5) / (hoursAgo + 2)
  }

  const getTopLevelComments = () => {
    let list = comments.filter(c => !c.parent_id)
    if (currentFilter !== '全部') list = list.filter(c => c.category === currentFilter)
    if (sortBy === 'time') list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    else list.sort((a, b) => calculateHotScore(b) - calculateHotScore(a))
    return list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
  }

  const getReplies = (parentId: string) =>
    comments.filter(c => c.parent_id === parentId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const getCategoryCount = (cat: string) =>
    comments.filter(c => !c.parent_id && (cat === '全部' || c.category === cat)).length

  const getRelativeTime = (ts: string) => {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
    if (diff < 60) return language === 'zh' ? `${diff}秒前` : `${diff}s ago`
    if (diff < 3600) return language === 'zh' ? `${Math.floor(diff / 60)}分钟前` : `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return language === 'zh' ? `${Math.floor(diff / 3600)}小时前` : `${Math.floor(diff / 3600)}h ago`
    return language === 'zh' ? `${Math.floor(diff / 86400)}天前` : `${Math.floor(diff / 86400)}d ago`
  }

  const isControversial = (c: Comment) => c.reports / (c.likes || 1) > 0.5 && c.reports > 5

  const getHeatmapData = () =>
    Array.from({ length: 35 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (34 - i))
      const dateStr = d.toISOString().split('T')[0]
      return { dateStr, count: comments.filter(c => c.created_at.startsWith(dateStr)).length }
    })

  const heatColor = (count: number) => {
    if (count === 0) return th.heatEmpty
    if (count === 1) return th.heat1
    if (count <= 3) return th.heat2
    return th.heat3
  }

  const handleCategoryChange = (value: string) => {
    if (value === '__new__') { setNewCategoryInput(''); setShowNewCategoryModal(true) }
    else setSelectedCategory(value)
  }

  const handleConfirmNewCategory = () => {
    const trimmed = newCategoryInput.trim()
    if (!trimmed) return
    setSelectedCategory(trimmed)
    setShowNewCategoryModal(false)
    setNewCategoryInput('')
  }

  const handlePublish = async () => {
    if (!newComment.trim() || newComment.length > MAX_CHARS) return
    const now = Date.now()
    if (lastSubmission && lastSubmission.content === newComment.trim() && now - lastSubmission.time < ANTI_SPAM_MS) {
      alert('请勿在60秒内重复发送相同内容'); return
    }
    const hitWord = badWords.find(w => newComment.toLowerCase().includes(w.toLowerCase()))
    if (hitWord) { alert('内容包含违禁词，请文明发言'); return }
    const category = selectedCategory.trim()
    if (!category) { alert('请选择或创建一个标签'); return }
    if (!allCategories.includes(category)) {
      const { error: ce } = await supabase.from('categories').insert([{ name: category }])
      if (ce && ce.code !== '23505') { console.error(ce); return }
      await loadCategories()
    }
    const { error } = await supabase.from('comments').insert([{ content: newComment, category, pinned: false, parent_id: null }])
    if (error) { console.error(error); return }
    setLastSubmission({ content: newComment.trim(), time: now })
    setNewComment('')
    loadComments()
  }

  const handleReply = async (parentId: string) => {
    if (!replyContent.trim() || replyContent.length > MAX_CHARS) return
    const hitWord = badWords.find(w => replyContent.toLowerCase().includes(w.toLowerCase()))
    if (hitWord) { alert('内容包含违禁词，请文明发言'); return }
    const parent = comments.find(c => c.id === parentId)
    const { error } = await supabase.from('comments').insert([{
      content: replyContent, category: parent?.category || '', pinned: false, parent_id: parentId
    }])
    if (error) { console.error(error); return }
    setReplyContent('')
    setReplyingTo(null)
    loadComments()
  }

  // ── 防刷：localStorage 记录 ──
  const handleLike = async (id: string) => {
    const key = `liked_${id}`
    if (localStorage.getItem(key)) {
      alert('你已经点过赞了'); return
    }
    await supabase.from('comments')
      .update({ likes: (comments.find(c => c.id === id)?.likes || 0) + 1 })
      .eq('id', id)
    localStorage.setItem(key, '1')
    setLikedIds(prev => new Set([...prev, id]))
  }

  const handleReport = async (id: string) => {
    const key = `reported_${id}`
    if (localStorage.getItem(key)) {
      alert('你已经举报过了'); return
    }
    await supabase.from('comments')
      .update({ reports: (comments.find(c => c.id === id)?.reports || 0) + 1 })
      .eq('id', id)
    localStorage.setItem(key, '1')
    setReportedIds(prev => new Set([...prev, id]))
  }

  const handlePin = async (id: string, pinned: boolean) => {
    await supabase.from('comments').update({ pinned: !pinned }).eq('id', id)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('comments').delete().eq('id', id)
  }

  const handleAdminLogin = () => {
    if (adminPassword === 'anon123') { setIsAdmin(true); setShowAdminModal(false) }
    setAdminPassword('')
  }

  const topLevelComments = getTopLevelComments()
  const totalCount = getCategoryCount('全部')

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: th.bg }}>
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className={`${th.glass} rounded-2xl p-5 mb-6 flex items-center justify-between`}>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className={`text-5xl font-black ${th.text} tracking-tight leading-none`}>CWA</span>
              <span className={`${th.textSub} text-sm font-medium tracking-wide`}>China World Academy</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <h1 className={`text-base font-medium ${th.textSub}`}>{t.title}</h1>
              <span className={`text-xs ${th.textMuted}`}>· {totalCount} 条留言</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsDark(!isDark)} className={`${th.glass} p-2 rounded-lg ${th.text} hover:bg-white/20 transition-colors`}>
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')} className={`${th.glass} px-4 py-2 rounded-lg ${th.text} hover:bg-white/20 transition-colors flex items-center gap-2`}>
              <Languages size={16} />{language === 'zh' ? 'EN' : '中文'}
            </button>
            <button onClick={() => setShowAdminModal(true)} className={`${th.glass} px-4 py-2 rounded-lg ${th.text} hover:bg-white/20 transition-colors text-sm opacity-50 hover:opacity-100`}>
              {t.admin}
            </button>
          </div>
        </div>

        {/* Sort Buttons */}
        <div className={`${th.glass} rounded-2xl p-4 mb-4 flex gap-2 flex-wrap`}>
          <button onClick={() => setSortBy('time')} className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${sortBy === 'time' ? th.activeBtn : th.inactBtn}`}>
            <Clock size={16} />{t.timeSort}
          </button>
          <button onClick={() => setSortBy('hot')} className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${sortBy === 'hot' ? th.activeBtn : th.inactBtn}`}>
            <Flame size={16} />{t.hotSort}
          </button>
          <button onClick={() => setShowHeatmap(!showHeatmap)} className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${showHeatmap ? th.activeBtn : th.inactBtn} ml-auto`}>
            <BarChart2 size={16} />热力图
          </button>
        </div>

        {/* Heatmap */}
        {showHeatmap && (
          <div className={`${th.glass} rounded-2xl p-4 mb-4`}>
            <p className={`text-xs ${th.textMuted} mb-2`}>近35天发帖活跃度</p>
            <div className="grid grid-cols-7 gap-1">
              {getHeatmapData().map(({ dateStr, count }) => (
                <div key={dateStr} title={`${dateStr}: ${count}条`}
                  className={`h-6 rounded ${heatColor(count)} transition-colors cursor-default`} />
              ))}
            </div>
            <div className={`flex items-center gap-2 mt-2 text-xs ${th.textMuted}`}>
              <span>少</span>
              <div className={`w-4 h-4 rounded ${th.heatEmpty}`} /><div className={`w-4 h-4 rounded ${th.heat1}`} />
              <div className={`w-4 h-4 rounded ${th.heat2}`} /><div className={`w-4 h-4 rounded ${th.heat3}`} />
              <span>多</span>
            </div>
          </div>
        )}

        {/* Category Filter */}
        <div className={`${th.glass} rounded-2xl p-4 mb-4 flex gap-2 flex-wrap`}>
          {['全部', ...allCategories].map((cat) => (
            <button key={cat} onClick={() => setCurrentFilter(cat)}
              className={`px-4 py-2 rounded-lg transition-colors ${currentFilter === cat ? th.activeBtn : th.inactBtn}`}>
              {cat}<span className="ml-1 text-xs opacity-60">({getCategoryCount(cat)})</span>
            </button>
          ))}
        </div>

        {/* Input Area */}
        <div className={`${th.glass} rounded-2xl p-5 mb-6`}>
          <div className="relative mb-3">
            <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)}
              placeholder={t.placeholder} rows={3} maxLength={MAX_CHARS}
              className={`w-full px-4 py-3 rounded-lg ${th.input} focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none`} />
            <span className={`absolute bottom-2 right-3 text-xs ${newComment.length > MAX_CHARS * 0.9 ? 'text-red-400' : th.textMuted}`}>
              {newComment.length}/{MAX_CHARS}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <select value={selectedCategory} onChange={(e) => handleCategoryChange(e.target.value)}
                className={`w-full px-4 py-2 rounded-lg ${th.select} focus:outline-none focus:ring-2 focus:ring-blue-300`}>
                {selectedCategory && !allCategories.includes(selectedCategory) && (
                  <option value={selectedCategory} className="text-gray-800">{selectedCategory}</option>
                )}
                {allCategories.map((cat) => (
                  <option key={cat} value={cat} className="text-gray-800">{cat}</option>
                ))}
                <option value="__new__" className="text-gray-400">＋ 新建标签</option>
              </select>
            </div>
            <button onClick={handlePublish} disabled={newComment.length > MAX_CHARS}
              className="bg-blue-500 hover:bg-blue-400 active:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-2 rounded-lg text-white font-semibold shadow-lg shadow-blue-900/30 transition-all flex items-center gap-2">
              <Send size={16} />{t.publish}
            </button>
          </div>
        </div>

        {/* Comments List */}
        <div className="space-y-3">
          {topLevelComments.map((comment) => (
            <div key={comment.id}>
              <div className={`${th.glass} rounded-xl p-4 border ${comment.pinned ? 'border-yellow-400/50' : 'border-blue-300/20 hover:border-blue-300/40'} transition-all`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${th.badge} px-2 py-0.5 rounded-full border`}>{comment.category}</span>
                    {comment.pinned && <span className="text-xs text-yellow-400 flex items-center gap-1"><Pin size={10} />置顶</span>}
                  </div>
                  <span className={`${th.textMuted} text-xs flex items-center gap-1`}>
                    <Clock size={12} />{getRelativeTime(comment.created_at)}
                  </span>
                </div>
                <p className={`${th.text} mb-3 leading-relaxed`}>{comment.content}</p>
                {isControversial(comment) && (
                  <div className="flex items-center gap-1 text-amber-400 text-xs mb-2">
                    <AlertTriangle size={12} />{t.controversial}
                  </div>
                )}
                <div className={`flex items-center gap-4 pt-2 border-t ${th.divider}`}>
                  <button onClick={() => handleLike(comment.id)}
                    className={`transition-colors flex items-center gap-1 text-sm ${likedIds.has(comment.id) ? 'text-blue-400 cursor-default' : `${th.text} hover:text-blue-300`}`}>
                    <ThumbsUp size={14} />{comment.likes}
                    {likedIds.has(comment.id) && <span className="text-xs opacity-60">✓</span>}
                  </button>
                  <button onClick={() => handleReport(comment.id)}
                    className={`transition-colors flex items-center gap-1 text-sm ${reportedIds.has(comment.id) ? 'text-red-400 cursor-default' : `${th.text} hover:text-red-300`}`}>
                    <AlertTriangle size={14} />{comment.reports}
                    {reportedIds.has(comment.id) && <span className="text-xs opacity-60">✓</span>}
                  </button>
                  <button onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                    className={`${th.text} hover:text-blue-300 transition-colors flex items-center gap-1 text-sm`}>
                    <MessageCircle size={14} />回复{getReplies(comment.id).length > 0 && ` (${getReplies(comment.id).length})`}
                  </button>
                  {isAdmin && (
                    <div className="ml-auto flex items-center gap-2">
                      <button onClick={() => handlePin(comment.id, comment.pinned)} className={`${th.text} hover:text-yellow-300 transition-colors`}>
                        {comment.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                      </button>
                      <button onClick={() => handleDelete(comment.id)} className={`${th.text} hover:text-red-300 transition-colors flex items-center gap-1 text-sm`}>
                        <Trash2 size={14} />{t.delete}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 回复列表 */}
              {getReplies(comment.id).length > 0 && (
                <div className="ml-6 mt-1 space-y-1">
                  {getReplies(comment.id).map((reply) => (
                    <div key={reply.id} className={`${th.glass} rounded-xl px-4 py-3 border border-blue-300/10`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs ${th.textMuted}`}>↩ 回复</span>
                        <span className={`${th.textMuted} text-xs`}>{getRelativeTime(reply.created_at)}</span>
                      </div>
                      <p className={`${th.text} text-sm leading-relaxed`}>{reply.content}</p>
                      <div className={`flex items-center gap-3 pt-2 border-t ${th.divider} mt-2`}>
                        <button onClick={() => handleLike(reply.id)}
                          className={`transition-colors flex items-center gap-1 text-xs ${likedIds.has(reply.id) ? 'text-blue-400 cursor-default' : `${th.text} hover:text-blue-300`}`}>
                          <ThumbsUp size={12} />{reply.likes}
                          {likedIds.has(reply.id) && <span className="opacity-60">✓</span>}
                        </button>
                        {isAdmin && (
                          <button onClick={() => handleDelete(reply.id)} className={`${th.text} hover:text-red-300 transition-colors flex items-center gap-1 text-xs ml-auto`}>
                            <Trash2 size={12} />{t.delete}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 回复输入框 */}
              {replyingTo === comment.id && (
                <div className="ml-6 mt-1">
                  <div className={`${th.glass} rounded-xl p-3`}>
                    <div className="relative mb-2">
                      <textarea value={replyContent} onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="输入回复内容..." rows={2} maxLength={MAX_CHARS} autoFocus
                        className={`w-full px-3 py-2 rounded-lg ${th.input} focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none text-sm`} />
                      <span className={`absolute bottom-2 right-3 text-xs ${th.textMuted}`}>
                        {replyContent.length}/{MAX_CHARS}
                      </span>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setReplyingTo(null); setReplyContent('') }}
                        className={`${th.glass} px-3 py-1 rounded-lg ${th.text} hover:bg-white/20 text-sm transition-colors`}>取消</button>
                      <button onClick={() => handleReply(comment.id)} disabled={replyContent.length > MAX_CHARS}
                        className="bg-blue-500 hover:bg-blue-400 disabled:opacity-40 px-4 py-1 rounded-lg text-white text-sm font-medium transition-colors flex items-center gap-1">
                        <Send size={12} />发送
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {topLevelComments.length === 0 && (
            <div className={`${th.glass} rounded-xl p-8 text-center ${th.textMuted}`}>{t.noComments}</div>
          )}
        </div>

        {/* 新建标签 Modal */}
        {showNewCategoryModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass rounded-2xl p-6 w-80 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-bold text-lg">新建标签</h2>
                <button onClick={() => setShowNewCategoryModal(false)} className="text-white/50 hover:text-white"><X size={20} /></button>
              </div>
              <input type="text" value={newCategoryInput} onChange={(e) => setNewCategoryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmNewCategory()}
                placeholder="输入标签名..." autoFocus
                className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4" />
              <div className="flex gap-3">
                <button onClick={handleConfirmNewCategory} className="flex-1 bg-blue-500 hover:bg-blue-400 text-white py-2 rounded-lg font-semibold transition-colors">确认</button>
                <button onClick={() => setShowNewCategoryModal(false)} className="flex-1 glass text-white py-2 rounded-lg hover:bg-white/20 transition-colors">取消</button>
              </div>
            </div>
          </div>
        )}

        {/* Admin Modal */}
        {showAdminModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass rounded-2xl p-6 w-80 shadow-2xl">
              <h2 className="text-white font-bold text-lg mb-4">{t.admin}</h2>
              <input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-300 mb-4" />
              <div className="flex gap-3">
                <button onClick={handleAdminLogin} className="flex-1 bg-blue-500 hover:bg-blue-400 text-white py-2 rounded-lg font-semibold transition-colors">Login</button>
                <button onClick={() => setShowAdminModal(false)} className="flex-1 glass text-white py-2 rounded-lg hover:bg-white/20 transition-colors">Cancel</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
