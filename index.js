// =================================================================
//          index.js - 最终稳定版 (不含 Excel 导出)
// =================================================================

const express = require('express');
const app = express(); // 创建 Express 应用实例

const mysql = require('mysql2/promise');

// --- 1. 数据库连接池配置（已验证为正确的版本） ---
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

// body 解析中间件，用于解析小程序发来的 JSON 数据
app.use(express.urlencoded({ extended: false }));
app.use(express.json());


// === 2. 创建归档记录的接口 (POST /api/archive) ===
// 使用手动事务，确保数据写入的原子性和可靠性
app.post('/api/archive', async (req, res) => {
    console.log('收到归档请求:', req.body);
    const { vehicleInfo, reportInfo, locationInfo } = req.body;

    // 基本的数据校验
    if (!vehicleInfo || !reportInfo || !locationInfo) {
        return res.status(400).json({ code: -1, message: '请求数据不完整' });
    }

    let connection;
    try {
        // 从连接池获取一个专用连接
        connection = await pool.getConnection();
        // 开始事务
        await connection.beginTransaction();

        // 执行 INSERT 语句
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
        
        // 提交事务
        await connection.commit();
        console.log('事务已提交，数据插入成功:', result);
        
        // 返回成功响应
        res.json({ code: 0, message: '归档成功', insertedId: vehicleInfo.id });

    } catch (error) {
        console.error('数据插入失败:', error);
        // 如果出错，回滚事务
        if (connection) await connection.rollback();
        res.status(500).json({ code: -1, message: '服务器错误', error: error.message });
    } finally {
        // 无论成功与否，释放连接
        if (connection) connection.release();
    }
});


// === 3. 获取归档列表的接口 (GET /api/archives) ===
app.get('/api/archives', async (req, res) => {
  try {
    // 从 `archives` 表查询所有数据
    const [rows] = await pool.query('SELECT * FROM archives ORDER BY created_at DESC');
    // 返回成功响应和查询到的数据
    res.json({ code: 0, data: rows });
  } catch (error) {
    console.error('查询归档列表失败:', error);
    res.status(500).json({ code: -1, message: '服务器错误', error: error.message });
  }
});

// 健康检查/欢迎页接口 (GET /)
app.get('/', (req, res) => {
    res.send('<h1>归档服务后端已就绪！(基础版)</h1>');
});


// === 4. 启动服务 ===
const port = process.env.PORT || 80;
app.listen(port, () => {
    console.log('服务已在端口', port, '启动');
});
