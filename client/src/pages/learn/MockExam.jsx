// src/pages/learn/MockExam.jsx
// 模拟考试模块 - 可配置试卷结构 + 统一交卷 + 中途退出可恢复
// 题目按题型分组排列：单选 → 多选 → 判断

import { useState, useEffect, useRef, useMemo } from 'react';
import QuestionCard from './QuestionCard';
import { getQuestionKey } from '../../hooks/useQuestions';
import ExamHistory from './ExamHistory';
import QuestionAI from './QuestionAI';

const EXAM_STATE = { SETUP: 'setup', RUNNING: 'running', CONFIRM: 'confirm', FINISHED: 'finished' };
const EXAM_STORAGE_KEY = 'quiz_exam_session';
const EXAM_HISTORY_VIEW = 'history';

function loadSession() { try { return JSON.parse(localStorage.getItem(EXAM_STORAGE_KEY)); } catch { return null; } }
function saveSession(s) { try { localStorage.setItem(EXAM_STORAGE_KEY, JSON.stringify(s)); } catch {} }
function clearSession() { try { localStorage.removeItem(EXAM_STORAGE_KEY); } catch {} }

// 按题型排序：单选 → 多选 → 判断
const TYPE_ORDER = { '单项选择题': 0, '多项选择题': 1, '判断对错题': 2 };
function sortByType(arr) { return [...arr].sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9)); }

