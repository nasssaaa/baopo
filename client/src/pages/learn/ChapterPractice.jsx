// src/pages/learn/ChapterPractice.jsx
// 章节练习模块 - 选择章节后顺序练习
// 支持：答题记录持久化、答题卡视图（按题型分组）、题型筛选

import { useState, useMemo, useCallback } from 'react';
import QuestionCard from './QuestionCard';
import { getQuestionKey } from '../../hooks/useQuestions';

export default function ChapterPractice({ chapters, store }) {
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [selectedType, setSelectedType] = useState('all'); // all | single | multi | judge
  const [viewMode, setViewMode] = useState('question'); // 'question' | 'answerSheet'
  const [currentIndex, setCurrentIndex] = useState(0);

  // 获取当前章节的题目列表
  const currentChapter = useMemo(() =>
    chapters.find(c => c.name === selectedChapter), [chapters, selectedChapter]);

  const currentQuestions = useMemo(() => {
    if (!currentChapter) return [];
    if (selectedType === 'all') return currentChapter.questions;
    if (selectedType === 'single') return currentChapter.byType.single;
    if (selectedType === 'multi') return currentChapter.byType.multi;
    if (selectedType === 'judge') return currentChapter.byType.judge;
    return currentChapter.questions;
  }, [currentChapter, selectedType]);

  const chapterKey = `${selectedChapter}_${selectedType}`;

  // 当前章节的答题记录
  const chapterAnswers = useMemo(() =>
    store.getChapterAnswers(chapterKey) || {}, [store, chapterKey]);

  // 当前题目
  const currentQuestion = currentQuestions[currentIndex];

  // 未选择章节 → 章节列表
  const handleAnswer = useCallback((questionKey, isCorrect, userAnswer) => {
    const q = currentQuestions.find(q => getQuestionKey(q) === questionKey);
    store.recordAnswer(questionKey, isCorrect, q, userAnswer);

    // 保存答题状态（包含提交结果）
    const answerData = {
      userAnswer,
      isCorrect,
      submitted: true,
    };
    // 记录到章节答题记录
    store.saveQuestionAnswer(chapterKey, questionKey, answerData);
  }, [currentQuestions, chapterKey, store]);

  // 保存当前题目的答题状态（选择时即时保存）
  const saveCurrentAnswer = useCallback((answerData) => {
    if (!currentQuestion) return;
    const key = getQuestionKey(currentQuestion);
    store.saveQuestionAnswer(chapterKey, key, answerData);
  }, [currentQuestion, chapterKey, store]);

  // 切换题目时自动保存位置
  const handleNext = useCallback(() => {
    if (currentIndex < currentQuestions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, currentQuestions.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  // 当前章节完成度
  const chapterCompletedCount = useMemo(() =>
    currentQuestions.filter(q => store.completed[getQuestionKey(q)]).length,
    [currentQuestions, store.completed]);

  // 题型分组
  const typeGroups = useMemo(() => {
    const groups = {};
    currentQuestions.forEach((q, idx) => {
      const type = q.type;
      if (!groups[type]) groups[type] = [];
      groups[type].push({ ...q, _index: idx });
    });
    return groups;
  }, [currentQuestions]);

  // 未选择章节 → 章节列表
  if (!selectedChapter) {
    return (
      <div className="chapter-select">
        <h3 className="module-title">
          <span className="title-icon">📖</span>
          选择章节开始练习
        </h3>
        <div className="chapter-list">
          {chapters.map(ch => {
            const completedCount = ch.questions.filter(q => store.completed[getQuestionKey(q)]).length;
            const progress = Math.round((completedCount / ch.questions.length) * 100);
            return (
              <div
                key={ch.name}
                className="chapter-item"
                onClick={() => {
                  setSelectedChapter(ch.name);
                  setCurrentIndex(0);
                }}
              >
                <div className="chapter-item-header">
                  <span className="chapter-name">{ch.name}</span>
                  <span className="chapter-count">{ch.questions.length} 题</span>
                </div>
                <div className="chapter-type-tags">
                  <span className="type-tag">单选 {ch.byType.single.length}</span>
                  <span className="type-tag">多选 {ch.byType.multi.length}</span>
                  <span className="type-tag">判断 {ch.byType.judge.length}</span>
                </div>
                <div className="chapter-progress-bar">
                  <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="chapter-progress-text">
                  已完成 {completedCount}/{ch.questions.length} ({progress}%)
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ======== 答题卡视图 ========
  if (viewMode === 'answerSheet') {
    return (
      <div className="chapter-practice">
        <div className="practice-header">
          <button className="back-btn" onClick={() => setSelectedChapter(null)}>◀ 返回章节</button>
          <span className="practice-title">{selectedChapter}</span>
          <span className="practice-stats">答题卡</span>
          <button className="action-btn primary" onClick={() => setViewMode('question')}>
            ← 返回答题
          </button>
        </div>

        {/* 答题卡总览 */}
        <div className="answer-sheet-overview">
          <div className="as-overview-stat">
            <span className="as-overview-num">{currentQuestions.length}</span>
            <span className="as-overview-label">总题</span>
          </div>
          <div className="as-overview-stat correct">
            <span className="as-overview-num">{chapterCompletedCount}</span>
            <span className="as-overview-label">已完成</span>
          </div>
          <div className="as-overview-stat wrong">
            <span className="as-overview-num">
              {currentQuestions.filter(q => {
                const key = getQuestionKey(q);
                const a = chapterAnswers[key];
                return a && a.submitted && !a.isCorrect;
              }).length}
            </span>
            <span className="as-overview-label">错误</span>
          </div>
          <div className="as-overview-stat">
            <span className="as-overview-num">
              {currentQuestions.filter(q => {
                const key = getQuestionKey(q);
                const a = chapterAnswers[key];
                return !a || !a.submitted;
              }).length}
            </span>
            <span className="as-overview-label">未答</span>
          </div>
        </div>

        {/* 按题型分组显示答题卡 */}
        {Object.entries(typeGroups).map(([type, qs]) => {
          const typeLabel = type === '单项选择题' ? '一、单项选择题'
            : type === '多项选择题' ? '二、多项选择题'
            : '三、判断对错题';
          const typeIcon = type === '单项选择题' ? '📝'
            : type === '多项选择题' ? '📋'
            : '⚖️';

          return (
            <div key={type} className="as-type-group">
              <div className="as-type-header">
                {typeIcon} {typeLabel}
                <span className="as-type-count">
                  {qs.filter(q => {
                    const key = getQuestionKey(q);
                    return chapterAnswers[key]?.submitted;
                  }).length}/{qs.length}
                </span>
              </div>
              <div className="as-question-grid">
                {qs.map((q) => {
                  const key = getQuestionKey(q);
                  const ans = chapterAnswers[key];
                  const submitted = ans?.submitted;
                  const isCorrect = ans?.isCorrect;
                  const isCompleted = !!store.completed[key];

                  let status = 'unanswered';
                  if (submitted && isCorrect) status = 'correct';
                  else if (submitted && !isCorrect) status = 'wrong';
                  else if (isCompleted) status = 'completed';

                  return (
                    <button
                      key={key}
                      className={`as-q-btn ${status}`}
                      onClick={() => {
                        setCurrentIndex(q._index);
                        setViewMode('question');
                      }}
                      title={
                        status === 'correct' ? '✓ 正确' :
                        status === 'wrong' ? `✗ 错误（你的答案：${ans?.userAnswer?.toUpperCase?.() || ans?.userAnswer}）` :
                        status === 'completed' ? '已完成' :
                        '未作答'
                      }
                    >
                      {q._index + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ======== 答题视图 ========
  return (
    <div className="chapter-practice">
      {/* 顶部信息栏 */}
      <div className="practice-header">
        <button className="back-btn" onClick={() => setSelectedChapter(null)}>◀ 返回章节</button>
        <span className="practice-title">{selectedChapter}</span>
        <span className="practice-stats">
          已完成 {chapterCompletedCount}/{currentQuestions.length}
        </span>
        <button className="action-btn" onClick={() => setViewMode('answerSheet')}>
          📋 答题卡
        </button>
      </div>

      {/* 题型过滤 */}
      <div className="type-filter">
        {[
          { key: 'all', label: '全部' },
          { key: 'single', label: '单选' },
          { key: 'multi', label: '多选' },
          { key: 'judge', label: '判断' },
        ].map(t => (
          <button
            key={t.key}
            className={`type-filter-btn ${selectedType === t.key ? 'active' : ''}`}
            onClick={() => {
              setSelectedType(t.key);
              setCurrentIndex(0);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 进度条 */}
      <div className="practice-progress">
        <div className="progress-bar-outer">
          <div
            className="progress-bar-inner"
            style={{ width: `${currentQuestions.length > 0 ? ((currentIndex + 1) / currentQuestions.length) * 100 : 0}%` }}
          ></div>
        </div>
      </div>

      {/* 题目卡片 */}
      {currentQuestion ? (
        <QuestionCard
          question={currentQuestion}
          onAnswer={handleAnswer}
          onNext={handleNext}
          onPrev={handlePrev}
          onBookmark={store.toggleBookmark}
          isBookmarked={!!store.bookmarks[getQuestionKey(currentQuestion)]}
          currentIndex={currentIndex}
          totalCount={currentQuestions.length}
          isCompleted={!!store.completed[getQuestionKey(currentQuestion)]}
          store={store}
          // 传入当前题目的答题记录，恢复已选答案
          initialAnswer={chapterAnswers[getQuestionKey(currentQuestion)]}
          onAnswerChange={saveCurrentAnswer}
        />
      ) : (
        <div className="empty-state">
          <p>当前分类下没有题目</p>
        </div>
      )}
    </div>
  );
}
