// src/App.jsx
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import './App.css';

const blastTopics = [
  {
    id: 1,
    depth: "-120m",
    title: "沟槽效应",
    videoSrc: "/videos/trench.mp4",
    slug: "trench"
  },
  {
    id: 2,
    depth: "-300m",
    title: "装药结构",
    videoSrc: "/videos/uncoupled.mp4",
    slug: "uncoupled"
  },
  {
    id: 3,
    depth: "-600m",
    title: "殉爆",
    videoSrc: "/videos/catastrophic_explosion.mp4",
    slug: "catastrophic_explosion"
  },
  {
    id: 4,
    depth: "-700m",
    title: "起爆方法",
    videoSrc: "/videos/initiation.mp4",
    slug: "initiation"
  },
  {
    id: 5,
    depth: "-800m",
    title: "炸药类型",
    videoSrc: "/videos/type.mp4",
    slug: "type"
  }
];

// 左侧的知识点解析面板组件（集成了智能助手）
const AnalysisPanel = ({ topic, content, onClose }) => {
  const [panelWidth, setPanelWidth] = useState(400);
  const [activeTab, setActiveTab] = useState('markdown');
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 300 && newWidth <= 800) {
        setPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = 'default';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleMouseDown = (e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = 'ew-resize';
  };

  // AI 助手的状态管理
  const [chats, setChats] = useState(() => {
    try {
      const savedChats = localStorage.getItem('ai_chats');
      if (savedChats) {
        return JSON.parse(savedChats);
      }
    } catch (e) {
      console.warn("读取本地缓存失败", e);
    }
    return [{ id: Date.now().toString(), topicTitle: topic.title, topicId: topic.id, messages: [] }];
  });

  const [currentChatId, setCurrentChatId] = useState(() => chats.length > 0 ? chats[0].id : null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    localStorage.setItem('ai_chats', JSON.stringify(chats));
  }, [chats]);

  const currentChat = chats.find(c => c.id === currentChatId);
  const messages = currentChat ? currentChat.messages : [];

  const createNewChat = () => {
    const newChatId = Date.now().toString();
    setChats(prev => [{ id: newChatId, topicTitle: topic.title, topicId: topic.id, messages: [] }, ...prev]);
    setCurrentChatId(newChatId);
    setShowHistory(false);
  };

  const deleteChat = (e, targetId) => {
    e.stopPropagation();
    const updatedChats = chats.filter(c => c.id !== targetId);
    setChats(updatedChats);
    if (currentChatId === targetId) {
      setCurrentChatId(updatedChats.length > 0 ? updatedChats[0].id : null);
    }
  };

  const clearAllChats = () => {
    if (window.confirm(">> WARNING: AUTHORIZATION REQUIRED.\n即将永久擦除所有测算记录！此操作不可逆，是否继续？")) {
      setChats([]);
      setCurrentChatId(null);
    }
  };

  const getTopicColorClass = (topicId) => {
    if (!topicId) return 'color-default';
    const num = (topicId % 4) + 1; // 1 to 4
    return `color-${num}`;
  };

  const [inputVal, setInputVal] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  // 每次消息更新，自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!inputVal.trim() || isTyping) return;

    const userQ = inputVal.trim();
    setInputVal("");

    // 1. 将用户问题上屏，只更新当前会话的 messages
    setChats(prevChats => prevChats.map(c =>
      c.id === currentChatId
        ? { ...c, messages: [...c.messages, { role: 'user', content: userQ }] }
        : c
    ));
    setIsTyping(true);

    // 2. 预先推入一条空的 assistant 消息，用于稍后拼接流式字符
    setChats(prevChats => prevChats.map(c =>
      c.id === currentChatId
        ? { ...c, messages: [...c.messages, { role: 'assistant', content: '' }] }
        : c
    ));

    try {
      // 🚀 组装发送给后端服务器的数据
      const messagesPayload = [
        {
          role: 'system',
          // 动态注入当前 Markdown 解析的内容作为背景知识
          content: `>> SYSTEM OVERRIDE.\n你是一个硬核的爆破工程专家。已载入机密文档：\n${content}\n请严格基于上述资料回答用户问题。回答请保持极客、冷峻的工业风格。`
        },
        // 可以选择性地把之前的历史消息也发过去（视你的需求而定）
        // ...messages, 
        {
          role: 'user',
          content: userQ
        }
      ];

      // ✅ 现在的写法（访问本地 Node.js 后端代理）
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages: messagesPayload })
      });

      if (!response.ok) throw new Error('UPLINK FAILED: 网络通信异常');

      // 3. 解析真实的流式数据 (Server-Sent Events)
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          // 火山引擎返回的是多行 SSE 数据，按换行符拆分
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            // [DONE] 表示流式输出结束
            if (line.includes('[DONE]')) {
              break;
            }
            if (line.startsWith('data: ')) {
              try {
                // 解析返回的 JSON 块
                const data = JSON.parse(line.slice(6));
                const textDelta = data.choices[0]?.delta?.content || "";

                if (textDelta) {
                  // 实时拼接字符到最后一条消息中
                  setChats(prevChats => prevChats.map(c => {
                    if (c.id === currentChatId) {
                      const messagesCopy = [...c.messages];
                      const lastIndex = messagesCopy.length - 1;

                      if (lastIndex >= 0) {
                        messagesCopy[lastIndex] = {
                          ...messagesCopy[lastIndex],
                          content: messagesCopy[lastIndex].content + textDelta
                        };
                      }
                      return { ...c, messages: messagesCopy };
                    }
                    return c;
                  }));
                }
              } catch (e) {
                console.warn("解析数据块流出错", e, line);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      setChats(prevChats => prevChats.map(c => {
        if (c.id === currentChatId) {
          const messagesCopy = [...c.messages];
          const lastIndex = messagesCopy.length - 1;
          if (lastIndex >= 0) {
            messagesCopy[lastIndex] = {
              ...messagesCopy[lastIndex],
              content: '>> ERROR: 连接中枢失败，请检查网络协议。'
            };
          }
          return { ...c, messages: messagesCopy };
        }
        return c;
      }));
    } finally {
      setIsTyping(false); // 无论成功失败，结束打字状态
    }
  };

  return (
    <motion.aside
      className="analysis-panel"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 18, stiffness: 150 }}
      style={{ width: `${panelWidth}px` }}
    >
      <div
        className="panel-resize-handle"
        onMouseDown={handleMouseDown}
      ></div>
      <div className="panel-header" style={{ justifyContent: "space-between" }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="blink-dot"></span>
          知识点解析
        </div>
        <button className="close-panel-btn" onClick={onClose}>×</button>
      </div>

      {/* 选项卡切换区 */}
      <div className="panel-tabs">
        <button
          className={`panel-tab-btn ${activeTab === 'markdown' ? 'active' : ''}`}
          onClick={() => setActiveTab('markdown')}
        >
          [ 📜 文档资料 ]
        </button>
        <button
          className={`panel-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          [ 🤖 AI 助手 ]
        </button>
      </div>

      {/* 上半部分：滚动的 Markdown 资料区 */}
      {activeTab === 'markdown' && (
        <div className="panel-top-markdown" style={{ borderBottom: 'none', margin: 0 }}>
          <motion.div
            className="react-markdown-container"
            key={topic.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <ReactMarkdown>
              {content || "LOADING DATA STREAM..."}
            </ReactMarkdown>
          </motion.div>
        </div>

      )}

      {/* 下半部分：AI 智能爆破助手通讯区 */}
      {activeTab === 'ai' && (
        <div className="panel-ai-section" style={{ minHeight: '0', flex: 1 }}>
          <div className="panel-ai-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>[ COMM-LINK ESTABLISHED ]</span>
            <div>
              <button
                onClick={() => setShowHistory(!showHistory)}
                style={{ background: 'transparent', border: '1px solid rgba(0,255,204,0.5)', color: '#00ffcc', padding: '2px 8px', cursor: 'pointer', fontSize: '12px' }}
              >
                {showHistory ? '◄ 返回聊天' : '会话历史'}
              </button>
              <button
                onClick={createNewChat}
                style={{ background: 'rgba(0,255,204,0.1)', border: '1px solid #00ffcc', color: '#00ffcc', padding: '2px 8px', cursor: 'pointer', marginLeft: '5px', fontSize: '12px' }}
              >
                + 新建聊天
              </button>
            </div>
          </div>

          {showHistory ? (
            <div className="panel-ai-messages" style={{ display: 'block' }}>
              {chats.length === 0 ? (
                <div className="no-session-text">
                  &gt;&gt; NO ACTIVE SESSIONS.<br />待命状态...
                </div>
              ) : (
                chats.map(c => {
                  const firstMsg = c.messages.find(m => m.role === 'user');
                  const previewText = firstMsg ? firstMsg.content.slice(0, 15) : "新会话 (无记录)";
                  const isActive = c.id === currentChatId;
                  const tagClass = getTopicColorClass(c.topicId);
                  return (
                    <div
                      key={c.id}
                      className={`history-item ${isActive ? 'active' : ''}`}
                      onClick={() => { setCurrentChatId(c.id); setShowHistory(false); }}
                    >
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px', color: '#eee' }}>
                        <span className={`history-tag ${tagClass}`}>
                          {c.topicTitle ? c.topicTitle.substring(0, 4) : 'SYS'}
                        </span>
                        {previewText}...
                      </div>
                      <button
                        onClick={(e) => deleteChat(e, c.id)}
                        style={{ background: 'transparent', border: 'none', color: '#f55', cursor: 'pointer', padding: '0 5px', fontSize: '18px' }}
                        title="删除会话"
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              )}

              {chats.length > 0 && (
                <button className="danger-clear-btn" onClick={clearAllChats}>
                  [ ⚠ PURGE ALL RECORDS ]
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="panel-ai-messages">
                {!currentChatId ? (
                  <div className="no-session-text">
                    &gt;&gt; NO ACTIVE SESSIONS.<br />待命状态...<br />请返回侧边栏或新建测算记录。
                  </div>
                ) : (
                  <>
                    {messages.length === 0 && (
                      <div className="radar-bubble assistant" style={{ opacity: 0.6 }}>
                        SYSTEM: 智能测算单元闲置中。可基于上方资料输入测算指令。
                      </div>
                    )}
                    {messages.map((m, i) => (
                      <div key={i} className={`radar-bubble ${m.role} ${m.role === 'assistant' ? 'markdown-bubble' : ''}`}>
                        {m.role === 'assistant' ? (
                          <div className="react-markdown-container ai-markdown">
                            <ReactMarkdown>
                              {m.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          m.content
                        )}
                      </div>
                    ))}
                    {isTyping && <div className="radar-typing">ANALYZING...</div>}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              <div className="panel-ai-input-bar">
                <input
                  type="text"
                  className="radar-input"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="[ 输入查询指令 ]"
                  disabled={isTyping || !currentChatId}
                />
                <button
                  className="radar-send-btn"
                  onClick={handleSend}
                  disabled={isTyping || !inputVal.trim() || !currentChatId}
                >
                  ↗
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </motion.aside>
  );
};


function App() {
  const [activeTopicId, setActiveTopicId] = useState(blastTopics[0].id);
  const activeTopic = blastTopics.find(t => t.id === activeTopicId);
  const [markdownContent, setMarkdownContent] = useState("");
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    setMarkdownContent("");
    import(`./content/${activeTopic.slug}.md?raw`)
      .then(res => setMarkdownContent(res.default))
      .catch(() => setMarkdownContent("[ERROR] 数据读取中断"));
  }, [activeTopic.slug]);

  return (
    <div className="app-container">
      {/* 左侧侧边栏 */}
      <aside className="sidebar">
        <h2 className="sidebar-title">地质深度刻度盘</h2>
        <div className="depth-gauge-container">
          <div className="gauge-line"></div>
          <div className="gauge-nodes">
            {blastTopics.map(topic => {
              const isActive = topic.id === activeTopicId;
              return (
                <div
                  key={topic.id}
                  className={`gauge-node ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveTopicId(topic.id)}
                >
                  <div className="node-indicator">
                    <div className="dot"></div>
                    {isActive && <div className="glow-ring"></div>}
                  </div>
                  <div className="node-info">
                    <div className="node-depth">{topic.depth}</div>
                    <div className="node-title">{topic.title}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ marginTop: 'auto', textAlign: 'center', color: '#555', fontSize: '0.8rem' }}>
          <Link to="/learn" style={{
            display: 'block', margin: '15px 0', padding: '10px 15px',
            background: 'rgba(0,255,204,0.08)', border: '1px solid rgba(0,255,204,0.3)',
            borderRadius: '4px', color: '#00ffcc', textDecoration: 'none',
            fontFamily: "'Courier New', monospace", fontWeight: 'bold',
            letterSpacing: '2px', fontSize: '0.85rem', transition: 'all 0.3s',
            textAlign: 'center'
          }}>[ 📖 在线学习 ]</Link>
          <p>SYSTEM INITIALIZED</p>
        </div>
      </aside>

      {/* 右侧主屏 */}
      <main className="main-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTopicId}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="video-layer-container"
          >
            <div className="hud-title-overlay">
              <h1 className="main-title">{activeTopic.title}</h1>
              <p className="main-subtitle">
                当前观测深度: <span style={{ color: "#00ffcc", fontWeight: "bold" }}>{activeTopic.depth}</span>
                <span className="blinking-cursor">_</span>
              </p>
            </div>

            <div className="video-wrapper">
              <video
                src={activeTopic.videoSrc}
                autoPlay
                muted
                loop
                playsInline
                className="manim-video"
              >
                您的浏览器不支持视频播放。
              </video>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* 呼出面板拉环 */}
        <div
          className={`panel-toggle-tab ${isPanelOpen ? 'open' : ''}`}
          onClick={() => setIsPanelOpen(!isPanelOpen)}
        >
          {isPanelOpen ? '关闭' : '知识点详解'}
        </div>

        {/* 解析面板覆盖层 */}
        <AnimatePresence>
          {isPanelOpen && (
            <AnalysisPanel
              topic={activeTopic}
              content={markdownContent}
              onClose={() => setIsPanelOpen(false)}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default App;
