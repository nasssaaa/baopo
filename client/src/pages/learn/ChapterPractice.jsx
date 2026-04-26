// src/pages/learn/ChapterPractice.jsx
// 章节练习模块 - 选择章节后顺序练习

import { useState, useMemo } from 'react';
import QuestionCard from './QuestionCard';
import { getQuestionKey } from '../../hooks/useQuestions';

export default function ChapterPractice({ chapters, store }) {
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [selectedType, setSelectedType] = useState('all'); // all | single | multi | judge

  // 获取当前章节的题目列表
  const currentQuestions = useMemo(() => {
    if (!selectedChapter) return [];
    const chapter = chapters.find(c => c.name === selectedChapter);
    if (!chapter) return [];

    if (selectedType === 'all') return chapter.questions;
    if (selectedType === 'single') return chapter.byType.single;
    if (selectedType === 'multi') return chapter.byType.multi;
    if (selectedType === 'judge') return chapter.byType.judge;
    return chapter.questions;
  }, [selectedChapter, selectedType, chapters]);

  // 当前练习索引
  const progressKey = `${selectedChapter}_${selectedType}`;
  const currentIndex = store.getPracticeIndex(progressKey);

  const setCurrentIndex = (idx) => {
    store.setPracticeIndex(progressKey, idx);
  };

  const currentQuestion = currentQuestions[currentIndex];

  // 当前章节完成度
  const chapterCompletedCount = useMemo(() => {
    return currentQuestions.filter(q => store.completed[getQuestionKey(q)]).length;
  }, [currentQuestions, store.completed]);

  /**
   * 处理答题
   */
  const handleAnswer = (questionKey, isCorrect, userAnswer) => {
    const question = currentQuestions.find(q => getQuestionKey(q) === questionKey);
    store.recordAnswer(questionKey, isCorrect, question, userAnswer);
  };

  // 未选择章节 → 显示章节选择列表
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
                onClick={() => setSelectedChapter(ch.name)}
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

  // 已选择章节 → 练习界面
  return (
    <div className="chapter-practice">
      {/* 顶部信息栏 */}
      <div className="practice-header">
        <button className="back-btn" onClick={() => setSelectedChapter(null)}>
          ◀ 返回章节
        </button>
        <span className="practice-title">{selectedChapter}</span>
        <span className="practice-stats">
          已完成 {chapterCompletedCount}/{currentQuestions.length}
        </span>
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
              // 重置到该类型的进度
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
          onNext={() => setCurrentIndex(Math.min(currentIndex + 1, currentQuestions.length - 1))}
          onPrev={() => setCurrentIndex(Math.max(currentIndex - 1, 0))}
          onBookmark={store.toggleBookmark}
          isBookmarked={!!store.bookmarks[getQuestionKey(currentQuestion)]}
          currentIndex={currentIndex}
          totalCount={currentQuestions.length}
          isCompleted={!!store.completed[getQuestionKey(currentQuestion)]}
        />
      ) : (
        <div className="empty-state">
          <p>🎉 当前分类下没有题目</p>
        </div>
      )}
    </div>
  );
}
