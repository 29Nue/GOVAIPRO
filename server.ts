import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mammoth from 'mammoth';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import * as XLSX from 'xlsx';

dotenv.config();

const app = express();
const port = 2310;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ==================== CẤU HÌNH THƯ MỤC ====================
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log(`✅ Created uploads directory: ${UPLOADS_DIR}`);
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`✅ Created data directory: ${DATA_DIR}`);
}

// ==================== CẤU HÌNH MULTER ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const safeName = baseName.replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, safeName + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024 // 15MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'audio/mpeg',
      'audio/wav',
      'audio/mp3',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'text/plain'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Định dạng file không được hỗ trợ.'));
    }
  }
});

// ==================== TYPE DEFINITIONS ====================
interface DocumentRecord {
  id: string;
  originalName: string;
  filename: string;
  mimeType: string;
  filePath: string;
  digitizedAt: string;
  fileSize: number;
  extractedText: string;
  metadata: {
    docType: string;
    docNumber: string;
    signer: string;
    issueDate: string;
    summary: string;
    issuer: string;
  };
}

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

interface ChatSession {
  id: string;
  title: string;
  documentId?: string;
  messages: ChatMessage[];
  updatedAt: string;
}

interface ReportRecord {
  id: string;
  originalName: string;
  filename: string;
  fileSize?: number;
  uploadedAt: string;
  sheetNames: string[];
  firstSheetName?: string;
  columns?: string[];
  rowCount?: number;
  dataSummary: string;
  analysis: string;
  metrics: Array<{
    title: string;
    value: string;
    change?: string;
  }>;
  charts: Array<{
    name: string;
    value: number;
  }>;
  rawData?: any[];
}

interface MeetingRecord {
  id: string;
  originalName: string;
  filename: string;
  audioFileName?: string;
  uploadedAt: string;
  duration?: string;
  transcript: string;
  summary: string;
  actionItems: Array<{
    task: string;
    assignee: string;
    deadline: string;
  }>;
  speakers: string[];
  minutes: string;
}

interface DatabaseSchema {
  documents: DocumentRecord[];
  chats: ChatSession[];
  reports: ReportRecord[];
  meetings: MeetingRecord[];
}

const defaultDb: DatabaseSchema = {
  documents: [],
  chats: [],
  reports: [],
  meetings: []
};

// ==================== DATABASE FUNCTIONS ====================
function loadDb(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error reading DB file, returning default', error);
  }
  return defaultDb;
}

function saveDb(db: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving DB file', error);
  }
}

