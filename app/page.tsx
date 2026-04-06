'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Send, ThumbsUp, AlertTriangle, Trash2, Clock, Flame, Languages } from 'lucide-react'
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
  const [language, setLanguage] = useState<'zh' | 'en'>('zh')
  const [sortBy, setSortBy] = useState<'time' | 'hot'>('time')
  const [loading, setLoading] = useState(true)

  const t = language === 'zh'
    ? {
        title: 'CWA 匿名留言板',
        placeholder: '在这里自由表达你的观点...',
        publish: '发布',
        timeSort: '最新',
        hotSort: '最热',
        admin: '管理员',
        noComments: '暂无留言，快来发布第一条吧！'
      }
    : {
        title: 'CWA Anonymous Message Board',
        placeholder: 'Share your thoughts anonymously...',
        publish: 'Publish',
        timeSort: 'Latest',
        hotSort: 'Hot',
        admin: 'Admin',
        noComments: 'No messages yet. Be the first to post!'
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
      const { data } = await supabase
        .from('comments')
        .select('*')
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
      setComments(data || [])
      setLoading(false)
    }

    loadComments()

    const channel = supabase.channel('comments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, loadComments)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    const loadCategories = async () => {
      const { data } = await supabase.from('categories').select('name')
      setAllCategories(data?.map(c => c.name) || ['生活', '学习', '校园'])
    }
    loadCategories()
  }, [])

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
          <Image src="/