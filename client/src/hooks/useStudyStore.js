// src/hooks/useStudyStore.js
// 学习数据持久化 Hook
// 管理已完成题目、错题集、学习统计，所有数据按用户隔离存储在 localStorage
// 全部数据同步到服务端，支持跨设备访问
// 章节练习答题记录按题目独立持久化

import { useState, useEffect, useCallback, useRef } from 'react';

function getStorageKeys(username) {
  const prefix = username ? `quiz_${username}_` : 'quiz_';
  return {
    COMPLETED: `${prefix}completed`,
    WRONG: `${prefix}wrong`,
    STATS: `${prefix}stats`,
    PRACTICE_PROGRESS: `${prefix}practice_progress`,
    BOOKMARKS: `${prefix}bookmarks`,
    EXAM_HISTORY: `${prefix}exam_history`,
    AI_CHAT_HISTORY: `${prefix}ai_chat_history`,
    PRACTICE_ANSWERS: `${prefix}practice_answers`,
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

// ======== 服务端同步工具 ========

async function fetchStudyDataFromServer() {
  try {
    // 添加时间戳，强制每次获取最新数据
    const timestamp = Date.now();
    const res = await fetch(`/api/sync/study?t=${timestamp}`, { credentials: 'include' });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch {
    return null;
  }
}

async function syncStudyDataToServer(data) {
  try {
    await fetch('/api/sync/study', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (e) {
    console.warn('学习数据同步失败:', e);
  }
}

// 服务端历史数据拉取
async function fetchHistoryFromServer() {
  try {
    // 添加时间戳，强制每次获取最新数据
    const timestamp = Date.now();
    const res = await fetch(`/api/history?t=${timestamp}`, { credentials: 'include' });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data;
  } catch {
    return null;
  }
}

async function syncExamRecordToServer(record) {
  try {
    await fetch('/api/history/exam', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record }),
    });
  } catch (e) {
    console.warn('考试记录同步失败:', e);
  }
}

async function deleteExamRecordOnServer(recordId) {
  try {
    await fetch(`/api/history/exam/${recordId}`, { method: 'DELETE', credentials: 'include' });
  } catch (e) {
    console.warn('删除考试记录同步失败:', e);
  }
}

async function clearExamHistoryOnServer() {
  try {
    await fetch('/api/history/exam', { method: 'DELETE', credentials: 'include' });
  } catch (e) {
    console.warn('清空考试记录同步失败:', e);
  }
}

async function syncAIChatToServer(questionKey, messages) {
  try {
    await fetch('/api/history/ai-chat', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionKey, messages }),
    });
  } catch (e) {
    console.warn('AI对话同步失败:', e);
  }
}

async function deleteAIChatOnServer(questionKey) {
  try {
    await fetch(`/api/history/ai-chat/${encodeURIComponent(questionKey)}`, {
      method: 'DELETE', credentials: 'include',
    });
  } catch (e) {
    console.warn('删除AI对话同步失败:', e);
  }
}

async function clearAIChatHistoryOnServer() {
  try {
    await fetch('/api/history/ai-chat', { method: 'DELETE', credentials: 'include' });
  } catch (e) {
    console.warn('清空AI对话同步失败:', e);
  }
}

// 合并服务端和本地数据（服务端优先取更新值）
function mergeServerData(local, server) {
  if (!server || typeof server !== 'object') return local;
  if (typeof local !== 'object' || local === null) return server;

  // 如果是数组或原始值，直接用服务端的
  if (Array.isArray(local) || Array.isArray(server)) {
    // 数组以服务端为准（账号下的服务端数据是最新来源）
    return server;
  }

  const result = { ...local };
  Object.entries(server).forEach(([k, sv]) => {
    if (sv !== undefined && sv !== null) {
      // 对于 completed/wrong/bookmarks 这种对象，取两者的并集（服务端和本地都保留）
      if (typeof sv === 'object' && !Array.isArray(sv) && typeof local[k] === 'object' && local[k] !== null) {
        result[k] = { ...local[k], ...sv };
      } else {
        result[k] = sv;
      }
    }
  });
  return result;
}