// ==================== GEMINI CLIENT ====================
function getGeminiClient(reqHeaders: any) {
  const customKey = reqHeaders['x-gemini-key'];
  const apiKey = (typeof customKey === 'string' && customKey.trim()) ? customKey : process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('API Key không tồn tại. Vui lòng cấu hình API Key trong phần Cài đặt.');
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// ==================== MODULE 1: SỐ HÓA HỒ SƠ ====================

app.post('/api/digitize/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không tìm thấy tệp tải lên' });
    }

    const { originalname, filename, mimetype, size, path: filePath } = req.file;
    const originalName = Buffer.from(originalname, "latin1").toString("utf8");
    const fileBase64 = fs.readFileSync(filePath).toString('base64');

    const ai = getGeminiClient(req.headers);
    let extractedText = '';

    try {
      if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const result = await mammoth.extractRawText({ path: filePath });
        extractedText = result.value;
      } else if (mimetype === 'application/pdf' || mimetype.startsWith('image/')) {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              inlineData: {
                data: fileBase64,
                mimeType: mimetype
              }
            },
            'Hãy trích xuất toàn bộ nội dung văn bản tiếng Việt có trong tệp này dưới dạng thô đầy đủ, giữ nguyên cấu trúc dòng nếu có.'
          ]
        });
        extractedText = response.text || '';
      } else if (mimetype === 'text/plain') {
        extractedText = fs.readFileSync(filePath, 'utf8');
      } else {
        extractedText = `Không thể trích xuất tự động nội dung văn bản từ tệp ${originalName}.`;
      }
    } catch (extractError) {
      console.error('Text extraction error:', extractError);
      extractedText = `Lỗi khi trích xuất nội dung từ tệp ${originalName}.`;
    }

    if (!extractedText.trim()) {
      extractedText = `Không thể trích xuất nội dung văn bản từ tệp ${originalName}.`;
    }

    let metadata = {
      docType: 'Khác',
      docNumber: 'Không rõ',
      signer: 'Không rõ',
      issueDate: 'Không rõ',
      summary: `Tài liệu số hóa từ tệp ${originalName}.`,
      issuer: 'Không rõ'
    };

    try {
      const metaResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            text: `Dưới đây là nội dung văn bản của tài liệu "${originalName}":\n\n${extractedText.substring(0, 5000)}\n\nHãy phân tích văn bản này và trích xuất các thông tin hành chính cốt lõi sau dưới dạng JSON tiếng Việt:\n` +
                  `1. Loại văn bản (docType: Quyết định, Thông báo, Công văn, Tờ trình, Kế hoạch, Biên bản, hoặc Khác)\n` +
                  `2. Số văn bản (docNumber: ví dụ "102/QĐ-UBND", nếu không có ghi "Không rõ")\n` +
                  `3. Người ký (signer: Tên người ký, chức vụ, nếu không có ghi "Không rõ")\n` +
                  `4. Ngày ban hành (issueDate: Ngày ban hành định dạng DD/MM/YYYY, nếu không có ghi "Không rõ")\n` +
                  `5. Trích yếu nội dung (summary: Tóm tắt ngắn gọn mục đích và nội dung văn bản, khoảng 2-3 câu)\n` +
                  `6. Đơn vị ban hành (issuer: Cơ quan, đơn vị ban hành văn bản, nếu không có ghi "Không rõ")`
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              docType: { type: Type.STRING },
              docNumber: { type: Type.STRING },
              signer: { type: Type.STRING },
              issueDate: { type: Type.STRING },
              summary: { type: Type.STRING },
              issuer: { type: Type.STRING }
            },
            required: ['docType', 'docNumber', 'signer', 'issueDate', 'summary', 'issuer']
          }
        }
      });

      if (metaResponse.text) {
        try {
          const parsed = JSON.parse(metaResponse.text.trim());
          metadata = { ...metadata, ...parsed };
        } catch (parseErr) {
          console.error('Error parsing Gemini metadata response:', parseErr);
        }
      }
    } catch (metaError) {
      console.error('Metadata extraction error:', metaError);
    }

    const docId = 'doc-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const newDoc: DocumentRecord = {
      id: docId,
      originalName: originalName,
      filename: filename,
      mimeType: mimetype,
      filePath: filePath,
      digitizedAt: new Date().toISOString(),
      fileSize: size,
      extractedText: extractedText,
      metadata: metadata
    };

    const db = loadDb();
    db.documents.push(newDoc);
    saveDb(db);

    res.status(201).json({
      ...newDoc,
      message: 'Số hóa tài liệu thành công'
    });

  } catch (error: any) {
    console.error('Digitization error:', error);
    res.status(500).json({
      error: error.message || 'Lỗi xử lý số hóa tài liệu.'
    });
  }
});

app.get('/api/digitize/list', (req, res) => {
  try {
    const db = loadDb();
    const documents = db.documents.sort((a, b) => 
      new Date(b.digitizedAt).getTime() - new Date(a.digitizedAt).getTime()
    );
    res.json(documents);
  } catch (error: any) {
    res.status(500).json({ error: 'Không thể lấy danh sách tài liệu' });
  }
});

app.get('/api/digitize/detail/:id', (req, res) => {
  try {
    const db = loadDb();
    const doc = db.documents.find(d => d.id === req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    }
    res.json(doc);
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi khi lấy chi tiết tài liệu' });
  }
});

