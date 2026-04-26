// src/pages/learn/QuestionAI.jsx
// AI 智能解析组件 - 嵌入答题卡底部
// 使用当前题目作为上下文，提供快捷问题和自由追问

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

/**
 * 生成快捷问题按钮列表
 */
function getQuickQuestions(question, userAnswer, isCorrect) {
  const questions = [
    { label: '📖 查看题目解析', prompt: '请详细解析这道题的答案，说明为什么正确答案是这个。' },
  ];
  if (!isCorrect && userAnswer) {
    questions.push({
      label: `❌ 为什么不选 ${userAnswer.toUpperCase()}`,
      prompt: `我选了 ${userAnswer.toUpperCase()}，为什么这个选项是错误的？请详细解释。`
    });
  }
  questions.push(
    { label: '📚 相关知识点', prompt: '请总结这道题涉及的核心知识点，帮助我理解和记忆。' },
    { label: '💡 记忆技巧', prompt: '请给出记忆这道题答案的技巧或口诀。' },
  );
  return questions;
}

export default function QuestionAI({ question, userAnswer, isCorrect, store }) {
  const questionKey = `${question.chapter}_${question.id}`;

  // 尝试从 store 恢复历史对话；每次题目变化时重新加载
  const [messages, setMessages] = useState(() => {
    if (store && store.getAIChat) {
      const saved = store.getAIChat(questionKey);
      if (saved && saved.messages) return saved.messages;
    }
    return [];
  });
  const [inputVal, setInputVal] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  // 每次题目变化，加载新的对话（或空）
  useEffect(() => {
    if (store && store.getAIChat) {
      const saved = store.getAIChat(questionKey);
      if (saved && saved.messages && saved.messages.length > 0) {
        setMessages(saved.messages);
      } else {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
    setInputVal('');
    setIsTyping(false);
  }, [questionKey]);

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  /**
   * 构建 system prompt
   */
  const buildSystemPrompt = () => {
    const optionsText = question.options && Object.keys(question.options).length > 0
      ? Object.entries(question.options).map(([k, v]) => `${k.toUpperCase()}. ${v}`).join('\n')
      : '';
    const typeText = question.type === '判断对错题' ? '判断题（对/错）' : question.type;

    return `你是一个爆破作业员考试辅导专家。以下是学生正在练习的题目：

题型：${typeText}
题目：${question.question}
${optionsText ? `选项：\n${optionsText}` : ''}
正确答案：${question.answer}
${userAnswer ? `学生选择的答案：${userAnswer}` : ''}
${isCorrect !== undefined ? `答题结果：${isCorrect ? '正确' : '错误'}` : ''}

请基于这道题目回答学生的问题。回答要准确、简洁、易懂。使用中文回答。`;
  };

  /**
   * 发送消息（复用主站 /api/chat SSE 流式接口）
   */
  const sendMessage = async (userMsg) => {
    if (!userMsg.trim() || isTyping) return;

    const userMsgObj = { role: 'user', content: userMsg };
    // 构建完整对话（包含旧消息 + 用户新消息）
    const conversationHistory = [...messages, userMsgObj];

    // 用户消息上屏
    setMessages(conversationHistory);
    setInputVal('');
    setIsTyping(true);

    // 预推入空 assistant 消息
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const messagesPayload = [
        { role: 'system', content: buildSystemPrompt() },
        ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
      ];

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesPayload }),
      });

      if (!response.ok) throw new Error('AI 服务连接失败');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let fullResponse = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.includes('[DONE]')) break;
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                const textDelta = data.choices[0]?.delta?.content || '';
                if (textDelta) {
                  fullResponse += textDelta;
                  setMessages(prev => {
                    const copy = [...prev];
                    const last = copy.length - 1;
                    if (last >= 0) {
                      copy[last] = { ...copy[last], content: fullResponse };
                    }
                    return copy;
                  });
                }
              } catch (e) {
                // 解析失败，跳过
              }
            }
          }
        }
      }

      // 对话结束后，将完整对话保存到 store
      setMessages(prev => {
        if (store && store.saveAIChat) {
          store.saveAIChat(questionKey, prev);
        }
        return prev;
      });
    } catch (error) {
      setMessages(prev => {
        const copy = [...prev];
        const last = copy.length - 1;
        if (last >= 0) {
          copy[last] = { ...copy[last], content: '⚠ AI 连接失败，请检查网络后重试。' };
        }
        return copy;
      });
    } finally {
      setIsTyping(false);
    }
  };

  const quickQuestions = getQuickQuestions(question, userAnswer, isCorrect);

  return (
    <div className="question-ai-container">
      <div className="question-ai-header">
        <span className="ai-indicator"></span>
        AI 智能解析
      </div>

      {/* 快捷问题按钮 */}
      {messages.length === 0 && (
        <div className="quick-questions">
          {quickQuestions.map((qq, i) => (
            <button
              key={i}
              className="quick-question-btn"
              onClick={() => sendMessage(qq.prompt)}
              disabled={isTyping}
            >
              {qq.label}
            </button>
          ))}
        </div>
      )}

      {/* 对话消息 */}
      {messages.length > 0 && (
        <div className="ai-messages">
          {messages.map((m, i) => (
            <div key={i} className={`ai-bubble ${m.role}`}>
              {m.role === 'assistant' ? (
                <div className="react-markdown-container ai-markdown">
                  <ReactMarkdown>{m.content || '...'}</ReactMarkdown>
                </div>
              ) : (
                m.content
              )}
            </div>
          ))}
          {isTyping && <div className="ai-typing-indicator">AI 正在思考...</div>}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* 输入框 */}
      {messages.length > 0 && (
        <div className="ai-input-bar">
          <input
            type="text"
            className="ai-input"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage(inputVal)}
            placeholder="继续追问..."
            disabled={isTyping}
          />
          <button
            className="ai-send-btn"
            onClick={() => sendMessage(inputVal)}
            disabled={isTyping || !inputVal.trim()}
          >
            ↗
          </button>
        </div>
      )}
    </div>
  );
}
