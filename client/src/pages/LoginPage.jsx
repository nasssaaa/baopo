// src/pages/LoginPage.jsx
// 用户登录/注册页面 - 工业科技风格

import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import './LearnPage.css';

export default function LoginPage() {
  const { login, register, error, setError } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    if (isRegister) {
      await register(username, password);
    } else {
      await login(username, password);
    }
    setLoading(false);
  };

  return (
    <div className="learn-page" style={{ justifyContent: 'center', alignItems: 'center', display: 'flex' }}>
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">🔐</div>
          <h2 className="login-title">爆破作业员考试学习系统</h2>
          <p className="login-subtitle">{isRegister ? '创建新账户' : '登录以继续学习'}</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label>用户名</label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              placeholder="输入用户名"
              autoFocus
              className="login-input"
              minLength={2}
              maxLength={20}
              required
            />
          </div>
          <div className="login-field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="输入密码"
              className="login-input"
              minLength={4}
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? '处理中...' : (isRegister ? '注册' : '登录')}
          </button>
        </form>

        <div className="login-switch">
          <span>{isRegister ? '已有账户？' : '没有账户？'}</span>
          <button className="switch-btn" onClick={() => { setIsRegister(!isRegister); setError(''); }}>
            {isRegister ? '去登录' : '去注册'}
          </button>
        </div>
      </div>
    </div>
  );
}