export default function MockExam({ questions, store }) {
  const [examState, setExamState] = useState(EXAM_STATE.SETUP);
  const [examQuestions, setExamQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [examMinutes, setExamMinutes] = useState(60);
  const [savedSession, setSavedSession] = useState(() => loadSession());
  const [confirmInfo, setConfirmInfo] = useState(null); // 交卷确认信息
  const [viewHistory, setViewHistory] = useState(false); // 查看历史
  const [viewAnswerSheet, setViewAnswerSheet] = useState(false); // 答题卡视图（成绩报告）
  const [examAnswerSheet, setExamAnswerSheet] = useState(false); // 考试中答题卡视图
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(null); // 答题卡中选中的题目

  // 试卷结构 —— 使用 useMemo 避免每次渲染都遍历全部题目
  const singlePool = useMemo(() => questions.filter(q => q.type === '单项选择题'), [questions]);
  const multiPool = useMemo(() => questions.filter(q => q.type === '多项选择题'), [questions]);
  const judgePool = useMemo(() => questions.filter(q => q.type === '判断对错题'), [questions]);
  const [singleCount, setSingleCount] = useState(20);
  const [multiCount, setMultiCount] = useState(15);
  const [judgeCount, setJudgeCount] = useState(15);
  const [useStructure, setUseStructure] = useState(true);
  const [randomTotal, setRandomTotal] = useState(50);

  const timerRef = useRef(null);

  // 持久化考试状态
  useEffect(() => {
    if (examState === EXAM_STATE.RUNNING && examQuestions.length > 0) {
      saveSession({ examQuestions, answers, timeLeft, currentIndex, totalMinutes: examMinutes, timestamp: Date.now() });
    }
  }, [answers, timeLeft, currentIndex, examState, examQuestions, examMinutes]);

  // 倒计时
  useEffect(() => {
    if (examState !== EXAM_STATE.RUNNING) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => { if (prev <= 1) { clearInterval(timerRef.current); return 0; } return prev - 1; });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [examState]);

  // 时间到 → 直接交卷
  useEffect(() => {
    if (examState === EXAM_STATE.RUNNING && timeLeft === 0) doFinish();
  }, [timeLeft, examState]);

  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const pick = (pool, n) => [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(n, pool.length));

  function startExam() {
    let selected;
    if (useStructure) {
      selected = [...pick(singlePool, singleCount), ...pick(multiPool, multiCount), ...pick(judgePool, judgeCount)];
    } else {
      selected = sortByType(pick(questions, randomTotal));
    }
    // 已经按结构拼接的顺序就是 单选→多选→判断
    setExamQuestions(selected);
    setAnswers({});
    setCurrentIndex(0);
    setTimeLeft(examMinutes * 60);
    setExamState(EXAM_STATE.RUNNING);
  }

  function resumeExam() {
    if (!savedSession) return;
    setExamQuestions(savedSession.examQuestions);
    setAnswers(savedSession.answers || {});
    setCurrentIndex(savedSession.currentIndex || 0);
    const elapsed = Math.floor((Date.now() - savedSession.timestamp) / 1000);
    setTimeLeft(Math.max(0, (savedSession.timeLeft || 0) - elapsed));
    setExamMinutes(savedSession.totalMinutes || 60);
    setExamState(EXAM_STATE.RUNNING);
    setSavedSession(null);
  }

  function handleExamSelect(questionKey, userAnswer) {
    setAnswers(prev => ({ ...prev, [questionKey]: userAnswer }));
  }

  // 实际执行交卷
  function doFinish() {
    if (timerRef.current) clearInterval(timerRef.current);

    // 构建详细答题数据
    const details = examQuestions.map(q => {
      const key = getQuestionKey(q);
      const ua = answers[key];
      return {
        questionKey: key,
        userAnswer: ua || null,
        isCorrect: ua === q.answer,
        answered: !!ua,
      };
    });

    // 计算成绩
    const total = examQuestions.length;
    let correct = 0, wrong = 0;
    const chapterStats = {};
    const typeStats = { single: { total: 0, correct: 0 }, multi: { total: 0, correct: 0 }, judge: { total: 0, correct: 0 } };
    examQuestions.forEach(q => {
      const key = getQuestionKey(q);
      const chNum = q.chapter.match(/^(第[一二三四五六七八九十]+章)/)?.[1] || q.chapter;
      if (!chapterStats[chNum]) chapterStats[chNum] = { total: 0, correct: 0, wrong: 0 };
      chapterStats[chNum].total++;
      const tk = q.type === '单项选择题' ? 'single' : q.type === '多项选择题' ? 'multi' : 'judge';
      typeStats[tk].total++;
      const ua = answers[key];
      if (ua === q.answer) { correct++; chapterStats[chNum].correct++; typeStats[tk].correct++; }
      else if (ua) { wrong++; chapterStats[chNum].wrong++; }
    });

    const record = {
      total,
      correct,
      wrong,
      unanswered: total - correct - wrong,
      score: total > 0 ? Math.round((correct / total) * 100) : 0,
      chapterStats,
      typeStats,
      details,
      questionKeys: examQuestions.map(q => getQuestionKey(q)),
    };

    // 保存到历史记录
    if (store && store.saveExamRecord) {
      store.saveExamRecord(record);
    }

    // 记录答题（更新错题本等）
    examQuestions.forEach(q => {
      const key = getQuestionKey(q);
      const ua = answers[key];
      if (ua) store.recordAnswer(key, ua === q.answer, q, ua);
    });

    clearSession();
    setConfirmInfo(null);
    setExamState(EXAM_STATE.FINISHED);
  }

  // 点击交卷 → 检查 → 显示确认弹窗
  function handleSubmitClick() {
    const total = examQuestions.length;
    const unanswered = examQuestions.filter(q => !answers[getQuestionKey(q)]);
    const incompleteMulti = examQuestions.filter(q => {
      if (q.type !== '多项选择题') return false;
      const a = answers[getQuestionKey(q)];
      return a && a.length === 1;
    });
    const warnings = [];
    if (unanswered.length > 0) warnings.push(`还有 ${unanswered.length} 道题未作答`);
    if (incompleteMulti.length > 0) warnings.push(`有 ${incompleteMulti.length} 道多选题只选了 1 个选项`);
    setConfirmInfo({ total, answered: total - unanswered.length, warnings, unansweredIndices: unanswered.map(q => examQuestions.indexOf(q)) });
    setExamState(EXAM_STATE.CONFIRM);
  }

  // 取消交卷
  function cancelSubmit() {
    setConfirmInfo(null);
    setExamState(EXAM_STATE.RUNNING);
  }

  // 计算当前题目在哪个题型区间（用于显示分区标签）
  function getTypeSection(index) {
    if (index === 0) return examQuestions[0]?.type;
    const prev = examQuestions[index - 1]?.type;
    const curr = examQuestions[index]?.type;
    return prev !== curr ? curr : null;
  }

  // 计算成绩
  function getResults() {
    const total = examQuestions.length;
    let correct = 0, wrong = 0;
    const chapterStats = {}, wrongQuestions = [];
    const typeStats = { single: { total: 0, correct: 0 }, multi: { total: 0, correct: 0 }, judge: { total: 0, correct: 0 } };
    examQuestions.forEach(q => {
      const key = getQuestionKey(q);
      const chNum = q.chapter.match(/^(第[一二三四五六七八九十]+章)/)?.[1] || q.chapter;
      if (!chapterStats[chNum]) chapterStats[chNum] = { total: 0, correct: 0, wrong: 0 };
      chapterStats[chNum].total++;
      const tk = q.type === '单项选择题' ? 'single' : q.type === '多项选择题' ? 'multi' : 'judge';
      typeStats[tk].total++;
      const ua = answers[key];
      if (ua) {
        if (ua === q.answer) { correct++; chapterStats[chNum].correct++; typeStats[tk].correct++; }
        else { wrong++; chapterStats[chNum].wrong++; wrongQuestions.push(q); }
      }
    });
    return { total, answered: correct + wrong, correct, wrong, unanswered: total - correct - wrong,
      score: total > 0 ? Math.round((correct / total) * 100) : 0, chapterStats, wrongQuestions, typeStats };
  }

  // ======== 设置阶段 ========
  if (examState === EXAM_STATE.SETUP) {
    const totalByStructure = singleCount + multiCount + judgeCount;
    return (
      <div className="exam-setup">
        <div className="exam-setup-top">
          <h3 className="module-title"><span className="title-icon">📝</span>模拟考试</h3>
          {store.examHistory && store.examHistory.length > 0 && (
            <button
              className="history-toggle-btn"
              onClick={() => setViewHistory(!viewHistory)}
            >
              {viewHistory ? '◀ 返回考试设置' : '📋 历史答题卡'}
            </button>
          )}
        </div>

        {viewHistory ? (
          <ExamHistory store={store} questions={questions} onBack={() => setViewHistory(false)} />
        ) : (
          <>
            {savedSession && (
              <div className="exam-resume-banner">
                <div className="resume-info">
                  <span className="resume-icon">⏸</span>
                  <div>
                    <p>检测到未完成的考试（{savedSession.examQuestions?.length} 题）</p>
                    <p className="resume-detail">已答 {Object.keys(savedSession.answers||{}).length} 题 · 剩余 {fmt(Math.max(0,(savedSession.timeLeft||0)-Math.floor((Date.now()-savedSession.timestamp)/1000)))}</p>
                  </div>
                </div>
                <div className="resume-actions">
                  <button className="action-btn primary" onClick={resumeExam}>继续考试</button>
                  <button className="action-btn danger" onClick={() => { clearSession(); setSavedSession(null); }}>放弃</button>
                </div>
              </div>
            )}
            <div className="setup-form">
              <div className="setup-field">
                <label>出题方式</label>
                <div className="count-options">
                  <button className={`count-btn ${useStructure ? 'active' : ''}`} onClick={() => setUseStructure(true)}>按题型配置</button>
                  <button className={`count-btn ${!useStructure ? 'active' : ''}`} onClick={() => setUseStructure(false)}>随机出题</button>
                </div>
              </div>
              {useStructure ? (
                <div className="setup-field">
                  <label>试卷结构</label>
                  <div className="structure-config">
                    {[
                      { label: '📝 单选题', value: singleCount, set: setSingleCount, max: singlePool.length },
                      { label: '📋 多选题', value: multiCount, set: setMultiCount, max: multiPool.length },
                      { label: '⚖️ 判断题', value: judgeCount, set: setJudgeCount, max: judgePool.length },
                    ].map(({ label, value, set, max }) => (
                      <div className="structure-row" key={label}>
                        <span className="structure-label">{label}</span>
                        <div className="structure-control">
                          <button className="struct-btn" onClick={() => set(Math.max(0, value - 5))}>−</button>
                          <input type="number" min="0" max={max} value={value}
                            onChange={e => set(Math.max(0, Math.min(max, Number(e.target.value) || 0)))} className="struct-input" />
                          <button className="struct-btn" onClick={() => set(Math.min(max, value + 5))}>+</button>
                          <span className="struct-pool">/ {max}</span>
                        </div>
                      </div>
                    ))}
                    <div className="structure-total">合计 <strong>{totalByStructure}</strong> 题</div>
                  </div>
                </div>
              ) : (
                <div className="setup-field">
                  <label>题目数量</label>
                  <div className="count-options">
                    {[50, 100, questions.length].map(c => (
                      <button key={c} className={`count-btn ${randomTotal === c ? 'active' : ''}`}
                        onClick={() => setRandomTotal(c)}>{c === questions.length ? `全卷 (${c}题)` : `${c} 题`}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="setup-field">
                <label>考试时长（分钟）</label>
                <div className="time-setting">
                  <input type="range" min="10" max="120" step="5" value={examMinutes}
                    onChange={e => setExamMinutes(Number(e.target.value))} className="time-slider" />
                  <div className="time-display">
                    <input type="number" min="10" max="120" value={examMinutes}
                      onChange={e => setExamMinutes(Math.max(10, Math.min(120, Number(e.target.value) || 60)))} className="time-input" />
                    <span>分钟</span>
                  </div>
                </div>
              </div>
              <div className="setup-info">
                <p>📋 题量：{useStructure ? `单选${singleCount} + 多选${multiCount} + 判断${judgeCount} = ${totalByStructure}题` : `${randomTotal}题（随机）`}</p>
                <p>⏱️ 考试时长：{examMinutes} 分钟</p>
                <p>📊 及格线：60 分</p>
                <p>📑 题目按类型分组排列：单选 → 多选 → 判断</p>
              </div>
              <button className="start-exam-btn" onClick={startExam}
                disabled={useStructure ? totalByStructure === 0 : randomTotal === 0}>开始考试</button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ======== 交卷确认弹窗 ========
  if (examState === EXAM_STATE.CONFIRM && confirmInfo) {
    return (
      <div className="exam-confirm-overlay">
        <div className="exam-confirm-modal">
          <h3 className="confirm-title">确认交卷</h3>
          <div className="confirm-stats">
            <p>已答 <strong>{confirmInfo.answered}</strong> / {confirmInfo.total} 题</p>
          </div>
          {confirmInfo.warnings.length > 0 && (
            <div className="confirm-warnings">
              {confirmInfo.warnings.map((w, i) => (
                <div key={i} className="confirm-warning-item">⚠ {w}</div>
              ))}
            </div>
          )}
          {confirmInfo.unansweredIndices.length > 0 && confirmInfo.unansweredIndices.length <= 10 && (
            <div className="confirm-unanswered">
              <p className="confirm-unanswered-label">未答题号：</p>
              <div className="confirm-unanswered-nums">
                {confirmInfo.unansweredIndices.map(i => (
                  <button key={i} className="confirm-goto-btn" onClick={() => { setCurrentIndex(i); cancelSubmit(); }}>
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="confirm-actions">
            <button className="action-btn danger confirm-submit-btn" onClick={doFinish}>确认交卷</button>
            <button className="action-btn primary" onClick={cancelSubmit}>继续答题</button>
          </div>
        </div>
      </div>
    );
  }

  // ======== 考试中 - 答题卡视图 ========
  if (examState === EXAM_STATE.RUNNING && examAnswerSheet) {
    const typeGroups = {};
    examQuestions.forEach((q, idx) => {
      const type = q.type;
      if (!typeGroups[type]) typeGroups[type] = [];
      typeGroups[type].push({ ...q, _idx: idx });
    });
    const typeLabel = { '单项选择题': '一、单项选择题', '多项选择题': '二、多项选择题', '判断对错题': '三、判断对错题' };
    const typeIcon = { '单项选择题': '📝', '多项选择题': '📋', '判断对错题': '⚖️' };

    return (
      <div className="chapter-practice">
        <div className="practice-header">
          <button className="back-btn" onClick={() => setExamAnswerSheet(false)}>◀ 返回答题</button>
          <span className="practice-title">答题卡</span>
          <span className="practice-stats">已答 {Object.keys(answers).length}/{examQuestions.length}</span>
        </div>

        <div className="answer-sheet-overview">
          <div className="as-overview-stat">
            <span className="as-overview-num">{examQuestions.length}</span>
            <span className="as-overview-label">总题</span>
          </div>
          <div className="as-overview-stat correct">
            <span className="as-overview-num">{Object.keys(answers).filter(k => {
              const q = examQuestions.find(eq => getQuestionKey(eq) === k);
              return q && answers[k] === q.answer;
            }).length}</span>
            <span className="as-overview-label">已答</span>
          </div>
          <div className="as-overview-stat">
            <span className="as-overview-num">{examQuestions.length - Object.keys(answers).length}</span>
            <span className="as-overview-label">未答</span>
          </div>
        </div>

        {Object.entries(typeGroups).map(([type, qs]) => (
          <div key={type} className="as-type-group">
            <div className="as-type-header">
              {typeIcon[type]} {typeLabel[type]}
              <span className="as-type-count">
                {qs.filter(q => !!answers[getQuestionKey(q)]).length}/{qs.length}
              </span>
            </div>
            <div className="as-question-grid">
              {qs.map((q) => {
                const key = getQuestionKey(q);
                const has = !!answers[key];
                const inc = q.type === '多项选择题' && answers[key] && answers[key].length === 1;
                let status = 'unanswered';
                if (has) status = 'completed';
                if (inc) status = 'completed'; // 已答但可能不完整
                return (
                  <button
                    key={key}
                    className={`as-q-btn ${status}`}
                    onClick={() => {
                      setCurrentIndex(q._idx);
                      setExamAnswerSheet(false);
                    }}
                    title={inc ? '多选题只选了1个' : (has ? '已作答' : '未作答')}
                  >
                    {q._idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ======== 考试中 ========
  if (examState === EXAM_STATE.RUNNING) {
    const currentQuestion = examQuestions[currentIndex];
    const answeredCount = Object.keys(answers).length;
    const isTimeWarning = timeLeft <= 300;
    const currentKey = currentQuestion ? getQuestionKey(currentQuestion) : '';
    const typeSection = getTypeSection(currentIndex);
    const typeLabel = { '单项选择题': '一、单项选择题', '多项选择题': '二、多项选择题', '判断对错题': '三、判断对错题' };

    return (
      <div className="exam-running">
        <div className="exam-top-bar">
          <div className={`exam-timer ${isTimeWarning ? 'warning' : ''}`}>⏱️ {fmt(timeLeft)}</div>
          <div className="exam-answered">已答 {answeredCount}/{examQuestions.length}</div>
          <button className="submit-exam-btn" onClick={() => setExamAnswerSheet(true)}>📋 答题卡</button>
          <button className="submit-exam-btn" onClick={handleSubmitClick}>交卷</button>
        </div>
        {typeSection && <div className="exam-type-divider">{typeLabel[typeSection] || typeSection}</div>}
        {currentQuestion && (
          <QuestionCard
            question={currentQuestion}
            examMode={true}
            examAnswer={answers[currentKey] || ''}
            onExamSelect={handleExamSelect}
            onNext={() => setCurrentIndex(Math.min(currentIndex + 1, examQuestions.length - 1))}
            onPrev={() => setCurrentIndex(Math.max(currentIndex - 1, 0))}
            currentIndex={currentIndex}
            totalCount={examQuestions.length}
          />
        )}
      </div>
    );
  }

  // ======== 成绩报告 ========
  const r = getResults();
  const passed = r.score >= 60;

  // 答题卡视图
  if (viewAnswerSheet) {
    // 按题型分组
    const typeGroups = {};
    examQuestions.forEach((q, idx) => {
      const type = q.type;
      if (!typeGroups[type]) typeGroups[type] = [];
      typeGroups[type].push({ ...q, _idx: idx });
    });

    // 选中的题目
    const selectedQ = selectedQuestionIndex != null ? examQuestions[selectedQuestionIndex] : null;
    const selectedKey = selectedQ ? getQuestionKey(selectedQ) : null;
    const selectedUa = selectedKey ? answers[selectedKey] : null;
    const selectedIsCorrect = selectedKey && selectedQ ? selectedUa === selectedQ.answer : false;
    const selectedUserText = selectedQ
      ? (selectedQ.type === '判断对错题' ? selectedUa : (selectedUa || ''))
      : '';

    return (
      <div className="chapter-practice">
        <div className="practice-header">
          <button className="back-btn" onClick={() => setViewAnswerSheet(false)}>◀ 返回成绩报告</button>
          <span className="practice-title">答题卡</span>
          <span className="practice-stats">{r.correct}/{r.total} 正确</span>
          <button className="action-btn primary" onClick={() => setExamState(EXAM_STATE.SETUP)}>重新考试</button>
        </div>

        {/* 答题卡总览 */}
        <div className="answer-sheet-overview">
          <div className="as-overview-stat">
            <span className="as-overview-num">{r.total}</span>
            <span className="as-overview-label">总题</span>
          </div>
          <div className="as-overview-stat correct">
            <span className="as-overview-num">{r.correct}</span>
            <span className="as-overview-label">正确</span>
          </div>
          <div className="as-overview-stat wrong">
            <span className="as-overview-num">{r.wrong}</span>
            <span className="as-overview-label">错误</span>
          </div>
          <div className="as-overview-stat">
            <span className="as-overview-num">{r.unanswered}</span>
            <span className="as-overview-label">未答</span>
          </div>
        </div>

        {/* 选中题目详情 */}
        {selectedQ && (
          <div className="exam-selected-detail">
            <div className="detail-header">
              <span className="detail-q-num">第 {selectedQuestionIndex + 1} 题</span>
              <span className={`detail-result ${selectedIsCorrect ? 'correct' : selectedUa ? 'wrong' : 'unanswered'}`}>
                {selectedIsCorrect ? '✓ 正确' : selectedUa ? `✗ 错误（你的答案：${selectedUa.toUpperCase()}）` : '○ 未作答'}
              </span>
              {!selectedIsCorrect && selectedQ.answer && (
                <span className="detail-correct">正确答案：{selectedQ.answer.toUpperCase()}</span>
              )}
            </div>
            <p className="detail-question">{selectedQ.question}</p>
            {selectedQ.options && Object.keys(selectedQ.options).length > 0 && (
              <div className="detail-options">
                {Object.entries(selectedQ.options).map(([k, v]) => {
                  const isCorrectOpt = selectedQ.answer.includes(k);
                  const isUserOpt = selectedUa && selectedUa.includes(k);
                  return (
                    <div key={k} className={`detail-opt ${isCorrectOpt ? 'opt-correct' : ''} ${isUserOpt && !isCorrectOpt ? 'opt-wrong' : ''}`}>
                      <span className="detail-opt-key">{k.toUpperCase()}.</span>
                      <span className="detail-opt-text">{v}</span>
                      {isCorrectOpt && <span className="opt-badge correct">✓</span>}
                      {isUserOpt && !isCorrectOpt && <span className="opt-badge wrong">✗</span>}
                    </div>
                  );
                })}
              </div>
            )}
            {selectedQ.type === '判断对错题' && (
              <div className="detail-judge-row">
                <span className={`detail-judge-opt ${selectedQ.answer === '√' ? 'opt-correct' : ''} ${selectedUa === '√' && selectedQ.answer !== '√' ? 'opt-wrong' : ''}`}>✓ 正确</span>
                <span className={`detail-judge-opt ${selectedQ.answer === '×' ? 'opt-correct' : ''} ${selectedUa === '×' && selectedQ.answer !== '×' ? 'opt-wrong' : ''}`}>✗ 错误</span>
              </div>
            )}
            <QuestionAI
              question={selectedQ}
              userAnswer={selectedUserText}
              isCorrect={selectedIsCorrect}
              store={store}
            />
          </div>
        )}

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
                  {qs.filter(q => !!answers[getQuestionKey(q)]).length}/{qs.length}
                </span>
              </div>
              <div className="as-question-grid">
                {qs.map((q) => {
                  const key = getQuestionKey(q);
                  const ua = answers[key];
                  const isCorrect = ua === q.answer;
                  const isAnswered = !!ua;

                  let status = 'unanswered';
                  if (isAnswered && isCorrect) status = 'correct';
                  else if (isAnswered && !isCorrect) status = 'wrong';

                  return (
                    <button
                      key={key}
                      className={`as-q-btn ${status} ${selectedQuestionIndex === q._idx ? 'current' : ''}`}
                      onClick={() => setSelectedQuestionIndex(q._idx === selectedQuestionIndex ? null : q._idx)}
                      title={
                        status === 'correct' ? '✓ 正确' :
                        status === 'wrong' ? `✗ 错误（你的答案：${ua?.toUpperCase?.() || ua}）` :
                        '未作答'
                      }
                    >
                      {q._idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="result-actions">
          <button className="action-btn primary" onClick={() => setExamState(EXAM_STATE.SETUP)}>重新考试</button>
        </div>
      </div>
    );
  }

  return (
    <div className="exam-results">
      <div className="practice-header">
        <h3 className="module-title" style={{ marginBottom: 0 }}><span className="title-icon">📊</span>考试成绩报告</h3>
        <button className="action-btn" onClick={() => setViewAnswerSheet(true)} style={{ marginLeft: 'auto' }}>
          📋 查看答题卡
        </button>
      </div>
      <div className={`score-card ${passed ? 'passed' : 'failed'}`}>
        <div className="score-number">{r.score}</div>
        <div className="score-label">分</div>
        <div className={`score-status ${passed ? '' : 'fail'}`}>{passed ? '✓ 恭喜通过！' : '✗ 未通过'}</div>
      </div>
      <div className="result-stats-grid">
        <div className="result-stat-item"><span className="stat-value">{r.total}</span><span className="stat-label">总题数</span></div>
        <div className="result-stat-item correct"><span className="stat-value">{r.correct}</span><span className="stat-label">正确</span></div>
        <div className="result-stat-item wrong"><span className="stat-value">{r.wrong}</span><span className="stat-label">错误</span></div>
        <div className="result-stat-item"><span className="stat-value">{r.unanswered}</span><span className="stat-label">未答</span></div>
      </div>
      <div className="type-stats-row">
        <div className="type-stat-item"><span className="type-stat-label">📝 单选</span><span className="type-stat-value">{r.typeStats.single.correct}/{r.typeStats.single.total}</span></div>
        <div className="type-stat-item"><span className="type-stat-label">📋 多选</span><span className="type-stat-value">{r.typeStats.multi.correct}/{r.typeStats.multi.total}</span></div>
        <div className="type-stat-item"><span className="type-stat-label">⚖️ 判断</span><span className="type-stat-value">{r.typeStats.judge.correct}/{r.typeStats.judge.total}</span></div>
      </div>
      <div className="chapter-results">
        <h4>各章节得分</h4>
        {Object.entries(r.chapterStats).map(([ch, s]) => (
          <div key={ch} className="chapter-result-row">
            <span className="chapter-result-name">{ch}</span>
            <div className="chapter-result-bar"><div className="chapter-result-fill" style={{ width: `${s.total > 0 ? (s.correct/s.total)*100 : 0}%` }}></div></div>
            <span className="chapter-result-score">{s.correct}/{s.total}</span>
          </div>
        ))}
      </div>
      {r.wrongQuestions.length > 0 && (
        <div className="wrong-questions-section">
          <h4>错题列表 ({r.wrongQuestions.length} 题)</h4>
          <div className="wrong-questions-list">
            {r.wrongQuestions.map((q, i) => {
              const key = getQuestionKey(q);
              return (
                <div key={key} className="wrong-question-item">
                  <div className="wrong-q-num">{i + 1}</div>
                  <div className="wrong-q-content">
                    <p className="wrong-q-text">{q.question}</p>
                    <div className="wrong-q-answers">
                      <span className="user-answer">你的答案：{(answers[key] || '未作答').toUpperCase()}</span>
                      <span className="correct-answer">正确答案：{q.answer.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="result-actions">
        <button className="action-btn primary" onClick={() => setExamState(EXAM_STATE.SETUP)}>重新考试</button>
      </div>
    </div>
  );
}
