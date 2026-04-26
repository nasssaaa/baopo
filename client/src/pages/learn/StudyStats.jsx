// src/pages/learn/StudyStats.jsx
// 学习统计模块
// 显示总览数据、章节掌握度、最近 7 天学习曲线

import { useMemo } from 'react';

/**
 * 简易 SVG 折线图组件
 */
function LineChart({ data, width = 500, height = 200 }) {
  const padding = { top: 20, right: 20, bottom: 40, left: 45 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map(d => Math.max(d.answered, d.correct)), 1);

  const getX = (i) => padding.left + (i / (data.length - 1 || 1)) * chartW;
  const getY = (val) => padding.top + chartH - (val / maxVal) * chartH;

  // 生成路径
  const answeredPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${getX(i)},${getY(d.answered)}`).join(' ');
  const correctPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${getX(i)},${getY(d.correct)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="line-chart">
      {/* 网格线 */}
      {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
        <g key={i}>
          <line
            x1={padding.left}
            y1={padding.top + chartH * (1 - ratio)}
            x2={width - padding.right}
            y2={padding.top + chartH * (1 - ratio)}
            stroke="rgba(0,255,204,0.1)"
            strokeDasharray="3,3"
          />
          <text
            x={padding.left - 5}
            y={padding.top + chartH * (1 - ratio) + 4}
            textAnchor="end"
            fill="#666"
            fontSize="11"
          >
            {Math.round(maxVal * ratio)}
          </text>
        </g>
      ))}

      {/* 总答题线 */}
      <path d={answeredPath} fill="none" stroke="#00ffcc" strokeWidth="2" />
      {data.map((d, i) => (
        <circle key={`a-${i}`} cx={getX(i)} cy={getY(d.answered)} r="3" fill="#00ffcc" />
      ))}

      {/* 正确数线 */}
      <path d={correctPath} fill="none" stroke="#4ade80" strokeWidth="2" strokeDasharray="5,3" />
      {data.map((d, i) => (
        <circle key={`c-${i}`} cx={getX(i)} cy={getY(d.correct)} r="3" fill="#4ade80" />
      ))}

      {/* X 轴标签 */}
      {data.map((d, i) => (
        <text
          key={`x-${i}`}
          x={getX(i)}
          y={height - 10}
          textAnchor="middle"
          fill="#888"
          fontSize="11"
        >
          {d.date}
        </text>
      ))}

      {/* 图例 */}
      <g transform={`translate(${padding.left}, ${height - 5})`}>
        <rect x="0" y="-8" width="12" height="3" fill="#00ffcc" />
        <text x="16" y="-3" fill="#888" fontSize="10">答题数</text>
        <rect x="70" y="-8" width="12" height="3" fill="#4ade80" />
        <text x="86" y="-3" fill="#888" fontSize="10">正确数</text>
      </g>
    </svg>
  );
}

export default function StudyStats({ store, chapters, totalQuestions }) {
  const { stats } = store;
  const last7Days = store.getLast7DaysStats();
  const chapterMastery = useMemo(() => store.getChapterMastery(chapters), [store, chapters]);

  // 格式化学习时长
  const formatStudyTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}小时${minutes}分钟`;
    return `${minutes}分钟`;
  };

  const correctRate = stats.totalAnswered > 0
    ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100)
    : 0;

  return (
    <div className="study-stats">
      <h3 className="module-title">
        <span className="title-icon">📊</span>
        学习统计
      </h3>

      {/* 总览数据卡片 */}
      <div className="stats-overview">
        <div className="stat-card">
          <div className="stat-card-value">{stats.totalAnswered}</div>
          <div className="stat-card-label">总做题数</div>
          <div className="stat-card-sub">/ {totalQuestions} 题</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value accent">{correctRate}%</div>
          <div className="stat-card-label">正确率</div>
          <div className="stat-card-sub">{stats.totalCorrect} 正确</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{formatStudyTime(stats.studyTime)}</div>
          <div className="stat-card-label">累计学习</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value warn">{store.wrongCount}</div>
          <div className="stat-card-label">错题数</div>
        </div>
      </div>

      {/* 最近 7 天学习曲线 */}
      <div className="stats-section">
        <h4 className="stats-section-title">最近 7 天学习曲线</h4>
        <div className="chart-container">
          <LineChart data={last7Days} />
        </div>
      </div>

      {/* 各章节掌握度 */}
      <div className="stats-section">
        <h4 className="stats-section-title">各章节掌握度</h4>
        <div className="mastery-list">
          {chapterMastery.map(ch => (
            <div key={ch.name} className="mastery-item">
              <div className="mastery-header">
                <span className="mastery-name">{ch.name}</span>
                <span className="mastery-detail">
                  {ch.completed}/{ch.total} 题 · {ch.wrong} 错
                </span>
              </div>
              <div className="mastery-bar">
                <div
                  className="mastery-fill"
                  style={{ width: `${Math.max(0, ch.mastery)}%` }}
                ></div>
              </div>
              <div className="mastery-percent">{Math.max(0, ch.mastery)}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
