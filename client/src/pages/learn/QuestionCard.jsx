// src/pages/learn/QuestionCard.jsx
// 共享答题卡组件
// 支持三种题型：单选、多选、判断
// 练习模式：提交后显示正确/错误高亮 + AI 解析
// 考试模式（examMode）：只选择不提交，不显示对错
// 支持答题记录持久化（initialAnswer + onAnswerChange）

import { useState, useEffect } from 'react';
import QuestionAI from './QuestionAI';
import { getQuestionKey } from '../../hooks/useQuestions';

export default function QuestionCard({
  question,
  onAnswer,
  onNext,
  onPrev,
  onBookmark,
  isBookmarked,
  showNavigation = true,
  currentIndex,
  totalCount,
  isCompleted,
  examMode = false,
  examAnswer = '',
  onExamSelect,
  store,
  initialAnswer,   // 章节练习：从持久化记录恢复答案
  onAnswerChange,  // 章节练习：选择变化时通知父组件保存
}) {
  const [selected, setSelected] = useState('');
  const [multiSelected, setMultiSelected] = useState(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(null);

  // 题目变化时重置状态，或恢复已有答题记录
  useEffect(() => {
    const key = getQuestionKey(question);

    if (examMode && examAnswer) {
      // 考试模式：恢复已选答案
      setSubmitted(false);
      setIsCorrect(null);
      if (question.type === '多项选择题') {
        setMultiSelected(new Set(examAnswer.split('')));
        setSelected('');
      } else {
        setSelected(examAnswer);
        setMultiSelected(new Set());
      }
    } else if (initialAnswer) {
      // 练习模式：恢复已有答题记录
      setSubmitted(!!initialAnswer.submitted);
      setIsCorrect(initialAnswer.isCorrect ?? null);
      if (initialAnswer.submitted) {
        if (question.type === '多项选择题') {
          setMultiSelected(new Set((initialAnswer.userAnswer || '').split('')));
          setSelected('');
        } else {
          setSelected(initialAnswer.userAnswer || '');
          setMultiSelected(new Set());
        }
      } else {
        // 选了但没提交，恢复已选
        if (question.type === '多项选择题') {
          const s = initialAnswer.selectedMulti;
          setMultiSelected(s ? new Set(s) : new Set());
          setSelected('');
        } else {
          setSelected(initialAnswer.selectedSingle || '');
          setMultiSelected(new Set());
        }
      }
    } else {
      // 全新题目
      setSubmitted(false);
      setIsCorrect(null);
      setSelected('');
      setMultiSelected(new Set());
    }
  }, [question, examMode, examAnswer, initialAnswer]);

  const questionKey = getQuestionKey(question);
  const type = question.type;
  const options = question.options || {};
  const optionKeys = Object.keys(options);
  const correctAnswer = question.answer;

  // 通知父组件保存答题状态
  const notifyAnswerChange = (newSelected, newMulti) => {
    if (!onAnswerChange) return;
    const userAnswer = type === '多项选择题'
      ? Array.from(newMulti).sort().join('')
      : newSelected;
    onAnswerChange({
      selectedSingle: type !== '多项选择题' ? newSelected : undefined,
      selectedMulti: type === '多项选择题' ? Array.from(newMulti) : undefined,
      userAnswer,
      submitted: false,
      isCorrect: undefined,
    });
  };

  const handleExamSelect = (answer) => {
    if (onExamSelect) onExamSelect(questionKey, answer);
  };

  const handleSingleSelect = (key) => {
    if (submitted) return;
    setSelected(key);
    notifyAnswerChange(key, new Set());
    if (examMode) handleExamSelect(key);
  };

  const handleJudgeSelect = (val) => {
    if (submitted) return;
    setSelected(val);
    notifyAnswerChange(val, new Set());
    if (examMode) handleExamSelect(val);
  };

  const toggleMultiOption = (key) => {
    if (submitted) return;
    setMultiSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      notifyAnswerChange('', next);
      if (examMode) handleExamSelect(Array.from(next).sort().join(''));
      return next;
    });
  };

  const handleSubmit = () => {
    if (submitted || examMode) return;
    let userAnswer = '';
    let correct = false;
    if (type === '单项选择题' || type === '判断对错题') {
      userAnswer = selected;
      correct = selected === correctAnswer;
    } else if (type === '多项选择题') {
      userAnswer = Array.from(multiSelected).sort().join('');
      correct = userAnswer === correctAnswer;
    }
    if (!userAnswer) return;
    setSubmitted(true);
    setIsCorrect(correct);
    if (onAnswer) onAnswer(questionKey, correct, userAnswer);
    // 保存提交结果
    if (onAnswerChange) {
      onAnswerChange({ userAnswer, submitted: true, isCorrect: correct });
    }
  };

  const getOptionClass = (key) => {
    if (!submitted) {
      if (type === '多项选择题') return multiSelected.has(key) ? 'option-selected' : '';
      return selected === key ? 'option-selected' : '';
    }
    const isInCorrectAnswer = correctAnswer.includes(key);
    const isUserSelected = type === '多项选择题' ? multiSelected.has(key) : selected === key;
    if (isInCorrectAnswer) return 'option-correct';
    if (isUserSelected && !isInCorrectAnswer) return 'option-wrong';
    return '';
  };

  const getJudgeClass = (val) => {
    if (!submitted) return selected === val ? 'option-selected' : '';
    if (val === correctAnswer) return 'option-correct';
    if (selected === val && val !== correctAnswer) return 'option-wrong';
    return '';
  };

  const canSubmit = !submitted && !examMode && (
    (type === '判断对错题' && selected) ||
    (type === '单项选择题' && selected) ||
    (type === '多项选择题' && multiSelected.size >= 2)
  );

  const userAnswerText = type === '多项选择题'
    ? Array.from(multiSelected).sort().join('')
    : selected;

  return (
    <div className="question-card">
      <div className="question-header">
        <div className="question-meta">
          <span className="question-type-badge">
            {type === '单项选择题' ? '📝 单选' : type === '多项选择题' ? '📋 多选' : '⚖️ 判断'}
          </span>
          <span className="question-chapter">{question.chapter}</span>
          {showNavigation && totalCount && (
            <span className="question-progress">{currentIndex + 1} / {totalCount}</span>
          )}
          {initialAnswer?.submitted && (
            <span className={`submitted-indicator ${initialAnswer.isCorrect ? 'correct' : 'wrong'}`}>
              {initialAnswer.isCorrect ? '✓ 已答对' : '✗ 已答错'}
            </span>
          )}
        </div>
        {onBookmark && (
          <button
            className={`bookmark-btn ${isBookmarked ? 'active' : ''}`}
            onClick={() => onBookmark(questionKey)}
            title={isBookmarked ? '取消标记' : '标记本题'}
          >
            {isBookmarked ? '★' : '☆'}
          </button>
        )}
      </div>

      <div className="question-body">
        <p className="question-text">{question.question}</p>
        {type === '多项选择题' && !submitted && (
          <p className="question-hint">（多选题，至少选 2 个）</p>
        )}
      </div>

      <div className="question-options">
        {type === '判断对错题' ? (
          <div className="judge-options">
            <button
              className={`judge-btn judge-correct ${getJudgeClass('√')}`}
              onClick={() => handleJudgeSelect('√')}
              disabled={submitted}
            >
              ✓ 正确
            </button>
            <button
              className={`judge-btn judge-wrong ${getJudgeClass('×')}`}
              onClick={() => handleJudgeSelect('×')}
              disabled={submitted}
            >
              ✗ 错误
            </button>
          </div>
        ) : (
          <div className="choice-options">
            {optionKeys.map(key => (
              <div
                key={key}
                className={`choice-option ${getOptionClass(key)}`}
                onClick={() => {
                  if (submitted) return;
                  if (type === '单项选择题') handleSingleSelect(key);
                  else toggleMultiOption(key);
                }}
              >
                <span className="option-indicator">
                  {type === '多项选择题' ? (
                    <span className={`checkbox ${multiSelected.has(key) ? 'checked' : ''}`}>
                      {multiSelected.has(key) ? '☑' : '☐'}
                    </span>
                  ) : (
                    <span className={`radio ${selected === key ? 'checked' : ''}`}>
                      {selected === key ? '◉' : '○'}
                    </span>
                  )}
                </span>
                <span className="option-key">{key.toUpperCase()}.</span>
                <span className="option-text">{options[key]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 练习模式：提交按钮 + 结果 */}
      {!examMode && (
        <div className="question-actions">
          {!submitted ? (
            <button className="submit-btn" onClick={handleSubmit} disabled={!canSubmit}>
              提交答案
            </button>
          ) : (
            <div className={`result-banner ${isCorrect ? 'correct' : 'wrong'}`}>
              {isCorrect ? '✓ 回答正确！' : `✗ 回答错误，正确答案是：${correctAnswer.toUpperCase()}`}
            </div>
          )}
        </div>
      )}

      {/* AI 解析区 - 仅练习模式提交后显示 */}
      {!examMode && submitted && (
        <QuestionAI question={question} userAnswer={userAnswerText} isCorrect={isCorrect} store={store} />
      )}

      {showNavigation && (
        <div className="question-nav">
          <button className="nav-btn" onClick={onPrev} disabled={currentIndex === 0}>
            ◀ 上一题
          </button>
          <button className="nav-btn" onClick={onNext} disabled={currentIndex >= totalCount - 1}>
            下一题 ▶
          </button>
        </div>
      )}
    </div>
  );
}