// ======== Store ========

export function useStudyStore(username) {
  const STORAGE_KEYS = getStorageKeys(username);

  const [completed, setCompleted] = useState(() => loadFromStorage(STORAGE_KEYS.COMPLETED, {}));
  const [wrong, setWrong] = useState(() => loadFromStorage(STORAGE_KEYS.WRONG, {}));
  const [stats, setStats] = useState(() => loadFromStorage(STORAGE_KEYS.STATS, { ...DEFAULT_STATS }));
  const [practiceProgress, setPracticeProgress] = useState(() => loadFromStorage(STORAGE_KEYS.PRACTICE_PROGRESS, {}));
  const [bookmarks, setBookmarks] = useState(() => loadFromStorage(STORAGE_KEYS.BOOKMARKS, {}));
  const [examHistory, setExamHistory] = useState(() => loadFromStorage(STORAGE_KEYS.EXAM_HISTORY, []));
  const [aiChatHistory, setAiChatHistory] = useState(() => loadFromStorage(STORAGE_KEYS.AI_CHAT_HISTORY, {}));
  const [practiceAnswers, setPracticeAnswers] = useState(() => loadFromStorage(STORAGE_KEYS.PRACTICE_ANSWERS, {}));
  const [studyDataLoaded, setStudyDataLoaded] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // 登录后：先拉取全部服务端数据，与本地合并
  useEffect(() => {
    if (!username) return;

    let cancelled = false;

    Promise.all([fetchStudyDataFromServer(), fetchHistoryFromServer()]).then(([serverStudy, serverHistory]) => {
      if (cancelled) return;

      // 合并学习数据
      if (serverStudy) {
        const localCompleted = loadFromStorage(STORAGE_KEYS.COMPLETED, {});
        const localWrong = loadFromStorage(STORAGE_KEYS.WRONG, {});
        const localStats = loadFromStorage(STORAGE_KEYS.STATS, { ...DEFAULT_STATS });
        const localProgress = loadFromStorage(STORAGE_KEYS.PRACTICE_PROGRESS, {});
        const localBookmarks = loadFromStorage(STORAGE_KEYS.BOOKMARKS, {});

        const mergedCompleted = mergeServerData(localCompleted, serverStudy.completed);
        const mergedWrong = mergeServerData(localWrong, serverStudy.wrong);
        const mergedStats = { ...DEFAULT_STATS, ...(serverStudy.stats || {}), ...localStats };
        mergedStats.dailyStats = { ...DEFAULT_STATS.dailyStats, ...(serverStudy.stats?.dailyStats || {}), ...(localStats.dailyStats || {}) };
        const mergedProgress = mergeServerData(localProgress, serverStudy.practiceProgress);
        const mergedBookmarks = mergeServerData(localBookmarks, serverStudy.bookmarks);

        setCompleted(mergedCompleted);
        setWrong(mergedWrong);
        setStats(mergedStats);
        setPracticeProgress(mergedProgress);
        setBookmarks(mergedBookmarks);

        saveToStorage(STORAGE_KEYS.COMPLETED, mergedCompleted);
        saveToStorage(STORAGE_KEYS.WRONG, mergedWrong);
        saveToStorage(STORAGE_KEYS.STATS, mergedStats);
        saveToStorage(STORAGE_KEYS.PRACTICE_PROGRESS, mergedProgress);
        saveToStorage(STORAGE_KEYS.BOOKMARKS, mergedBookmarks);

        setStudyDataLoaded(true);
      } else {
        setStudyDataLoaded(true);
      }

      // 合并历史数据
      if (serverHistory) {
        const localExam = loadFromStorage(STORAGE_KEYS.EXAM_HISTORY, []);
        const localAI = loadFromStorage(STORAGE_KEYS.AI_CHAT_HISTORY, {});

        const mergedExam = mergeServerData(localExam, serverHistory.examHistory);
        const mergedAI = mergeServerData(localAI, serverHistory.aiChatHistory);

        setExamHistory(Array.isArray(mergedExam) ? mergedExam : []);
        setAiChatHistory(typeof mergedAI === 'object' && mergedAI !== null ? mergedAI : {});

        saveToStorage(STORAGE_KEYS.EXAM_HISTORY, Array.isArray(mergedExam) ? mergedExam : []);
        saveToStorage(STORAGE_KEYS.AI_CHAT_HISTORY, typeof mergedAI === 'object' && mergedAI !== null ? mergedAI : {});
      }

      setHistoryLoaded(true);
    });

    return () => { cancelled = true; };
  }, [username]);

  // 用户切换时重置
  const prevUsername = useRef(username);
  useEffect(() => {
    if (prevUsername.current !== username) {
      prevUsername.current = username;
      if (username) {
        const keys = getStorageKeys(username);
        setCompleted(loadFromStorage(keys.COMPLETED, {}));
        setWrong(loadFromStorage(keys.WRONG, {}));
        setStats(loadFromStorage(keys.STATS, { ...DEFAULT_STATS }));
        setPracticeProgress(loadFromStorage(keys.PRACTICE_PROGRESS, {}));
        setBookmarks(loadFromStorage(keys.BOOKMARKS, {}));
        setExamHistory(loadFromStorage(keys.EXAM_HISTORY, []));
        setAiChatHistory(loadFromStorage(keys.AI_CHAT_HISTORY, {}));
        setPracticeAnswers(loadFromStorage(keys.PRACTICE_ANSWERS, {}));
        setStudyDataLoaded(false);
        setHistoryLoaded(false);
      }
    }
  }, [username]);

  // 学习计时器
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // 防抖保存所有数据到 localStorage
  const saveTimerRef = useRef(null);
  const saveAll = useCallback(() => {
    if (saveTimerRef.current) return;
    saveTimerRef.current = setTimeout(() => {
      saveToStorage(STORAGE_KEYS.COMPLETED, completed);
      saveToStorage(STORAGE_KEYS.WRONG, wrong);
      saveToStorage(STORAGE_KEYS.STATS, stats);
      saveToStorage(STORAGE_KEYS.PRACTICE_PROGRESS, practiceProgress);
      saveToStorage(STORAGE_KEYS.BOOKMARKS, bookmarks);
      saveToStorage(STORAGE_KEYS.EXAM_HISTORY, examHistory);
      saveToStorage(STORAGE_KEYS.AI_CHAT_HISTORY, aiChatHistory);
      saveToStorage(STORAGE_KEYS.PRACTICE_ANSWERS, practiceAnswers);
      saveTimerRef.current = null;
    }, 100);
  }, [completed, wrong, stats, practiceProgress, bookmarks, examHistory, aiChatHistory, practiceAnswers, STORAGE_KEYS]);

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
      saveToStorage(STORAGE_KEYS.EXAM_HISTORY, examHistory);
      saveToStorage(STORAGE_KEYS.AI_CHAT_HISTORY, aiChatHistory);
      saveToStorage(STORAGE_KEYS.PRACTICE_ANSWERS, practiceAnswers);
    };
  }, [completed, wrong, stats, practiceProgress, bookmarks, examHistory, aiChatHistory, practiceAnswers, STORAGE_KEYS]);

  // 防抖同步学习数据到服务端（每 2 秒一次）
  const syncTimerRef = useRef(null);
  const scheduleSync = useCallback((data) => {
    if (syncTimerRef.current) return;
    syncTimerRef.current = setTimeout(() => {
      syncStudyDataToServer(data);
      syncTimerRef.current = null;
    }, 2000);
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (elapsed > 0) {
        setStats(prev => ({ ...prev, studyTime: prev.studyTime + elapsed }));
        startTimeRef.current = Date.now();
      }
    }, 30000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
      if (startTimeRef.current) {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        if (elapsed > 0) {
          setStats(prev => ({ ...prev, studyTime: prev.studyTime + elapsed }));
        }
        startTimeRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  const getTodayKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  /**
   * 记录答题结果
   */
  const recordAnswer = useCallback((questionKey, isCorrect, question, userAnswer) => {
    const today = getTodayKey();

    setCompleted(prev => {
      const next = { ...prev, [questionKey]: true };
      scheduleSync({ completed: next });
      return next;
    });

    setStats(prev => {
      const dailyStats = { ...prev.dailyStats };
      if (!dailyStats[today]) dailyStats[today] = { answered: 0, correct: 0 };
      dailyStats[today] = {
        answered: dailyStats[today].answered + 1,
        correct: dailyStats[today].correct + (isCorrect ? 1 : 0),
      };
      const next = {
        ...prev,
        totalAnswered: prev.totalAnswered + 1,
        totalCorrect: prev.totalCorrect + (isCorrect ? 1 : 0),
        dailyStats,
      };
      scheduleSync({ stats: next });
      return next;
    });

    if (!isCorrect) {
      setWrong(prev => {
        const next = {
          ...prev,
          [questionKey]: { question, userAnswer, correctAnswer: question.answer, timestamp: Date.now() }
        };
        scheduleSync({ wrong: next });
        return next;
      });
    } else {
      setWrong(prev => {
        const next = { ...prev };
        delete next[questionKey];
        scheduleSync({ wrong: next });
        return next;
      });
    }
  }, [scheduleSync]);

  const setPracticeIndex = useCallback((chapterName, index) => {
    setPracticeProgress(prev => {
      const next = { ...prev, [chapterName]: index };
      scheduleSync({ practiceProgress: next });
      return next;
    });
  }, [scheduleSync]);

  const setPracticeType = useCallback((chapterName, type) => {
    setPracticeProgress(prev => {
      const next = { ...prev, [`${chapterName}_type`]: type };
      scheduleSync({ practiceProgress: next });
      return next;
    });
  }, [scheduleSync]);

  const getPracticeIndex = useCallback((chapterName) => {
    return practiceProgress[chapterName] || 0;
  }, [practiceProgress]);

  const getPracticeType = useCallback((chapterName) => {
    return practiceProgress[`${chapterName}_type`] || 'all';
  }, [practiceProgress]);

  const toggleBookmark = useCallback((questionKey) => {
    setBookmarks(prev => {
      const next = { ...prev };
      if (next[questionKey]) delete next[questionKey];
      else next[questionKey] = true;
      scheduleSync({ bookmarks: next });
      return next;
    });
  }, [scheduleSync]);

  const removeWrong = useCallback((questionKey) => {
    setWrong(prev => {
      const next = { ...prev };
      delete next[questionKey];
      scheduleSync({ wrong: next });
      return next;
    });
  }, []);

  const clearAllWrong = useCallback(() => {
    setWrong({});
    scheduleSync({ wrong: {} });
  }, [scheduleSync]);

  const getLast7DaysStats = useCallback(() => {
    const result = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayData = (stats.dailyStats && stats.dailyStats[key]) || { answered: 0, correct: 0 };
      result.push({ date: `${d.getMonth() + 1}/${d.getDate()}`, ...dayData });
    }
    return result;
  }, [stats.dailyStats]);

  const getChapterMastery = useCallback((chapters) => {
    return chapters.map(ch => {
      const total = ch.questions.length;
      const completedCount = ch.questions.filter(q => completed[`${q.chapter}_${q.id}`]).length;
      const wrongCount = ch.questions.filter(q => wrong[`${q.chapter}_${q.id}`]).length;
      return {
        name: ch.name,
        total,
        completed: completedCount,
        wrong: wrongCount,
        mastery: total > 0 ? Math.round(((completedCount - wrongCount) / total) * 100) : 0,
      };
    });
  }, [completed, wrong]);

  // ======== 章节练习答题记录 ========
  /**
   * 获取某章节的答题记录
   * @param {string} chapterKey - 章节标识，如 "第一章单项选择题"
   * @returns {object} - { [questionKey]: { selected, multiSelected, submitted, isCorrect } }
   */
  const getChapterAnswers = useCallback((chapterKey) => {
    return practiceAnswers[chapterKey] || {};
  }, [practiceAnswers]);

  /**
   * 保存单道题目的答题状态
   */
  const saveQuestionAnswer = useCallback((chapterKey, questionKey, answerData) => {
    setPracticeAnswers(prev => {
      const next = {
        ...prev,
        [chapterKey]: {
          ...(prev[chapterKey] || {}),
          [questionKey]: {
            ...(prev[chapterKey]?.[questionKey] || {}),
            ...answerData,
            savedAt: Date.now(),
          }
        }
      };
      return next;
    });
  }, []);

  /**
   * 清除某章节的答题记录
   */
  const clearChapterAnswers = useCallback((chapterKey) => {
    setPracticeAnswers(prev => {
      const next = { ...prev };
      delete next[chapterKey];
      return next;
    });
  }, []);

  /**
   * 删除某道题的答题记录
   */
  const removeQuestionAnswer = useCallback((chapterKey, questionKey) => {
    setPracticeAnswers(prev => {
      const next = {
        ...prev,
        [chapterKey]: { ...(prev[chapterKey] || {}) }
      };
      delete next[chapterKey][questionKey];
      return next;
    });
  }, []);

  // ======== 考试记录 ========
  const saveExamRecord = useCallback((record) => {
    const newRecord = { id: Date.now().toString(), timestamp: Date.now(), ...record };
    setExamHistory(prev => {
      const next = [newRecord, ...prev];
      if (next.length > 50) next.pop();
      return next;
    });
    syncExamRecordToServer(newRecord);
    return newRecord.id;
  }, []);

  const deleteExamRecord = useCallback((recordId) => {
    setExamHistory(prev => prev.filter(r => r.id !== recordId));
    deleteExamRecordOnServer(recordId);
  }, []);

  const clearExamHistory = useCallback(() => {
    setExamHistory([]);
    clearExamHistoryOnServer();
  }, []);

  // ======== AI 对话历史 ========
  const saveAIChat = useCallback((questionKey, messages) => {
    if (!messages || messages.length === 0) return;
    const chat = { questionKey, messages, updatedAt: Date.now() };
    setAiChatHistory(prev => ({ ...prev, [questionKey]: chat }));
    syncAIChatToServer(questionKey, messages);
  }, []);

  const getAIChat = useCallback((questionKey) => {
    return aiChatHistory[questionKey] || null;
  }, [aiChatHistory]);

  const getAllAIChats = useCallback(() => {
    return Object.values(aiChatHistory).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [aiChatHistory]);

  const deleteAIChat = useCallback((questionKey) => {
    setAiChatHistory(prev => {
      const next = { ...prev };
      delete next[questionKey];
      return next;
    });
    deleteAIChatOnServer(questionKey);
  }, []);

  const clearAIChatHistory = useCallback(() => {
    setAiChatHistory({});
    clearAIChatHistoryOnServer();
  }, []);

  return {
    completed,
    wrong,
    stats,
    bookmarks,
    recordAnswer,
    setPracticeIndex,
    getPracticeIndex,
    setPracticeType,
    getPracticeType,
    toggleBookmark,
    removeWrong,
    clearAllWrong,
    getLast7DaysStats,
    getChapterMastery,
    startTimer,
    stopTimer,
    wrongCount: Object.keys(wrong).length,
    completedCount: Object.keys(completed).length,
    practiceProgress,
    practiceAnswers,
    getChapterAnswers,
    saveQuestionAnswer,
    clearChapterAnswers,
    removeQuestionAnswer,
    // 考试历史
    examHistory,
    saveExamRecord,
    deleteExamRecord,
    clearExamHistory,
    studyDataLoaded,
    historyLoaded,
    // AI对话历史
    aiChatHistory,
    saveAIChat,
    getAIChat,
    getAllAIChats,
    deleteAIChat,
    clearAIChatHistory,
  };
}
