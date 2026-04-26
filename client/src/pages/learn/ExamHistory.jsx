// src/pages/learn/ExamHistory.jsx
// 考试历史记录组件
// 支持查看历史答题卡详情

import { useState } from 'react';
import QuestionAI from './QuestionAI';

export default function ExamHistory({ store, questions, onBack }) {
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'detail'
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState(null);

  if (viewMode === 'detail' && selectedRecord) {
    // 按题型分组
    const typeGroups = {};
    selectedRecord.details.forEach((item, idx) => {
      const q = questions.find(q => `${q.chapter}_${q.id}` === item.questionKey);
      if (!q) return;
      const type = q.type;
      if (!typeGroups[type]) typeGroups[type] = [];
      typeGroups[type].push({ ...item, _q: q, _idx: idx });
    });

    // 选中的题目
    const selectedItem = selectedQuestionIndex != null ? selectedRecord.details[selectedQuestionIndex] : null;
    const selectedQ = selectedItem ? questions.find(q => `${q.chapter}_${q.id}` === selectedItem.questionKey) : null;
    const isCorrect = selectedItem ? selectedItem.isCorrect : false;
    const userText = selectedQ ? (selectedQ.type === '判断对错题' ? selectedItem.userAnswer : (selectedItem.userAnswer || '')) : '';

    const typeLabel = { '单项选择题': '一、单项选择题', '多项选择题': '二、多项选择题', '判断对错题': '三、判断对错题' };
    const typeIcon = { '单项选择题': '📝', '多项选择题': '📋', '判断对错题': '⚖️' };

    return (
      <div className="exam-history-detail">
        <div className="detail-header">
          <button className="back-btn" onClick={() => { setViewMode('list'); setSelectedRecord(null); setSelectedQuestionIndex(null); }}>
            ◀ 返回列表
          </button>
          {onBack && (
            <button className="back-btn" onClick={onBack}>◀ 返回考试设置</button>
          )}
          <div className="detail-meta">
            <span className="detail-date">{formatDate(selectedRecord.timestamp)}</span>
            <span className={`detail-score ${selectedRecord.score >= 60 ? 'passed' : 'failed'}`}>
              {selectedRecord.score} 分
            </span>
          </div>
          <button
            className="action-btn danger"
            onClick={() => {
              store.deleteExamRecord(selectedRecord.id);
              setViewMode('list');
              setSelectedRecord(null);
              setSelectedQuestionIndex(null);
            }}
          >
            删除记录
          </button>
        </div>

        {/* 成绩概览 */}
        <div className="detail-score-overview">
          <div className={`score-card ${selectedRecord.score >= 60 ? 'passed' : 'failed'}`}>
            <div className="score-number">{selectedRecord.score}</div>
            <div className="score-label">分</div>
          </div>
          <div className="result-stats-grid">
            <div className="result-stat-item"><span className="stat-value">{selectedRecord.total}</span><span className="stat-label">总题数</span></div>
            <div className="result-stat-item correct"><span className="stat-value">{selectedRecord.correct}</span><span className="stat-label">正确</span></div>
            <div className="result-stat-item wrong"><span className="stat-value">{selectedRecord.wrong}</span><span className="stat-label">错误</span></div>
            <div className="result-stat-item"><span className="stat-value">{selectedRecord.unanswered}</span><span className="stat-label">未答</span></div>
          </div>
        </div>

        {/* 题型统计 */}
        <div className="type-stats-row">
          <div className="type-stat-item"><span className="type-stat-label">单选</span><span className="type-stat-value">{selectedRecord.typeStats?.single?.correct || 0}/{selectedRecord.typeStats?.single?.total || 0}</span></div>
          <div className="type-stat-item"><span className="type-stat-label">多选</span><span className="type-stat-value">{selectedRecord.typeStats?.multi?.correct || 0}/{selectedRecord.typeStats?.multi?.total || 0}</span></div>
          <div className="type-stat-item"><span className="type-stat-label">判断</span><span className="type-stat-value">{selectedRecord.typeStats?.judge?.correct || 0}/{selectedRecord.typeStats?.judge?.total || 0}</span></div>
        </div>

        {/* 章节得分 */}
        {Object.keys(selectedRecord.chapterStats || {}).length > 0 && (
          <div className="chapter-results">
            <h4>各章节得分</h4>
            {Object.entries(selectedRecord.chapterStats).map(([ch, s]) => (
              <div key={ch} className="chapter-result-row">
                <span className="chapter-result-name">{ch}</span>
                <div className="chapter-result-bar">
                  <div className="chapter-result-fill" style={{ width: `${s.total > 0 ? (s.correct / s.total) * 100 : 0}%` }}></div>
                </div>
                <span className="chapter-result-score">{s.correct}/{s.total}</span>
              </div>
            ))}
          </div>
        )}

        {/* 答题卡 */}
        <div className="answer-sheet-section">
          <h4>答题卡</h4>

          {/* 选中题目详情 */}
          {selectedQ && (
            <div className="exam-selected-detail">
              <div className="detail-header">
                <span className="detail-q-num">第 {selectedQuestionIndex + 1} 题</span>
                <span className={`detail-result ${isCorrect ? 'correct' : selectedItem?.answered ? 'wrong' : 'unanswered'}`}>
                  {isCorrect ? '✓ 正确' : selectedItem?.answered ? `✗ 错误（你的答案：${(selectedItem.userAnswer || '').toUpperCase()}）` : '○ 未作答'}
                </span>
                {!isCorrect && selectedQ.answer && (
                  <span className="detail-correct">正确答案：{selectedQ.answer.toUpperCase()}</span>
                )}
              </div>
              <p className="detail-question">{selectedQ.question}</p>
              {selectedQ.options && Object.keys(selectedQ.options).length > 0 && (
                <div className="detail-options">
                  {Object.entries(selectedQ.options).map(([k, v]) => {
                    const isCorrectOpt = selectedQ.answer.includes(k);
                    const isUserOpt = selectedItem?.userAnswer && selectedItem.userAnswer.includes(k);
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
                  <span className={`detail-judge-opt ${selectedQ.answer === '√' ? 'opt-correct' : ''} ${selectedItem?.userAnswer === '√' && selectedQ.answer !== '√' ? 'opt-wrong' : ''}`}>✓ 正确</span>
                  <span className={`detail-judge-opt ${selectedQ.answer === '×' ? 'opt-correct' : ''} ${selectedItem?.userAnswer === '×' && selectedQ.answer !== '×' ? 'opt-wrong' : ''}`}>✗ 错误</span>
                </div>
              )}
              <QuestionAI
                question={selectedQ}
                userAnswer={userText}
                isCorrect={isCorrect}
                store={store}
              />
            </div>
          )}

          {/* 题型分组网格 */}
          {Object.entries(typeGroups).map(([type, items]) => (
            <div key={type} className="as-type-group">
              <div className="as-type-header">
                {typeIcon[type]} {typeLabel[type]}
                <span className="as-type-count">
                  {items.filter(it => !!it.answered).length}/{items.length}
                </span>
              </div>
              <div className="as-question-grid">
                {items.map((it) => {
                  let status = 'unanswered';
                  if (it.isCorrect) status = 'correct';
                  else if (it.answered) status = 'wrong';
                  return (
                    <button
                      key={it.questionKey}
                      className={`as-q-btn ${status} ${selectedQuestionIndex === it._idx ? 'current' : ''}`}
                      onClick={() => setSelectedQuestionIndex(it._idx === selectedQuestionIndex ? null : it._idx)}
                      title={
                        it.isCorrect ? '✓ 正确' :
                        it.answered ? `✗ 错误` : '未作答'
                      }
                    >
                      {it._idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 列表视图
  return (
    <div className="exam-history">
      <div className="history-list-header">
        <h3 className="module-title">
          <span className="title-icon">📋</span>历史答题卡
          <span className="history-count-badge">{store.examHistory.length}</span>
        </h3>
        <div className="header-actions">
          {onBack && (
            <button className="back-btn" onClick={onBack}>◀ 返回考试设置</button>
          )}
          {store.examHistory.length > 0 && (
            <button
              className="action-btn danger"
              onClick={() => {
                if (window.confirm('确定要清空所有历史记录吗？')) {
                  store.clearExamHistory();
                }
              }}
            >
              清空记录
            </button>
          )}
        </div>
      </div>

      {store.examHistory.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>暂无历史答题记录</p>
          <p className="empty-hint">完成模拟考试后会自动保存记录</p>
        </div>
      ) : (
        <div className="history-list">
          {store.examHistory.map((record) => (
            <div
              key={record.id}
              className={`history-item-card ${record.score >= 60 ? 'passed' : 'failed'}`}
              onClick={() => { setSelectedRecord(record); setViewMode('detail'); }}
            >
              <div className="history-card-left">
                <div className="history-score-circle">
                  <span className="history-score-num">{record.score}</span>
                  <span className="history-score-label">分</span>
                </div>
              </div>
              <div className="history-card-middle">
                <div className="history-card-title">
                  {record.score >= 60 ? '✓ 通过' : '✗ 未通过'}
                </div>
                <div className="history-card-stats">
                  <span>总题 {record.total}</span>
                  <span>✓ {record.correct}</span>
                  <span>✗ {record.wrong}</span>
                  {record.unanswered > 0 && <span>○ {record.unanswered} 未答</span>}
                </div>
                <div className="history-card-date">{formatDate(record.timestamp)}</div>
              </div>
              <div className="history-card-right">
                <button
                  className="history-view-btn"
                  onClick={(e) => { e.stopPropagation(); setSelectedRecord(record); setViewMode('detail'); }}
                >
                  查看答题卡 →
                </button>
                <button
                  className="history-delete-btn"
                  onClick={(e) => { e.stopPropagation(); store.deleteExamRecord(record.id); }}
                  title="删除此记录"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${day} ${h}:${min}`;
}
