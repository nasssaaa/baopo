// src/pages/learn/WrongBook.jsx
// 错题本模块
// 自动收集做错的题目，支持筛选、删除、清空、练习

import { useState, useMemo } from 'react';
import QuestionCard from './QuestionCard';
import { getQuestionKey } from '../../hooks/useQuestions';

export default function WrongBook({ questions, store, chapters }) {
  const [filterChapter, setFilterChapter] = useState('all');
  const [practiceMode, setPracticeMode] = useState(false);
  const [practiceIndex, setPracticeIndex] = useState(0);

  // 获取错题列表
  const wrongQuestions = useMemo(() => {
    const wrongKeys = Object.keys(store.wrong);
    const wrongSet = new Set(wrongKeys);
    let filtered = questions.filter(q => wrongSet.has(getQuestionKey(q)));

    if (filterChapter !== 'all') {
      filtered = filtered.filter(q => {
        const chNum = q.chapter.match(/^(第[一二三四五六七八九十]+章)/)?.[1];
        return chNum === filterChapter;
      });
    }

    return filtered;
  }, [questions, store.wrong, filterChapter]);

  // 各章节的错题数量
  const chapterWrongCounts = useMemo(() => {
    const counts = {};
    const wrongKeys = new Set(Object.keys(store.wrong));
    questions.forEach(q => {
      if (wrongKeys.has(getQuestionKey(q))) {
        const chNum = q.chapter.match(/^(第[一二三四五六七八九十]+章)/)?.[1] || '其他';
        counts[chNum] = (counts[chNum] || 0) + 1;
      }
    });
    return counts;
  }, [questions, store.wrong]);

  /**
   * 处理练习模式答题
   */
  const handleAnswer = (questionKey, isCorrect, userAnswer) => {
    const question = wrongQuestions.find(q => getQuestionKey(q) === questionKey);
    store.recordAnswer(questionKey, isCorrect, question, userAnswer);
  };

  // 练习模式
  if (practiceMode && wrongQuestions.length > 0) {
    const currentQ = wrongQuestions[practiceIndex];
    if (!currentQ) {
      setPracticeMode(false);
      setPracticeIndex(0);
      return null;
    }

    return (
      <div className="wrong-practice">
        <div className="practice-header">
          <button className="back-btn" onClick={() => { setPracticeMode(false); setPracticeIndex(0); }}>
            ◀ 返回错题本
          </button>
          <span className="practice-title">错题练习</span>
        </div>
        <QuestionCard
          question={currentQ}
          onAnswer={handleAnswer}
          onNext={() => setPracticeIndex(Math.min(practiceIndex + 1, wrongQuestions.length - 1))}
          onPrev={() => setPracticeIndex(Math.max(practiceIndex - 1, 0))}
          currentIndex={practiceIndex}
          totalCount={wrongQuestions.length}
        />
      </div>
    );
  }

  return (
    <div className="wrong-book">
      <h3 className="module-title">
        <span className="title-icon">📕</span>
        错题本
        <span className="wrong-count-badge">{Object.keys(store.wrong).length}</span>
      </h3>

      {Object.keys(store.wrong).length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎉</div>
          <p>暂无错题，继续保持！</p>
          <p className="empty-hint">做错的题目会自动收集到这里</p>
        </div>
      ) : (
        <>
          {/* 章节筛选 */}
          <div className="wrong-filters">
            <button
              className={`filter-btn ${filterChapter === 'all' ? 'active' : ''}`}
              onClick={() => setFilterChapter('all')}
            >
              全部 ({Object.keys(store.wrong).length})
            </button>
            {chapters.map(ch => {
              const count = chapterWrongCounts[ch.name] || 0;
              if (count === 0) return null;
              return (
                <button
                  key={ch.name}
                  className={`filter-btn ${filterChapter === ch.name ? 'active' : ''}`}
                  onClick={() => setFilterChapter(ch.name)}
                >
                  {ch.name} ({count})
                </button>
              );
            })}
          </div>

          {/* 操作按钮 */}
          <div className="wrong-actions">
            {wrongQuestions.length > 0 && (
              <button className="action-btn primary" onClick={() => { setPracticeMode(true); setPracticeIndex(0); }}>
                练习这些错题 ({wrongQuestions.length})
              </button>
            )}
            <button className="action-btn danger" onClick={() => {
              if (window.confirm('确定要清空所有错题吗？此操作不可恢复。')) {
                store.clearAllWrong();
              }
            }}>
              清空错题本
            </button>
          </div>

          {/* 错题列表 */}
          <div className="wrong-list">
            {wrongQuestions.map((q) => {
              const key = getQuestionKey(q);
              const wrongInfo = store.wrong[key];
              return (
                <div key={key} className="wrong-item">
                  <div className="wrong-item-header">
                    <span className="wrong-item-chapter">{q.chapter}</span>
                    <span className="wrong-item-type">
                      {q.type === '单项选择题' ? '单选' : q.type === '多项选择题' ? '多选' : '判断'}
                    </span>
                    <button
                      className="wrong-item-delete"
                      onClick={() => store.removeWrong(key)}
                      title="移除这道错题"
                    >
                      ×
                    </button>
                  </div>
                  <p className="wrong-item-question">{q.question}</p>
                  <div className="wrong-item-answers">
                    <span className="user-answer">你的答案：{wrongInfo?.userAnswer?.toUpperCase()}</span>
                    <span className="correct-answer">正确答案：{q.answer.toUpperCase()}</span>
                  </div>
                  <button
                    className="wrong-item-practice"
                    onClick={() => {
                      const idx = wrongQuestions.findIndex(wq => getQuestionKey(wq) === key);
                      setPracticeIndex(idx >= 0 ? idx : 0);
                      setPracticeMode(true);
                    }}
                  >
                    练习此题 →
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
