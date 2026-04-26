const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const HISTORY_DIR = path.join(__dirname, 'data', 'history');

// 确保 data 目录存在
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}
// 确保 users.json 存在
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, '{}', 'utf-8');
}
// 确保 history 目录存在
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

// 读/写用户数据
function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); }
  catch { return {}; }
}
function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// 简单 token → userId 映射（内存中，重启后用户需重新登录）
const tokenStore = {};

// ======== 认证中间件 ========
function authMiddleware(req, res, next) {
  const token = req.cookies?.auth_token;
  if (!token || !tokenStore[token]) {
    return res.status(401).json({ error: '未登录' });
  }
  req.username = tokenStore[token];
  next();
}

// ======== 历史记录存储（按用户分文件） ========
// 数据结构：{ examHistory: [], aiChatHistory: {} }
function getHistoryFile(username) {
  return path.join(HISTORY_DIR, `${username}.json`);
}
function readHistory(username) {
  const file = getHistoryFile(username);
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    }
  } catch {}
  return { examHistory: [], aiChatHistory: {} };
}
function writeHistory(username, data) {
  const file = getHistoryFile(username);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ======== 用户注册 ========
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (username.length < 2 || username.length > 20) return res.status(400).json({ error: '用户名需 2-20 个字符' });
  if (password.length < 4) return res.status(400).json({ error: '密码至少 4 个字符' });

  const users = readUsers();
  if (users[username]) return res.status(409).json({ error: '用户名已存在' });

  const hash = await bcrypt.hash(password, 10);
  users[username] = { passwordHash: hash, createdAt: Date.now() };
  writeUsers(users);

  // 注册成功后自动登录
  const token = crypto.randomUUID();
  tokenStore[token] = username;
  res.cookie('auth_token', token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.json({ ok: true, username });
});

// ======== 用户登录 ========
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });

  const users = readUsers();
  const user = users[username];
  if (!user) return res.status(401).json({ error: '用户名或密码错误' });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ error: '用户名或密码错误' });

  const token = crypto.randomUUID();
  tokenStore[token] = username;
  res.cookie('auth_token', token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.json({ ok: true, username });
});

// ======== 检查登录状态 ========
app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.auth_token;
  if (!token || !tokenStore[token]) {
    return res.status(401).json({ error: '未登录' });
  }
  res.json({ ok: true, username: tokenStore[token] });
});

// ======== 退出登录 ========
app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.auth_token;
  if (token) delete tokenStore[token];
  res.clearCookie('auth_token');
  res.json({ ok: true });
});

// ======== AI Chat 代理（保持原有功能） ========
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Valid messages array is required' });
  }

  const payload = {
    model: process.env.DOUBAO_MODEL,
    stream: true,
    messages: messages
  };

  try {
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DOUBAO_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Model API Error:', errText);
      return res.status(response.status).json({ error: `Volcengine Error: ${response.status}`, details: errText });
    }

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Establish SSE connection immediately

    // Forward the stream
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        break;
      }
      res.write(Buffer.from(value));
    }
  } catch (error) {
    console.error('Backend Server Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error while calling Volcengine API.' });
    } else {
      res.write(`data: {"error": "Connection interrupted"}\n\n`);
      res.end();
    }
  }
});

// ======== 历史记录 API ========

// 获取全部历史记录（考试 + AI对话）
app.get('/api/history', authMiddleware, (req, res) => {
  const data = readHistory(req.username);
  res.json({ ok: true, data });
});

// 保存考试记录（追加）
app.post('/api/history/exam', authMiddleware, (req, res) => {
  const { record } = req.body;
  if (!record || typeof record.id === 'undefined') {
    return res.status(400).json({ error: '无效的考试记录' });
  }
  const history = readHistory(req.username);
  // 避免重复追加（幂等：相同 id 只保留一个）
  const existIdx = history.examHistory.findIndex(r => r.id === record.id);
  if (existIdx >= 0) {
    history.examHistory[existIdx] = record;
  } else {
    history.examHistory.unshift(record);
    // 最多保留 50 条
    if (history.examHistory.length > 50) {
      history.examHistory = history.examHistory.slice(0, 50);
    }
  }
  writeHistory(req.username, history);
  res.json({ ok: true });
});

// 删除单条考试记录
app.delete('/api/history/exam/:recordId', authMiddleware, (req, res) => {
  const { recordId } = req.params;
  const history = readHistory(req.username);
  history.examHistory = history.examHistory.filter(r => r.id !== recordId);
  writeHistory(req.username, history);
  res.json({ ok: true });
});

// 清空考试记录
app.delete('/api/history/exam', authMiddleware, (req, res) => {
  const history = readHistory(req.username);
  history.examHistory = [];
  writeHistory(req.username, history);
  res.json({ ok: true });
});

// 保存单条 AI 对话（按 questionKey 覆盖）
app.post('/api/history/ai-chat', authMiddleware, (req, res) => {
  const { questionKey, messages } = req.body;
  if (!questionKey || !Array.isArray(messages)) {
    return res.status(400).json({ error: '参数不完整' });
  }
  const history = readHistory(req.username);
  history.aiChatHistory[questionKey] = {
    questionKey,
    messages,
    updatedAt: Date.now(),
  };
  writeHistory(req.username, history);
  res.json({ ok: true });
});

// 删除单条 AI 对话
app.delete('/api/history/ai-chat/:questionKey', authMiddleware, (req, res) => {
  const { questionKey } = req.params;
  const history = readHistory(req.username);
  if (history.aiChatHistory[questionKey]) {
    delete history.aiChatHistory[questionKey];
    writeHistory(req.username, history);
  }
  res.json({ ok: true });
});

// 清空 AI 对话历史
app.delete('/api/history/ai-chat', authMiddleware, (req, res) => {
  const history = readHistory(req.username);
  history.aiChatHistory = {};
  writeHistory(req.username, history);
  res.json({ ok: true });
});

// ======== 全部学习数据同步 API ========

// 获取全部学习数据
app.get('/api/sync', authMiddleware, (req, res) => {
  const history = readHistory(req.username);
  // 其他学习数据仍由前端 localStorage 管理，这里只同步历史记录
  res.json({ ok: true, data: history });
});

// 批量保存学习数据（completed / wrong / stats / practiceProgress / bookmarks）
app.post('/api/sync/study', authMiddleware, (req, res) => {
  const { completed, wrong, stats, practiceProgress, bookmarks } = req.body;
  const history = readHistory(req.username);
  if (completed !== undefined) history.completed = completed;
  if (wrong !== undefined) history.wrong = wrong;
  if (stats !== undefined) history.stats = stats;
  if (practiceProgress !== undefined) history.practiceProgress = practiceProgress;
  if (bookmarks !== undefined) history.bookmarks = bookmarks;
  writeHistory(req.username, history);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
