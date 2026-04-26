// src/hooks/useStudyStore.js
// 学习数据持久化 Hook
// 管理已完成题目、错题集、学习统计，所有数据按用户隔离存储在 localStorage

import { useState, useEffect, useCallback, useRef } from 'react';

function getStorageKeys(username) {
  const prefix = username ? `quiz_${username}_` : 'quiz_';
  return {
    COMPLETED: `${prefix}completed`,
    WRONG: `${prefix}wrong`,
    STATS: `${prefix}stats`,
    PRACTICE_PROGRESS: `${prefix}practice_progress`,
    BOOKMARKS: `${prefix}bookmarks`,
  };
}

function loadFromStorage(key, defaultValue) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('localStorage 写入失败:', e);
  }
}

const DEFAULT_STATS = { totalAnswered: 0, totalCorrect: 0, studyTime: 0, dailyStats: {} };

export function useStudyStore(username) {
  const STORAGE_KEYS = getStorageKeys(username);

  const [completed, setCompleted] = useState(() => loadFromStorage(STORAGE_KEYS.COMPLETED, {}));
  const [wrong, setWrong] = useState(() => loadFromStorage(STORAGE_KEYS.WRONG, {}));
  const [stats, setStats] = useState(() => loadFromStorage(STORAGE_KEYS.STATS, { ...DEFAULT_STATS }));
  const [practiceProgress, setPracticeProgress] = useState(() => loadFromStorage(STORAGE_KEYS.PRACTICE_PROGRESS, {}));
  const [bookmarks, setBookmarks] = useState(() => loadFromStorage(STORAGE_KEYS.BOOKMARKS, {}));

  // 当用户切换时重新加载数据
  const prevUsername = useRef(username);
  useEffect(() => {
    if (prevUsername.current !== username) {
      prevUsername.current = username;
      const keys = getStorageKeys(username);
      setCompleted(loadFromStorage(keys.COMPLETED, {}));
      setWrong(loadFromStorage(keys.WRONG, {}));
      setStats(loadFromStorage(keys.STATS, { ...DEFAULT_STATS }));
      setPracticeProgress(loadFromStorage(keys.PRACTICE_PROGRESS, {}));
      setBookmarks(loadFromStorage(keys.BOOKMARKS, {}));
    }
  }, [username]);

  // 学习计时器
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // 批量合并 localStorage 写入 —— 所有状态共享一个 debounced save，避免每次 state 变化都触发一次 write
  const saveTimerRef = useRef(null);
  const saveAll = useCallback(() => {
    if (saveTimerRef.current) return;
    saveTimerRef.current = setTimeout(() => {
      saveToStorage(STORAGE_KEYS.COMPLETED, completed);
      saveToStorage(STORAGE_KEYS.WRONG, wrong);
      saveToStorage(STORAGE_KEYS.STATS, stats);
      saveToStorage(STORAGE_KEYS.PRACTICE_PROGRESS, practiceProgress);
      saveToStorage(STORAGE_KEYS.BOOKMARKS, bookmarks);
      saveTimerRef.current = null;
    }, 100);
  }, [completed, wrong, stats, practiceProgress, bookmarks, STORAGE_KEYS]);

  // 监听所有状态变化，统一在下一帧批量写入
  useEffect(() => { saveAll(); }, [saveAll]);

  // 组件卸载时同步写一次
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveToStorage(STORAGE_KEYS.COMPLETED, completed);
      saveToStorage(STORAGE_KEYS.WRONG, wrong);
      saveToStorage(STORAGE_KEYS.STATS, stats);
      saveToStorage(STORAGE_KEYS.PRACTICE_PROGRESS, practiceProgress);
      saveToStorage(STORAGE_KEYS.BOOKMARKS, bookmarks);
    };
  }, [completed, wrong, stats, practiceProgress, bookmarks, STORAGE_KEYS]);

  /**
   * 开始计时（页面进入时调用）
   */
  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (elapsed > 0) {
        setStats(prev => ({
          ...prev,
          studyTime: prev.studyTime + elapsed,
        }));
        startTimeRef.current = Date.now();
      }
    }, 30000); // 每 30 秒更新一次
  }, []);

  /**
   * 停止计时
   */
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      // 保存最后一段时间
      if (startTimeRef.current) {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        if (elapsed > 0) {
          setStats(prev => ({
            ...prev,
            studyTime: prev.studyTime + elapsed,
          }));
        }
        startTimeRef.current = null;
      }
    }
  }, []);

  // 组件卸载时停止计时
  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  /**
   * 获取今日日期 key
   */
  const getTodayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  /**
   * 记录答题结果
   */
  const recordAnswer = useCallback((questionKey, isCorrect, question, userAnswer) => {
    const today = getTodayKey();

    // 标记完成
    setCompleted(prev => ({ ...prev, [questionKey]: true }));

    // 更新统计
    setStats(prev => {
      const dailyStats = { ...prev.dailyStats };
      if (!dailyStats[today]) {
        dailyStats[today] = { answered: 0, correct: 0 };
      }
      dailyStats[today] = {
        answered: dailyStats[today].answered + 1,
        correct: dailyStats[today].correct + (isCorrect ? 1 : 0),
      };
      return {
        ...prev,
        totalAnswered: prev.totalAnswered + 1,
        totalCorrect: prev.totalCorrect + (isCorrect ? 1 : 0),
        dailyStats,
      };
    });

    // 如果答错，加入错题集
    if (!isCorrect) {
      setWrong(prev => ({
        ...prev,
        [questionKey]: {
          question,
          userAnswer,
          correctAnswer: question.answer,
          timestamp: Date.now(),
        }
      }));
    } else {
      // 如果答对了，从错题集中移除（说明已经掌握）
      setWrong(prev => {
        const next = { ...prev };
        delete next[questionKey];
        return next;
      });
    }
  }, []);

  /**
   * 设置章节练习进度
   */
  const setPracticeIndex = useCallback((chapterName, index) => {
    setPracticeProgress(prev => ({ ...prev, [chapterName]: index }));
  }, []);

  /**
   * 获取章节练习进度
   */
  const getPracticeIndex = useCallback((chapterName) => {
    return practiceProgress[chapterName] || 0;
  }, [practiceProgress]);

  /**
   * 切换标记
   */
  const toggleBookmark = useCallback((questionKey) => {
    setBookmarks(prev => {
      const next = { ...prev };
      if (next[questionKey]) {
        delete next[questionKey];
      } else {
        next[questionKey] = true;
      }
      return next;
    });
  }, []);

  /**
   * 删除单个错题
   */
  const removeWrong = useCallback((questionKey) => {
    setWrong(prev => {
      const next = { ...prev };
      delete next[questionKey];
      return next;
    });
  }, []);

  /**
   * 清空错题本
   */
  const clearAllWrong = useCallback(() => {
    setWrong({});
  }, []);

  /**
   * 获取最近 7 天的学习数据
   */
  const getLast7DaysStats = useCallback(() => {
    const result = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayData = stats.dailyStats[key] || { answered: 0, correct: 0 };
      result.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        ...dayData,
      });
    }
    return result;
  }, [stats.dailyStats]);

  /**
   * 获取各章节掌握度
   */
  const getChapterMastery = useCallback((chapters) => {
    return chapters.map(ch => {
      const total = ch.questions.length;
      const completedCount = ch.questions.filter(q => {
        const key = `${q.chapter}_${q.id}`;
        return completed[key];
      }).length;
      const wrongCount = ch.questions.filter(q => {
        const key = `${q.chapter}_${q.id}`;
        return wrong[key];
      }).length;
      return {
        name: ch.name,
        total,
        completed: completedCount,
        wrong: wrongCount,
        mastery: total > 0 ? Math.round(((completedCount - wrongCount) / total) * 100) : 0,
      };
    });
  }, [completed, wrong]);

  return {
    completed,
    wrong,
    stats,
    bookmarks,
    recordAnswer,
    setPracticeIndex,
    getPracticeIndex,
    toggleBookmark,
    removeWrong,
    clearAllWrong,
    getLast7DaysStats,
    getChapterMastery,
    startTimer,
    stopTimer,
    wrongCount: Object.keys(wrong).length,
    completedCount: Object.keys(completed).length,
  };
}