app.get('/api/digitize/download/:id', async (req, res) => {
  try {
    const db = loadDb();
    const doc = db.documents.find(d => d.id === req.params.id);
    
    if (!doc) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    }

    const filePath = path.join(UPLOADS_DIR, doc.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File không còn tồn tại trên server.' });
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
    res.setHeader('Content-Length', stat.size);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error: any) {
    console.error('Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Lỗi khi tải file' });
    }
  }
});

app.delete('/api/digitize/:id', (req, res) => {
  try {
    const db = loadDb();
    const index = db.documents.findIndex(d => d.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    }
    const doc = db.documents[index];
    const filePath = path.join(UPLOADS_DIR, doc.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Failed to delete physical file', e);
      }
    }
    db.documents.splice(index, 1);
    saveDb(db);
    res.json({ success: true, message: 'Đã xóa tài liệu thành công' });
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi khi xóa tài liệu' });
  }
});

// ==================== MODULE 2: TRỢ LÝ CÔNG VỤ AI ====================

app.post('/api/assistant/chat', async (req, res) => {
  try {
    const { message, documentId, chatSessionId, history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Câu hỏi không được để trống' });
    }

    const ai = getGeminiClient(req.headers);
    const db = loadDb();

    let contextText = '';
    if (documentId) {
      const selectedDoc = db.documents.find(d => d.id === documentId);
      if (selectedDoc) {
        contextText = `THÔNG TIN TÀI LIỆU HỖ TRỢ:\n` +
                      `- Tên tệp: ${selectedDoc.originalName}\n` +
                      `- Loại văn bản: ${selectedDoc.metadata.docType}\n` +
                      `- Số văn bản: ${selectedDoc.metadata.docNumber}\n` +
                      `- Nội dung: ${selectedDoc.extractedText.substring(0, 3000)}\n\n`;
      }
    }

    const systemInstruction = 
      "Bạn là GOVAI - Trợ lý công vụ số thông minh, chuyên nghiệp dành cho cán bộ, công chức hành chính Việt Nam.\n" +
      "Hãy hỗ trợ trả lời câu hỏi của người dùng một cách chính xác, lịch sự, đúng quy định pháp luật và văn phong hành chính nhà nước.\n" +
      (contextText ? `Người dùng đang hỏi về tài liệu đính kèm. Hãy căn cứ vào nội dung tài liệu để trả lời.\n\n${contextText}` : "");

    const contents: any[] = [];
    for (const msg of history) {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: { systemInstruction }
    });

    const replyText = response.text || 'Tôi không tìm thấy câu trả lời phù hợp.';

    let sessionId = chatSessionId;
    if (!sessionId) {
      sessionId = 'session-' + Date.now();
      const newSession: ChatSession = {
        id: sessionId,
        title: message.substring(0, 30) + (message.length > 30 ? '...' : ''),
        documentId,
        messages: [
          { role: 'user', content: message, timestamp: new Date().toISOString() },
          { role: 'model', content: replyText, timestamp: new Date().toISOString() }
        ],
        updatedAt: new Date().toISOString()
      };
      db.chats.push(newSession);
    } else {
      const session = db.chats.find(s => s.id === sessionId);
      if (session) {
        session.messages.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
        session.messages.push({ role: 'model', content: replyText, timestamp: new Date().toISOString() });
        session.updatedAt = new Date().toISOString();
      }
    }
    saveDb(db);

    res.json({
      reply: replyText,
      chatSessionId: sessionId,
      chats: db.chats
    });
  } catch (error: any) {
    console.error('Assistant chat error:', error);
    res.status(500).json({ error: error.message || 'Lỗi trợ lý AI phản hồi' });
  }
});

app.get('/api/assistant/chats', (req, res) => {
  try {
    const db = loadDb();
    res.json(db.chats);
  } catch (error: any) {
    res.status(500).json({ error: 'Không thể lấy danh sách phiên chat' });
  }
});

app.delete('/api/assistant/chats/:id', (req, res) => {
  try {
    const db = loadDb();
    const { id } = req.params;
    db.chats = db.chats.filter((chat: any) => chat.id !== id);
    saveDb(db);
    res.json({ success: true, chats: db.chats });
  } catch (error: any) {
    res.status(500).json({ error: 'Không thể xóa hội thoại' });
  }
});

