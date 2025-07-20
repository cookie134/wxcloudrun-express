const express = require('express');
const app = express();
const mysql = require('mysql2/promise'); // 使用 promise 版本的 mysql2

// --- 1. 添加数据库连接池 ---
const pool = mysql.createPool({
    host: process.env.MYSQL_ADDRESS, // 云托管会自动注入数据库地址
    user: process.env.MYSQL_USERNAME, // 云托管会自动注入用户名 (root)
    password: process.env.MYSQL_PASSWORD, // ！！！云托管会自动注入密码 (hN8fmMCR)
    database: 'mysql' // 默认数据库
});

// 检查数据库中是否存在 'archives' 表，如果不存在则创建
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS archives (
                id INT AUTO_INCREMENT PRIMARY KEY,
                company VARCHAR(255),
                reporter VARCHAR(255),
                vehicleType VARCHAR(255),
                plateNumber VARCHAR(255),
                submitTime VARCHAR(255),
                projectInfo TEXT,
                locationInfo TEXT,
                createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('数据库表检查/创建成功');
    } catch (error) {
        console.error('初始化数据库失败:', error);
    }
}
initDatabase();


// 跨域设置
app.use(async (req, res, next) => {
    // ... (模板原有的跨域代码保持不变)
    next();
});

// body 解析
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// --- 2. 添加你的 /api/archive 接口 ---
app.post('/api/archive', async (req, res) => {
    console.log('收到归档请求:', req.body);
    const { vehicleInfo, reportInfo, locationInfo } = req.body;

    try {
        const [result] = await pool.query(
            'INSERT INTO archives (company, reporter, vehicleType, plateNumber, submitTime, projectInfo, locationInfo) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                vehicleInfo.company,
                vehicleInfo.reporter,
                vehicleInfo.vehicleType,
                vehicleInfo.plateNumber,
                vehicleInfo.submitTime,
                JSON.stringify(reportInfo), // 将对象转为字符串存储
                JSON.stringify(locationInfo)
            ]
        );
        console.log('数据插入成功:', result);
        res.json({ code: 0, message: '归档成功', insertId: result.insertId });
    } catch (error) {
        console.error('数据插入失败:', error);
        res.status(500).json({ code: -1, message: '服务器错误' });
    }
});
// 在后端的 index.js 中，app.post('/api/archive', ...) 的下面添加：

app.get('/api/archives', async (req, res) => {
  try {
    // 从数据库的 'archives' 表中查询所有记录，按创建时间降序排列
    const [rows] = await pool.query('SELECT * FROM archives ORDER BY createdAt DESC');
    res.json({ code: 0, data: rows });
  } catch (error) {
    console.error('查询归档列表失败:', error);
    res.status(500).json({ code: -1, message: '服务器错误' });
  }
});


const port = process.env.PORT || 80;
async function bootstrap() {
  app.listen(port, () => {
    console.log('启动成功', port);
  });
}
bootstrap();
