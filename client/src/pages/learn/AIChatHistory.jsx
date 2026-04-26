// src/pages/learn/AIChatHistory.jsx
// AI 对话历史组件
// 查看历史 AI 解析对话记录

import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';

export default function AIChatHistory({ store, questions }) {
  const [selectedChat, setSelectedChat] = useState(null);

  const allChats = useMemo(() => store.getAllAIChats(), [store.aiChatHistory]);

  const getQuestionInfo = (questionKey) => {
    return questions.find(q => `${q.chapter}_${q.id}` === questionKey);
  };

  if (selectedChat) {
    const q = getQuestionInfo(selectedChat.questionKey);
    return (
      <div className="ai-chat-history-detail">
        <div className="detail-header">
          <button className="back-btn" onClick={() => setSelectedChat(null)}>
            ◀ 返回对话列表
          </button>
          {q && (
            <div className="detail-question-info">
              <span className="detail-q-type">
                {q.type === '单项选择题' ? '单选' : q.type === '多项选择题' ? '多选' : '判断'}
              </span>
              <span className="detail-q-chapter">{q.chapter}</span>
            </div>
          )}
          <button
            className="action-btn danger"
            onClick={() => {
              store.deleteAIChat(selectedChat.questionKey);
              setSelectedChat(null);
            }}
          >
            删除
          </button>
        </div>

        {q && (
          <div className="detail-question-card">
            <p className="detail-q-text">{q.question}</p>
            {q.options && Object.keys(q.options).length > 0 && (
              <div className="detail-q-options">
                {Object.entries(q.options).map(([k, v]) => (
                  <div
                    key={k}
                    className={`detail-q-option ${q.answer.includes(k) ? 'opt-correct' : ''}`}
                  >
                    <span className="detail-q-opt-key">{k.toUpperCase()}.</span>
                    <span className="detail-q-opt-text">{v}</span>
                    {q.answer.includes(k) && <span className="detail-q-opt-badge">正确答案</span>}
                  </div>
                ))}
              </div>
            )}
            {q.type === '判断对错题' && (
              <div className="detail-q-judge">
                <span className={`${q.answer === '√' ? 'opt-correct' : ''}`}>✓ 正确 {q.answer === '√' && '✓'}</span>
                <span className={`${q.answer === '×' ? 'opt-correct' : ''}`}>✗ 错误 {q.answer === '×' && '✓'}</span>
              </div>
            )}
            <div className="detail-q-answer">
              正确答案：<strong>{q.answer.toUpperCase()}</strong>
            </div>
          </div>
        )}

        <div className="detail-chat-messages">
          {selectedChat.messages.map((m, i) => (
            <div key={i} className={`ai-bubble ${m.role}`}>
              <div className={`ai-bubble-role ${m.role}`}>
                {m.role === 'user' ? '🙋 你' : '🤖 AI'}
              </div>
              <div className="ai-bubble-content">
                {m.role === 'assistant' ? (
                  <div className="react-markdown-container ai-markdown">
                    <ReactMarkdown>{m.content || '...'}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="user-msg-text">{m.content}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ai-chat-history">
      <div className="history-list-header">
        <h3 className="module-title">
          <span className="title-icon">🤖</span>AI 解析历史
          <span className="history-count-badge">{allChats.length}</span>
        </h3>
        {allChats.length > 0 && (
          <button
            className="action-btn danger"
            onClick={() => {
              if (window.confirm('确定要清空所有 AI 对话历史吗？')) {
                store.clearAIChatHistory();
              }
            }}
          >
            清空记录
          </button>
        )}
      </div>

      {allChats.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🤖</div>
          <p>暂无 AI 对话记录</p>
          <p className="empty-hint">在章节练习中提交答题后会显示 AI 解析</p>
        </div>
      ) : (
        <div className="history-list">
          {allChats.map((chat) => {
            const q = getQuestionInfo(chat.questionKey);
            const firstUserMsg = chat.messages.find(m => m.role === 'user');
            return (
              <div
                key={chat.questionKey}
                className="history-item-card ai-chat-card"
                onClick={() => setSelectedChat(chat)}
              >
                <div className="history-card-left">
                  <span className="ai-chat-icon">🤖</span>
                </div>
                <div className="history-card-middle">
                  <div className="history-card-title">
                    {q ? q.question.substring(0, 40) + (q.question.length > 40 ? '...' : '') : '未知题目'}
                  </div>
                  <div className="history-card-stats">
                    {q && (
                      <>
                        <span>
                          {q.type === '单项选择题' ? '单选' : q.type === '多项选择题' ? '多选' : '判断'}
                        </span>
                        <span>{q.chapter}</span>
                      </>
                    )}
                    <span>{chat.messages.length} 条消息</span>
                  </div>
                  <div className="history-card-date">{formatDate(chat.updatedAt)}</div>
                  {firstUserMsg && (
                    <div className="ai-chat-preview">
                      🙋 {firstUserMsg.content.substring(0, 30)}
                      {firstUserMsg.content.length > 30 ? '...' : ''}
                    </div>
                  )}
                </div>
                <div className="history-card-right">
                  <button
                    className="history-view-btn"
                    onClick={(e) => { e.stopPropagation(); setSelectedChat(chat); }}
                  >
                    查看对话 →
                  </button>
                  <button
                    className="history-delete-btn"
                    onClick={(e) => { e.stopPropagation(); store.deleteAIChat(chat.questionKey); }}
                    title="删除此记录"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
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