app.post('/api/assistant/generate', async (req, res) => {
  try {
    const { prompt, docType, tone = 'Trang trọng, chuẩn công vụ', additionalNotes } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Yêu cầu soạn thảo không được để trống' });
    }

    const ai = getGeminiClient(req.headers);

    const systemInstruction = 
      "Bạn là chuyên gia soạn thảo văn bản hành chính nhà nước Việt Nam.\n" +
      "Nhiệm vụ của bạn là sinh một văn bản hành chính hoàn chỉnh, chuẩn xác theo thể thức văn bản hành chính quy định tại Nghị định 30/2020/NĐ-CP.\n" +
      "Hãy đảm bảo có đầy đủ các thành phần:\n" +
      "- Quốc hiệu, Tiêu ngữ\n" +
      "- Tên cơ quan ban hành\n" +
      "- Số, ký hiệu văn bản\n" +
      "- Địa danh và ngày tháng năm ban hành\n" +
      "- Tên loại văn bản và Trích yếu nội dung\n" +
      "- Căn cứ pháp lý\n" +
      "- Nội dung chính\n" +
      "- Chức vụ, chữ ký của người thẩm quyền\n" +
      "- Nơi nhận\n" +
      "Văn phong: " + tone + ".\n" +
      "Hãy xuất kết quả hoàn toàn bằng Markdown đẹp mắt.";

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Soạn văn bản loại: ${docType || 'Văn bản hành chính chung'}.\nYêu cầu: ${prompt}.\nGhi chú: ${additionalNotes || 'Không có'}.`,
      config: { systemInstruction }
    });

    res.json({ content: response.text });
  } catch (error: any) {
    console.error('Draft generation error:', error);
    res.status(500).json({ error: error.message || 'Lỗi soạn thảo văn bản' });
  }
});

// ==================== MODULE 3: BÁO CÁO THÔNG MINH ====================

app.post('/api/report/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không tìm thấy tệp dữ liệu' });
    }

    const { originalname, filename, size, path: filePath } = req.file;
    const originalName = Buffer.from(originalname, "latin1").toString("utf8");

    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames;
    
    if (sheetNames.length === 0) {
      return res.status(400).json({ error: 'Tệp Excel không chứa trang tính nào.' });
    }

    const firstSheetName = sheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    if (rawData.length === 0) {
      return res.status(400).json({ error: 'Tệp Excel trống hoặc không đúng định dạng.' });
    }

    const columns = Object.keys(rawData[0] || {});
    const sampleData = rawData.slice(0, 50);
    const dataString = JSON.stringify(sampleData, null, 2);

    const ai = getGeminiClient(req.headers);

    let reportResult = {
      metrics: [
        { title: 'Tổng số dòng dữ liệu', value: rawData.length.toString() },
        { title: 'Số lượng cột', value: columns.length.toString() },
        { title: 'Trạng thái', value: 'Đã phân tích' }
      ],
      charts: [],
      analysis: 'Dữ liệu đã được tải lên thành công.'
    };

    try {
      const analysisResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            text: `Dưới đây là một phần dữ liệu hành chính từ tệp Excel "${originalName}" (Tên trang: ${firstSheetName}):\n\n` +
                  `${dataString}\n\n` +
                  `Hãy đóng vai trò chuyên viên Phân tích dữ liệu hành chính công. Thực hiện phân tích dữ liệu trên và tạo một cấu trúc báo cáo thông minh theo định dạng JSON dưới đây:\n` +
                  `{\n` +
                  `  "metrics": [\n` +
                  `    {"title": "Tên chỉ số", "value": "Giá trị", "change": "Mức tăng/giảm"}\n` +
                  `  ],\n` +
                  `  "charts": [\n` +
                  `    {"name": "Nhãn phân loại", "value": 120}\n` +
                  `  ],\n` +
                  `  "analysis": "Đoạn văn phân tích và nhận xét chuyên sâu bằng tiếng Việt."\n` +
                  `}\n`
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              metrics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    value: { type: Type.STRING },
                    change: { type: Type.STRING }
                  },
                  required: ['title', 'value']
                }
              },
              charts: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    value: { type: Type.NUMBER }
                  },
                  required: ['name', 'value']
                }
              },
              analysis: { type: Type.STRING }
            },
            required: ['metrics', 'charts', 'analysis']
          }
        }
      });

      if (analysisResponse.text) {
        try {
          const parsed = JSON.parse(analysisResponse.text.trim());
          if (parsed.metrics && parsed.metrics.length > 0) {
            reportResult.metrics = parsed.metrics;
          }
          if (parsed.charts && parsed.charts.length > 0) {
            reportResult.charts = parsed.charts;
          }
          if (parsed.analysis) {
            reportResult.analysis = parsed.analysis;
          }
        } catch (parseErr) {
          console.error('Error parsing report analysis JSON:', parseErr);
        }
      }
    } catch (analysisError) {
      console.error('Gemini analysis error:', analysisError);
    }

    const reportId = 'rep-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const newReport: ReportRecord = {
      id: reportId,
      originalName: originalName,
      filename: filename,
      fileSize: size,
      uploadedAt: new Date().toISOString(),
      sheetNames: sheetNames,
      firstSheetName: firstSheetName,
      columns: columns,
      rowCount: rawData.length,
      dataSummary: `Chứa ${rawData.length} dòng dữ liệu từ trang ${firstSheetName}. Có ${columns.length} cột.`,
      analysis: reportResult.analysis,
      metrics: reportResult.metrics,
      charts: reportResult.charts,
      rawData: rawData.slice(0, 100)
    };

    const db = loadDb();
    db.reports.push(newReport);
    saveDb(db);

    res.status(201).json({
      ...newReport,
      message: 'Phân tích báo cáo thành công'
    });

  } catch (error: any) {
    console.error('Report processing error:', error);
    res.status(500).json({
      error: error.message || 'Lỗi xử lý tệp báo cáo Excel.'
    });
  }
});

app.get('/api/report/list', (req, res) => {
  try {
    const db = loadDb();
    const reports = db.reports.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    res.json(reports);
  } catch (error: any) {
    res.status(500).json({ error: 'Không thể lấy danh sách báo cáo' });
  }
});

app.get('/api/report/detail/:id', (req, res) => {
  try {
    const db = loadDb();
    const report = db.reports.find(r => r.id === req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
    }
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi khi lấy chi tiết báo cáo' });
  }
});

app.get('/api/report/download/:id', async (req, res) => {
  try {
    const db = loadDb();
    const report = db.reports.find(r => r.id === req.params.id);
    
    if (!report) {
      return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
    }

    const filePath = path.join(UPLOADS_DIR, report.filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File không còn tồn tại.' });
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(report.originalName)}`);
    res.setHeader('Content-Length', stat.size);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error: any) {
    console.error('Download report error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Lỗi khi tải file' });
    }
  }
});

