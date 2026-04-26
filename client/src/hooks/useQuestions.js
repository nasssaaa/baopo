// src/hooks/useQuestions.js
// 题目数据加载 & 缓存 Hook
// 一次加载 JSON，全局缓存，提供分章节数据和工具函数

import { useState, useEffect, useRef, useMemo } from 'react';

// 全局缓存，避免重复 fetch
let cachedQuestions = null;
let fetchPromise = null;

// 全局缓存章节分组结果
let cachedChapters = null;

/**
 * 从 chapter 字段提取纯章节编号，如 "第一章单项选择题" → "第一章"
 */
function extractChapterNum(chapter) {
  const match = chapter.match(/^(第[一二三四五六七八九十]+章)/);
  return match ? match[1] : chapter;
}

/**
 * 生成题目的全局唯一 key（因为不同 chapter 下 id 可能重复）
 */
export function getQuestionKey(q) {
  return `${q.chapter}_${q.id}`;
}

export function useQuestions() {
  const [questions, setQuestions] = useState(cachedQuestions || []);
  const [loading, setLoading] = useState(!cachedQuestions);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (cachedQuestions) {
      setQuestions(cachedQuestions);
      setLoading(false);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = fetch('/questions_clean_v2.json')
        .then(res => {
          if (!res.ok) throw new Error('加载题库失败');
          return res.json();
        })
        .then(data => {
          cachedQuestions = data;
          return data;
        });
    }

    fetchPromise
      .then(data => {
        setQuestions(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // 按纯章节分组（第一章 ~ 第七章），每章包含所有题型 —— 使用 useMemo 缓存，仅 questions 变化时重新计算
  const chapters = useMemo(() => {
    if (cachedChapters) return cachedChapters;
    if (questions.length === 0) return [];

    const map = new Map();
    for (const q of questions) {
      const chNum = extractChapterNum(q.chapter);
      if (!map.has(chNum)) {
        map.set(chNum, []);
      }
      map.get(chNum).push(q);
    }
    cachedChapters = Array.from(map.entries()).map(([name, items]) => ({
      name,
      questions: items,
      // 按题型子分组（lazy 计算）
      byType: {
        single: items.filter(q => q.type === '单项选择题'),
        multi: items.filter(q => q.type === '多项选择题'),
        judge: items.filter(q => q.type === '判断对错题'),
      }
    }));
    return cachedChapters;
  }, [questions]);

  /**
   * 按 chapter 字段精确获取题目（如 "第一章单项选择题"）
   */
  const getByChapter = useMemo(() => (chapterName) => {
    return questions.filter(q => q.chapter === chapterName);
  }, [questions]);

  /**
   * 随机抽题（用于模拟考试）—— 稳定引用，不随渲染重建
   */
  const getRandomQuestions = useMemo(() => (count) => {
    const shuffled = [...questions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }, [questions]);

  /**
   * 根据 key 列表获取题目（用于错题本）
   */
  const getByKeys = useMemo(() => (keys) => {
    const keySet = new Set(keys);
    return questions.filter(q => keySet.has(getQuestionKey(q)));
  }, [questions]);

  return {
    questions,
    chapters,
    loading,
    error,
    getByChapter,
    getRandomQuestions,
    getByKeys,
    total: questions.length,
  };
}
