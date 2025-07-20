const express = require('express');
const app = express();
const mysql = require('mysql2/promise');

// // --- 1. 数据库连接池配置（关键修改！） ---
// const pool = mysql.createPool({
//     host: process.env.MYSQL_ADDRESS,
//     user: process.env.MYSQL_USERNAME,
//     password: process.env.MYSQL_PASSWORD,
//     // ！！！使用你截图中看到的正确数据库名！！！
//     database: 'nodejs_demo' 
// });

// index.js

// --- 数据库连接池（终极诊断版，全部硬编码）---
const pool = mysql.createPool({
    // ！！！使用你截图中明确提供的内网 IP 地址
    host: '10.12.110.107', 

    // ！！！明确指定端口
    port: 3306,

    // ！！！使用 root 用户
    user: 'root', 

    // ！！！使用你之前部署成功页面上看到的密码
    password: 'hN8fmMCR', 

    // ！！！使用我们确认的正确数据库名
    database: 'nodejs_demo'
});

// ... 后续所有路由和 app.listen 的代码保持不变 ...

// body 解析中间件
app.use(express.urlencoded({ extended: false }));
app.use(express.json());


// === 2. 修改 /api/archive 接口以匹配你的新表 ===
app.post('/api/archive', async (req, res) => {
    console.log('收到归档请求:', req.body);
    // 从请求体中获取小程序发送的三个主要对象
    const { vehicleInfo, reportInfo, locationInfo } = req.body;

    // 检查基本数据是否存在
    if (!vehicleInfo || !reportInfo || !locationInfo) {
        return res.status(400).json({ code: -1, message: '请求数据不完整' });
    }

    try {
        // 准备插入数据库的数据，字段名要和你的新表完全对应
        const [result] = await pool.query(
            `INSERT INTO archives 
             (id, vehicle_info, report_info, create_time, status, location_latitude, location_longitude, location_address) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                vehicleInfo.id, // 你的表主键 id, 从 vehicleInfo 中获取
                JSON.stringify(vehicleInfo), // 存入 vehicle_info (JSON) 列
                JSON.stringify(reportInfo),  // 存入 report_info (JSON) 列
                vehicleInfo.submitTime,      // 你的 create_time 列
                '已归档',                    // 你的 status 列
                locationInfo.latitude,       // 你的 location_latitude 列
                locationInfo.longitude,      // 你的 location_longitude 列
                locationInfo.address         // 你的 location_address 列
            ]
        );
        
        console.log('数据插入成功:', result);
        res.json({ code: 0, message: '归档成功', insertedId: vehicleInfo.id });

    } catch (error) {
        console.error('数据插入失败:', error);
        // 将详细的数据库错误返回给前端，方便调试
        res.status(500).json({ code: -1, message: '服务器错误', error: error.message });
    }
});


// === 3. /api/archives 接口保持不变，它能正常工作 ===
app.get('/api/archives', async (req, res) => {
  try {
    // 从你的 'archives' 表中查询所有记录
    const [rows] = await pool.query('SELECT * FROM archives ORDER BY created_at DESC');
    
    // 注意：现在返回的 rows 中，vehicle_info 和 report_info 是 JSON 字符串
    // 你可能需要在小程序端进行 JSON.parse()
    res.json({ code: 0, data: rows });

  } catch (error) {
    console.error('查询归档列表失败:', error);
    res.status(500).json({ code: -1, message: '服务器错误', error: error.message });
  }
});

// 健康检查/欢迎页
app.get('/', (req, res) => {
    res.send('<h1>归档服务后端已就绪！</h1>');
});


const port = process.env.PORT || 80;
app.listen(port, () => {
    console.log('服务已在端口', port, '启动');
});