app.delete('/api/report/:id', (req, res) => {
  try {
    const db = loadDb();
    const index = db.reports.findIndex(r => r.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
    }
    const report = db.reports[index];
    const filePath = path.join(UPLOADS_DIR, report.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Failed to delete physical file', e);
      }
    }
    db.reports.splice(index, 1);
    saveDb(db);
    res.json({ success: true, message: 'Đã xóa báo cáo thành công' });
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi khi xóa báo cáo' });
  }
});

// ==================== MODULE 4: CUỘC HỌP SỐ ====================

app.post('/api/meeting/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không tìm thấy tệp ghi âm cuộc họp' });
    }

    const { originalname, filename, mimetype, path: filePath } = req.file;
    const originalName = Buffer.from(originalname, "latin1").toString("utf8");
    const fileBase64 = fs.readFileSync(filePath).toString('base64');

    const ai = getGeminiClient(req.headers);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            data: fileBase64,
            mimeType: mimetype
          }
        },
        `Đây là file âm thanh ghi âm một cuộc họp công sở/hành chính công. Hãy lắng nghe và thực hiện:\n` +
        `1. Chuyển giọng nói thành văn bản tiếng Việt đầy đủ (Transcript).\n` +
        `2. Tóm tắt ngắn gọn các chủ đề chính.\n` +
        `3. Liệt kê danh sách các công việc/nhiệm vụ được giao, người chịu trách nhiệm và thời hạn.\n` +
        `4. Tạo Biên bản cuộc họp chính thức.\n\n` +
        `Trả về JSON:\n` +
        `{\n` +
        `  "transcript": "Nội dung...",\n` +
        `  "summary": "Tóm tắt...",\n` +
        `  "speakers": ["Người 1", "Người 2"],\n` +
        `  "actionItems": [{"task": "", "assignee": "", "deadline": ""}],\n` +
        `  "minutes": "Biên bản..."\n` +
        `}`
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcript: { type: Type.STRING },
            summary: { type: Type.STRING },
            speakers: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            actionItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  task: { type: Type.STRING },
                  assignee: { type: Type.STRING },
                  deadline: { type: Type.STRING }
                },
                required: ['task', 'assignee', 'deadline']
              }
            },
            minutes: { type: Type.STRING }
          },
          required: ['transcript', 'summary', 'speakers', 'actionItems', 'minutes']
        }
      }
    });

    let meetingResult = {
      transcript: 'Không thể giải mã giọng nói.',
      summary: 'Chưa có tóm tắt.',
      speakers: ['Người họp 1', 'Người họp 2'],
      actionItems: [],
      minutes: '# BIÊN BẢN CUỘC HỌP\n\nChưa có biên bản tự động.'
    };

    if (response.text) {
      try {
        meetingResult = JSON.parse(response.text.trim());
      } catch (parseErr) {
        console.error('Error parsing meeting response JSON:', parseErr);
      }
    }

    const meetingId = 'meet-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const newMeeting: MeetingRecord = {
      id: meetingId,
      originalName: originalName,
      filename: filename,
      audioFileName: filename,
      uploadedAt: new Date().toISOString(),
      transcript: meetingResult.transcript,
      summary: meetingResult.summary,
      speakers: meetingResult.speakers,
      actionItems: meetingResult.actionItems,
      minutes: meetingResult.minutes
    };

    const db = loadDb();
    db.meetings.push(newMeeting);
    saveDb(db);

    res.status(201).json({
      ...newMeeting,
      message: 'Phân tích cuộc họp thành công'
    });

  } catch (error: any) {
    console.error('Meeting processing error:', error);
    res.status(500).json({
      error: error.message || 'Lỗi xử lý file âm thanh ghi âm cuộc họp'
    });
  }
});

