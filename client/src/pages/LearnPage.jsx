// src/pages/LearnPage.jsx
// 爆破作业员考试在线学习页面 - 主容器
// 整合章节练习、模拟考试、错题本、学习统计四大模块

import { useState, useEffect, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useQuestions } from '../hooks/useQuestions';
import { useStudyStore } from '../hooks/useStudyStore';
import { useAuth } from '../hooks/useAuth';
import ChapterPractice from './learn/ChapterPractice';
import StudyStats from './learn/StudyStats';
import LoginPage from './LoginPage';
import './LearnPage.css';

// 懒加载重量级模块，避免首屏加载时执行大量计算
const MockExam = lazy(() => import('./learn/MockExam'));
const WrongBook = lazy(() => import('./learn/WrongBook'));
const AIChatHistory = lazy(() => import('./learn/AIChatHistory'));

const TABS = [
  { key: 'practice', label: '📖 章节练习', icon: '📖' },
  { key: 'exam', label: '📝 模拟考试', icon: '📝' },
  { key: 'wrong', label: '📕 错题本', icon: '📕' },
  { key: 'aiHistory', label: '🤖 AI解析历史', icon: '🤖' },
  { key: 'stats', label: '📊 学习统计', icon: '📊' },
];

export default function LearnPage() {
  const auth = useAuth();
  const { questions, chapters, loading: questionsLoading, error, total } = useQuestions();
  const store = useStudyStore(auth.user?.username);
  const [activeTab, setActiveTab] = useState('practice');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // 进入页面时开始计时
  useEffect(() => {
    if (auth.user) {
      store.startTimer();
      return () => store.stopTimer();
    }
  }, [auth.user]);

  // 等待 auth 检查完成
  if (auth.loading) {
    return (
      <div className="learn-page">
        <div className="learn-loading">
          <div className="loading-spinner"></div>
          <p className="loading-text">正在检查登录状态...</p>
        </div>
      </div>
    );
  }

  // 未登录 → 显示登录页
  if (!auth.user) {
    return <LoginPage />;
  }

  // 总体进度
  const overallProgress = total > 0
    ? Math.round((store.completedCount / total) * 100)
    : 0;

  // 加载题库
  if (questionsLoading) {
    return (
      <div className="learn-page">
        <div className="learn-loading">
          <div className="loading-spinner"></div>
          <p className="loading-text">正在载入题库数据...</p>
          <div className="loading-skeleton">
            <div className="skeleton-line w80"></div>
            <div className="skeleton-line w60"></div>
            <div className="skeleton-line w90"></div>
            <div className="skeleton-line w40"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="learn-page">
        <div className="learn-error">
          <span className="error-icon">⚠</span>
          <p>题库数据加载失败</p>
          <p className="error-detail">{error}</p>
          <button onClick={() => window.location.reload()} className="retry-btn">重新加载</button>
        </div>
      </div>
    );
  }

  return (
    <div className="learn-page">
      {/* ======== 顶部导航栏 ======== */}
      <header className="learn-topbar">
        <div className="topbar-left">
          <Link to="/" className="topbar-home-btn" title="返回主站">
            ◀ 主站
          </Link>
          <h1 className="topbar-title">爆破作业员考试学习系统</h1>
        </div>
        <div className="topbar-center">
          <div className="topbar-progress">
            <div className="topbar-progress-bar">
              <div className="topbar-progress-fill" style={{ width: `${overallProgress}%` }}></div>
            </div>
            <span className="topbar-progress-text">
              总进度 {store.completedCount}/{total} ({overallProgress}%)
            </span>
          </div>
        </div>
        <div className="topbar-right">
          <div className="topbar-stat">
            <span className="stat-icon">✓</span>
            <span>{store.stats.totalCorrect}</span>
          </div>
          <div className="topbar-stat wrong">
            <span className="stat-icon">✗</span>
            <span>{store.wrongCount}</span>
          </div>
          <div className="topbar-user">
            <span className="user-name">👤 {auth.user.username}</span>
            <button className="logout-btn" onClick={auth.logout} title="退出登录">退出</button>
          </div>
        </div>
      </header>

      <div className="learn-body">
        {/* ======== 左侧边栏 ======== */}
        <aside className={`learn-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? '▶' : '◀'}
          </button>

          {!sidebarCollapsed && (
            <>
              {/* Tab 切换 */}
              <div className="sidebar-tabs">
                {TABS.map(tab => (
                  <button
                    key={tab.key}
                    className={`sidebar-tab ${activeTab === tab.key ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    <span className="tab-icon">{tab.icon}</span>
                    <span className="tab-label">{tab.label.replace(/^[^\s]+\s/, '')}</span>
                  </button>
                ))}
              </div>

              {/* 章节导航树 */}
              <div className="sidebar-chapters">
                <div className="sidebar-section-title">章节概览</div>
                {chapters.map(ch => {
                  const completed = ch.questions.filter(q =>
                    store.completed[`${q.chapter}_${q.id}`]
                  ).length;
                  const progress = Math.round((completed / ch.questions.length) * 100);
                  return (
                    <div key={ch.name} className="sidebar-chapter-item">
                      <div className="chapter-info">
                        <span className="chapter-label">{ch.name}</span>
                        <span className="chapter-num">{completed}/{ch.questions.length}</span>
                      </div>
                      <div className="chapter-mini-bar">
                        <div className="chapter-mini-fill" style={{ width: `${progress}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 快捷数据 */}
              <div className="sidebar-quick-stats">
                <div className="quick-stat">
                  <span className="quick-stat-label">正确率</span>
                  <span className="quick-stat-value">
                    {store.stats.totalAnswered > 0
                      ? Math.round((store.stats.totalCorrect / store.stats.totalAnswered) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="quick-stat">
                  <span className="quick-stat-label">错题</span>
                  <span className="quick-stat-value warn">{store.wrongCount}</span>
                </div>
              </div>
            </>
          )}
        </aside>

        {/* ======== 主内容区 ======== */}
        <main className="learn-main">
          {/* 移动端 Tab 切换 */}
          <div className="mobile-tabs">
            {TABS.map(tab => (
              <button
                key={tab.key}
                className={`mobile-tab ${activeTab === tab.key ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.icon}
              </button>
            ))}
          </div>

          {/* Tab 内容 */}
          <div className="learn-content">
            {activeTab === 'practice' && (
              <ChapterPractice chapters={chapters} store={store} />
            )}
            {activeTab === 'exam' && (
              <Suspense fallback={<div className="learn-loading"><div className="loading-spinner"></div><p className="loading-text">正在加载模拟考试...</p></div>}>
                <MockExam questions={questions} store={store} chapters={chapters} />
              </Suspense>
            )}
            {activeTab === 'wrong' && (
              <Suspense fallback={<div className="learn-loading"><div className="loading-spinner"></div><p className="loading-text">正在加载错题本...</p></div>}>
                <WrongBook questions={questions} store={store} chapters={chapters} />
              </Suspense>
            )}
            {activeTab === 'aiHistory' && (
              <Suspense fallback={<div className="learn-loading"><div className="loading-spinner"></div><p className="loading-text">正在加载 AI 解析历史...</p></div>}>
                <AIChatHistory store={store} questions={questions} />
              </Suspense>
            )}
            {activeTab === 'stats' && (
              <StudyStats store={store} chapters={chapters} totalQuestions={total} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
