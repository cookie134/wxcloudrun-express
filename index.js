// =================================================================
//          index.js - 后端服务最终版
// =================================================================

const express = require('express');
const app = express(); // 创建 Express 应用实例

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const excel = require('exceljs');
const axios = require('axios');

const mysql = require('mysql2/promise');

// --- 1. 数据库连接池配置（已优化，无需修改） ---
// 使用硬编码的内网地址和凭证，确保连接稳定
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

        // 执行 INSERT 语句，字段名与你的数据库表结构完全对应
        const [result] = await connection.query(
            `INSERT INTO archives 
             (id, vehicle_info, report_info, create_time, status, location_latitude, location_longitude, location_address) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                vehicleInfo.id,
                JSON.stringify(vehicleInfo), // 无论 vehicleInfo 内部结构如何，都转为字符串存储
                JSON.stringify(reportInfo),  // 无论 reportInfo 内部是否有图片 File ID，都转为字符串存储
                vehicleInfo.submitTime,
                '已归档',
                locationInfo.latitude,
                locationInfo.longitude,
                locationInfo.address
            ]
        );
        
        // 提交事务，将更改永久写入数据库
        await connection.commit();
        console.log('事务已提交，数据插入成功:', result);
        
        // 返回成功响应
        res.json({ code: 0, message: '归档成功', insertedId: vehicleInfo.id });

    } catch (error) {
        console.error('数据插入失败:', error);
        // 如果发生任何错误，回滚事务，撤销本次操作
        if (connection) await connection.rollback();
        res.status(500).json({ code: -1, message: '服务器错误', error: error.message });
    } finally {
        // 无论成功与否，最后都必须释放连接，将其还回连接池
        if (connection) connection.release();
    }
});


// === 3. 获取归档列表的接口 (GET /api/archives) ===
app.get('/api/archives', async (req, res) => {
  try {
    // 从 `archives` 表查询所有数据，按创建时间倒序排列
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
    res.send('<h1>归档服务后端已就绪！</h1>');
});


// === 在这里添加全新的、强大的图文导出接口 ===
app.post('/api/export', async (req, res) => {
    const { archiveList } = req.body; // 从小程序接收要导出的数据
    if (!archiveList || archiveList.length === 0) {
        return res.status(400).json({ code: -1, message: '没有数据可导出' });
    }

    try {
        // 1. 创建 Excel 工作簿和工作表
        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('归档记录');

        // 2. 设置列头和列宽
        worksheet.columns = [
            { header: '归档编号', key: 'id', width: 30 },
            { header: '状态', key: 'status', width: 10 },
            { header: '归档时间', key: 'createTime', width: 25 },
            { header: '所属公司', key: 'company', width: 20 },
            { header: '车牌号', key: 'plateNumber', width: 15 },
            { header: '上报种类', key: 'reportType', width: 15 },
            { header: '上报人', key: 'reporter', width: 15 },
            { header: '上报内容', key: 'content', width: 40 },
            { header: '照片', key: 'images', width: 30 } // 用于放图片
        ];
        
        // 3. 获取所有图片文件的临时下载链接
        const fileIDs = archiveList.flatMap(item => item.reportInfo?.media?.map(m => m.fileID) || []);
        const fileResult = await cloud.getTempFileURL({ fileList: fileIDs });
        const fileMap = new Map(fileResult.fileList.map(f => [f.fileID, f.tempFileURL]));

        // 4. 遍历数据，填充行和图片
        for (const [index, item] of archiveList.entries()) {
            const rowNumber = index + 2; // Excel 行号从 1 开始，第 1 行是表头
            
            // 添加文本数据
            worksheet.addRow({
                id: item.id,
                status: item.status,
                createTime: new Date(item.createTime).toLocaleString(),
                company: item.vehicleInfo?.company,
                plateNumber: item.vehicleInfo?.plateNumber,
                reportType: item.reportInfo?.reportType,
                reporter: item.reportInfo?.reporter,
                content: item.reportInfo?.content,
            });
            
            // 设置行高以容纳图片
            worksheet.getRow(rowNumber).height = 80;

            // 下载并嵌入图片
            if (item.reportInfo?.media) {
                const imageUrl = fileMap.get(item.reportInfo.media[0]?.fileID);
                if (imageUrl) {
                    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                    const imageId = workbook.addImage({
                        buffer: response.data,
                        extension: 'jpeg',
                    });
                    // 将图片放入 'I' 列 (第九列) 的对应单元格
                    worksheet.addImage(imageId, {
                        tl: { col: 8.05, row: rowNumber - 0.95 }, // 左上角坐标
                        ext: { width: 100, height: 100 }          // 图片尺寸
                    });
                }
            }
        }
        
        // 5. 将生成的 Excel 文件上传到云存储
        const buffer = await workbook.xlsx.writeBuffer();
        const cloudPath = `archives_export/export_${Date.now()}.xlsx`;
        const uploadResult = await cloud.uploadFile({ cloudPath, fileContent: buffer });

        // 6. 获取上传后的文件临时链接并返回给前端
        const linkResult = await cloud.getTempFileURL({ fileList: [uploadResult.fileID] });
        
        res.json({ code: 0, downloadUrl: linkResult.fileList[0].tempFileURL });

    } catch (error) {
        console.error('导出 Excel 失败:', error);
        res.status(500).json({ code: -1, message: '服务器导出失败' });
    }
});



// === 4. 启动服务 ===
// 监听云托管环境指定的端口，如果没有则默认为 80
const port = process.env.PORT || 80;
app.listen(port, () => {
    console.log('服务已在端口', port, '启动');
});