app.get('/api/meeting/list', (req, res) => {
  try {
    const db = loadDb();
    const meetings = db.meetings.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    res.json(meetings);
  } catch (error: any) {
    res.status(500).json({ error: 'Không thể lấy danh sách cuộc họp số' });
  }
});

app.get('/api/meeting/audio/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(UPLOADS_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Không tìm thấy file âm thanh' });
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', stat.size);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error: any) {
    console.error('Audio streaming error:', error);
    res.status(500).json({ error: 'Lỗi khi phát audio' });
  }
});

app.delete('/api/meeting/:id', (req, res) => {
  try {
    const db = loadDb();
    const index = db.meetings.findIndex(m => m.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Không tìm thấy thông tin cuộc họp' });
    }
    const meet = db.meetings[index];
    const filePath = path.join(UPLOADS_DIR, meet.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Failed to delete physical audio file', e);
      }
    }
    db.meetings.splice(index, 1);
    saveDb(db);
    res.json({ success: true, message: 'Đã xóa biên bản cuộc họp thành công' });
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi khi xóa cuộc họp' });
  }
});

// ==================== STATIC FILES ====================
app.use('/uploads', express.static(UPLOADS_DIR));

// ==================== SERVER START ====================
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 GOVAI server running at http://localhost:${port}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});