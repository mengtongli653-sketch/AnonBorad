'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Languages, ThumbsUp, AlertTriangle, Trash2, Clock, Flame, Send } from 'lucide-react'

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
    title: 'Anonymous Message Board',
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
  const [selectedCategory, setSelectedCategory] = useState('生活')
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [customCategory, setCustomCategory] = useState('')
  const [badWords, setBadWords] = useState<string[]>([])
  const t = translations[language]

  const loadComments = useCallback(async () => {
    let query = supabase
      .from('comments')
      .select('*')

    if (currentFilter !== '全部') {
      query = query.eq('category', currentFilter)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading comments:', error)
      return
    }

    setComments(data || [])
  }, [currentFilter])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  useEffect(() => {
    const loadCategories = async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('name')

      if (error) {
        console.error('Error loading categories:', error)
        return
      }

      setAllCategories(data?.map(item => item.name) || [])
    }

    loadCategories()
  }, [])

  useEffect(() => {
    const loadBadWords = async () => {
      const { data, error } = await supabase
        .from('sensitive_words')
        .select('word')

      if (error) {
        console.error('Error loading bad words:', error)
        return
      }

      setBadWords(data?.map(item => item.word) || [])
    }

    loadBadWords()
  }, [])

  useEffect(() => {
    const subscription = supabase
      .channel('public:comments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newComment = payload.new as Comment
          if (currentFilter === '全部' || newComment.category === currentFilter) {
            loadComments()
          }
        } else {
          loadComments()
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [loadComments, currentFilter])

  const calculateHotScore = (comment: Comment) => {
    const now = new Date()
    const createdAt = new Date(comment.created_at)
    const hoursAgo = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
    return (comment.likes + comment.reports * 0.5) / (hoursAgo + 2)
  }

  const getSortedComments = () => {
    const sorted = [...comments]
    if (sortBy === 'time') {
      return sorted.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    } else {
      return sorted.sort((a, b) => calculateHotScore(b) - calculateHotScore(a))
    }
  }

  const getRelativeTime = (timestamp: string) => {
    const now = new Date()
    const past = new Date(timestamp)
    const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000)

    if (diffInSeconds < 60) return language === 'zh' ? `${diffInSeconds}秒前` : `${diffInSeconds}s ago`
    if (diffInSeconds < 3600) return language === 'zh' ? `${Math.floor(diffInSeconds / 60)}分钟前` : `${Math.floor(diffInSeconds / 60)}m ago`
    if (diffInSeconds < 86400) return language === 'zh' ? `${Math.floor(diffInSeconds / 3600)}小时前` : `${Math.floor(diffInSeconds / 3600)}h ago`
    return language === 'zh' ? `${Math.floor(diffInSeconds / 86400)}天前` : `${Math.floor(diffInSeconds / 86400)}d ago`
  }

  const isControversial = (comment: Comment) => {
    return comment.reports / (comment.likes || 1) > 0.5 && comment.reports > 5
  }

  const handlePublish = async () => {
    if (!newComment.trim()) return

    console.log('当前内容:', newComment)
    console.log('词库:', badWords)
    console.log('词库类型:', typeof badWords, '词库长度:', badWords.length)

    // 检查留言内容是否包含屏蔽词
    const containsBadWord = badWords.some(word => {
      console.log('检查词:', word, '词类型:', typeof word)
      return newComment.toLowerCase().includes(word.toLowerCase())
    })

    console.log('是否包含屏蔽词:', containsBadWord)

    if (containsBadWord) {
      alert('您的留言包含敏感词汇，请修改后发布')
      return
    }

    let finalCategory = selectedCategory

    // 处理自定义标签
    if (selectedCategory === '自定义新标签' && customCategory.trim()) {
      finalCategory = customCategory.trim()
      
      // 检查自定义标签名是否包含屏蔽词
      const categoryContainsBadWord = badWords.some(word => 
        finalCategory.toLowerCase().includes(word.toLowerCase())
      )

      if (categoryContainsBadWord) {
        alert('您的标签名包含敏感词汇，请修改后发布')
        return
      }
      
      // 检查标签是否已存在
      const { data: existingCategories } = await supabase
        .from('categories')
        .select('name')
        .eq('name', finalCategory)

      if (!existingCategories || existingCategories.length === 0) {
        // 插入新标签
        const { error: categoryError } = await supabase
          .from('categories')
          .insert([{ name: finalCategory }])

        if (categoryError) {
          console.error('Error creating new category:', categoryError)
          return
        }

        // 重新加载标签列表
        const { data: updatedCategories } = await supabase
          .from('categories')
          .select('name')
        setAllCategories(updatedCategories?.map(item => item.name) || [])
      }
    }

    const { error } = await supabase
      .from('comments')
      .insert([{ content: newComment, category: finalCategory }])

    if (error) {
      console.error('Error publishing comment:', error)
      return
    }

    setNewComment('')
    setCustomCategory('')
    loadComments()
  }

  const handleLike = async (id: string) => {
    const { error } = await supabase
      .from('comments')
      .update({ likes: (comments.find(c => c.id === id)?.likes || 0) + 1 })
      .eq('id', id)

    if (error) {
      console.error('Error liking comment:', error)
    }
  }

  const handleReport = async (id: string) => {
    const { error } = await supabase
      .from('comments')
      .update({ reports: (comments.find(c => c.id === id)?.reports || 0) + 1 })
      .eq('id', id)

    if (error) {
      console.error('Error reporting comment:', error)
    }
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting comment:', error)
    }
  }

  const handleAdminLogin = () => {
    if (adminPassword === 'anon123') {
      setIsAdmin(true)
      setShowAdminModal(false)
    }
    setAdminPassword('')
  }

  const handleDeleteCategory = async (categoryName: string) => {
    // 确认删除
    const confirmed = window.confirm('确定要删除该标签吗？这不会删除已有的留言，但该标签将不再显示。')
    if (!confirmed) return

    console.log('准备删除标签:', categoryName)

    // RLS 提醒：在生产环境中，应该启用 RLS 并确保只有管理员可以删除标签
    // 由于当前关闭了 RLS，直接执行删除操作
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('name', categoryName)

    if (error) {
      console.error('Error deleting category:', error)
      return
    }

    console.log('标签删除成功:', categoryName)

    // 更新标签列表
    const { data: updatedCategories } = await supabase
      .from('categories')
      .select('name')
    
    console.log('更新后的标签列表:', updatedCategories)
    
    // 过滤掉已删除的标签，确保界面实时刷新
    const newCategories = updatedCategories?.map(item => item.name) || []
    setAllCategories(newCategories)

    // 如果当前筛选的是被删除的标签，切换到全部
    if (currentFilter === categoryName) {
      setCurrentFilter('全部')
    }

    // 如果当前选择的是被删除的标签，切换到第一个可用标签
    if (selectedCategory === categoryName && newCategories.length > 0) {
      setSelectedCategory(newCategories[0])
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="glass rounded-2xl p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-white">{t.title}</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
                className="glass px-4 py-2 rounded-lg text-white hover:bg-white/20 transition-colors flex items-center gap-2"
              >
                <Languages size={20} />
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

          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setSortBy('time')}
              className={`glass px-4 py-2 rounded-lg text-white transition-colors flex items-center gap-2 ${sortBy === 'time' ? 'bg-white/30' : 'hover:bg-white/20'}`}
            >
              <Clock size={20} />
              {t.timeSort}
            </button>
            <button
              onClick={() => setSortBy('hot')}
              className={`glass px-4 py-2 rounded-lg text-white transition-colors flex items-center gap-2 ${sortBy === 'hot' ? 'bg-white/30' : 'hover:bg-white/20'}`}
            >
              <Flame size={20} />
              {t.hotSort}
            </button>
          </div>

          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            <button
              key="全部"
              onClick={() => setCurrentFilter('全部')}
              className={`glass px-4 py-2 rounded-lg text-white transition-colors ${currentFilter === '全部' ? 'bg-white/30' : 'hover:bg-white/20'}`}
            >
              全部
            </button>
            {allCategories.map((category) => (
              <div key={category} className="relative">
                <button
                  onClick={() => setCurrentFilter(category)}
                  className={`glass px-4 py-2 rounded-lg text-white transition-colors ${currentFilter === category ? 'bg-white/30' : 'hover:bg-white/20'}`}
                >
                  {category}
                </button>
                {isAdmin && (
                  <button
                    onClick={() => handleDeleteCategory(category)}
                    className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
                    title="删除标签"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={t.placeholder}
              className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
            />
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-white/70 text-sm mb-1">标签</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg bg-white/20 text-white focus:outline-none focus:ring-2 focus:ring-white/50 mb-2"
                >
                  {allCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                  <option value="自定义新标签">+ 自定义新标签</option>
                </select>
                {selectedCategory === '自定义新标签' && (
                  <input
                    type="text"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="请输入新标签名"
                    className="w-full px-4 py-2 rounded-lg bg-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                )}
              </div>
              <button
                onClick={handlePublish}
                className="glass px-6 py-3 rounded-lg text-white hover:bg-white/20 transition-colors flex items-center gap-2 self-end"
              >
                <Send size={20} />
                {t.publish}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {getSortedComments().map((comment) => (
            <div
              key={comment.id}
              className={`glass rounded-2xl p-6 transition-all duration-300 ${isControversial(comment) ? 'opacity-50' : ''}`}
            >
              <div className="flex justify-between items-start mb-4">
                <span className="glass px-3 py-1 rounded-full text-white text-sm">{comment.category}</span>
                <span className="text-white/70 text-sm">{getRelativeTime(comment.created_at)}</span>
              </div>
              
              <p className={`text-white mb-4 ${isControversial(comment) ? 'blur-sm' : ''}`}>
                {comment.content}
              </p>

              {isControversial(comment) && (
                <div className="flex items-center gap-2 mb-4 text-red-300">
                  <AlertTriangle size={20} />
                  <span className="font-medium">{t.controversial}</span>
                </div>
              )}

              <div className="flex justify-end items-center">
                <div className="flex gap-4">
                  <button
                    onClick={() => handleLike(comment.id)}
                    className="text-white hover:text-indigo-300 transition-colors flex items-center gap-1"
                  >
                    <ThumbsUp size={20} />
                    {comment.likes}
                  </button>
                  <button
                    onClick={() => handleReport(comment.id)}
                    className="text-white hover:text-red-300 transition-colors flex items-center gap-1"
                  >
                    <AlertTriangle size={20} />
                    {comment.reports}
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="text-white hover:text-red-300 transition-colors flex items-center gap-1"
                    >
                      <Trash2 size={20} />
                      {t.delete}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {comments.length === 0 && (
            <div className="glass rounded-2xl p-12 text-center">
              <p className="text-white/70">{t.noComments}</p>
            </div>
          )}
        </div>
      </div>

      {showAdminModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass rounded-2xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-white mb-4">{t.admin}</h2>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 rounded-lg bg-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAdminLogin}
                className="flex-1 bg-indigo-500 text-white py-2 rounded-lg hover:bg-indigo-600 transition-colors"
              >
                Login
              </button>
              <button
                onClick={() => setShowAdminModal(false)}
                className="flex-1 glass text-white py-2 rounded-lg hover:bg-white/20 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}