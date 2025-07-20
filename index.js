// index.js

// ... (数据库连接池 pool 的定义保持不变) ...

// === 2. 修改 /api/archive 接口，使用手动事务确保数据写入 ===
app.post('/api/archive', async (req, res) => {
    console.log('收到归档请求:', req.body);
    const { vehicleInfo, reportInfo, locationInfo } = req.body;

    if (!vehicleInfo || !reportInfo || !locationInfo) {
        return res.status(400).json({ code: -1, message: '请求数据不完整' });
    }

    // 从连接池获取一个连接
    let connection;
    try {
        connection = await pool.getConnection();
        console.log("成功从连接池获取连接");

        // 开始事务
        await connection.beginTransaction();
        console.log("事务已开始");

        // 执行 INSERT 查询
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
        
        // 提交事务，这是将数据永久保存到数据库的关键一步！
        await connection.commit();
        console.log('事务已提交，数据插入成功:', result);
        
        res.json({ code: 0, message: '归档成功', insertedId: vehicleInfo.id });

    } catch (error) {
        console.error('数据插入失败:', error);
        
        // 如果发生错误，回滚事务，撤销所有更改
        if (connection) {
            await connection.rollback();
            console.log("事务已回滚");
        }
        
        res.status(500).json({ code: -1, message: '服务器错误', error: error.message });
    } finally {
        // 无论成功还是失败，最后都必须释放连接，还给连接池
        if (connection) {
            connection.release();
            console.log("连接已释放");
        }
    }
});

// ... (GET /api/archives 和其他代码保持不变) ...
