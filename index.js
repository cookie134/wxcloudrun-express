const express = require('express');
const app = express(); // <--- 之前缺失的 app 定义

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: '10.12.110.107',
    port: 3306,
    user: 'root',
    password: 'hN8fmMCR',
    database: 'nodejs_demo',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// body 解析中间件
app.use(express.urlencoded({ extended: false }));
app.use(express.json());


// === 2. 使用手动事务确保数据写入的 /api/archive 接口 ===
app.post('/api/archive', async (req, res) => {
    console.log('收到归档请求:', req.body);
    const { vehicleInfo, reportInfo, locationInfo } = req.body;

    if (!vehicleInfo || !reportInfo || !locationInfo) {
        return res.status(400).json({ code: -1, message: '请求数据不完整' });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query(
            `INSERT INTO archives 
             (id, vehicle_info, report_info, create_time, status, location_latitude, location_longitude, location_address) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                vehicleInfo.id,
                JSON.stringify(vehicleInfo),
                JSON.stringify(reportInfo),
                vehicleInfo.submitTime,
                '已归档',
                locationInfo.latitude,
                locationInfo.longitude,
                locationInfo.address
            ]
        );
        
        await connection.commit();
        console.log('事务已提交，数据插入成功:', result);
        res.json({ code: 0, message: '归档成功', insertedId: vehicleInfo.id });

    } catch (error) {
        console.error('数据插入失败:', error);
        if (connection) await connection.rollback();
        res.status(500).json({ code: -1, message: '服务器错误', error: error.message });
    } finally {
        if (connection) connection.release();
    }
});


// === 3. 获取归档列表的 /api/archives 接口 ===
app.get('/api/archives', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM archives ORDER BY created_at DESC');
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


// === 4. 启动服务 ===
const port = process.env.PORT || 80;
app.listen(port, () => {
    console.log('服务已在端口', port, '启动');
});
