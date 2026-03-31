const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`Backend AI proxy server streaming on port ${PORT}`);
});
