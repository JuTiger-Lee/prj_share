// 정적 파일만 제공한다. 데이터와 파일 저장은 브라우저에서 Supabase로 직접 처리한다.
const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`프로젝트 공유 사이트: http://localhost:${PORT}`);
});
