import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import * as XLSX from 'xlsx';

dotenv.config();

const app = express();
const port = 2310;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Setup storage directories
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Database Interface
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
    docType: string; // Quyết định, Thông báo, Công văn, etc.
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
  uploadedAt: string;
  sheetNames: string[];
  dataSummary: string; // Brief JSON description of parsed data
  analysis: string; // Gemini generated narrative
  metrics: {
    title: string;
    value: string | number;
    change?: string;
  }[];
  charts: {
    name: string;
    [key: string]: any;
  }[];
}

interface MeetingRecord {
  id: string;
  originalName: string;
  filename: string;
  uploadedAt: string;
  duration?: string;
  transcript: string; // Transcribed text
  summary: string; // Meeting summary
  actionItems: {
    task: string;
    assignee: string;
    deadline: string;
  }[];
  speakers: string[];
  minutes: string; // Formatted markdown minutes
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

// Load Database
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

// Save Database
function saveDb(db: DatabaseSchema) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving DB file', error);
  }
}

// Initialize AI SDK helper
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

// ==================== MODULE 1: SỐ HÓA HỒ SƠ VÀ QUẢN LÝ VĂN BẢN ====================
// Cấu hình thư mục uploads
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Cấu hình Multer cho upload file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Tạo tên file unique để tránh trùng lặp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    // Loại bỏ dấu và ký tự đặc biệt để an toàn
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
    // Cho phép các định dạng file phổ biến
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'text/plain'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Định dạng file không được hỗ trợ. Vui lòng tải lên PDF, DOCX, JPG, PNG hoặc TXT.'));
    }
  }
});

// ====== UPLOAD & DIGITIZE ======
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

    // Xử lý trích xuất văn bản dựa trên loại file
    try {
      if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // DOCX - Sử dụng mammoth
        const result = await mammoth.extractRawText({ path: filePath });
        extractedText = result.value;
      } else if (mimetype === 'application/pdf') {
        // PDF - Sử dụng Gemini để trích xuất
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              inlineData: {
                data: fileBase64,
                mimeType: mimetype
              }
            },
            'Hãy trích xuất toàn bộ nội dung văn bản tiếng Việt có trong tệp PDF này dưới dạng thô đầy đủ, giữ nguyên cấu trúc dòng nếu có.'
          ]
        });
        extractedText = response.text || '';
      } else if (mimetype.startsWith('image/')) {
        // Image - Sử dụng Gemini OCR
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              inlineData: {
                data: fileBase64,
                mimeType: mimetype
              }
            },
            'Hãy trích xuất toàn bộ nội dung văn bản tiếng Việt có trong hình ảnh này dưới dạng thô đầy đủ.'
          ]
        });
        extractedText = response.text || '';
      } else if (mimetype === 'text/plain') {
        // Plain text
        extractedText = fs.readFileSync(filePath, 'utf8');
      } else {
        // Fallback cho các loại file khác
        extractedText = `Không thể trích xuất tự động nội dung văn bản từ tệp ${originalname}. Vui lòng kiểm tra lại định dạng file.`;
      }
    } catch (extractError) {
      console.error('Text extraction error:', extractError);
      extractedText = `Lỗi khi trích xuất nội dung từ tệp ${originalname}. Vui lòng thử lại với file khác.`;
    }

    if (!extractedText.trim()) {
      extractedText = `Không thể trích xuất nội dung văn bản từ tệp ${originalname}. File có thể bị hỏng hoặc không chứa văn bản.`;
    }

    // Phân tích metadata bằng Gemini
    let metadata = {
      docType: 'Khác',
      docNumber: 'Không rõ',
      signer: 'Không rõ',
      issueDate: 'Không rõ',
      summary: `Tài liệu số hóa từ tệp ${originalname}. Nội dung đã được trích xuất ${extractedText.length} ký tự.`,
      issuer: 'Không rõ'
    };

    try {
      const metaResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            text: `Dưới đây là nội dung văn bản của tài liệu "${originalname}":\n\n${extractedText.substring(0, 5000)}\n\nHãy phân tích văn bản này và trích xuất các thông tin hành chính cốt lõi sau dưới dạng JSON tiếng Việt:\n` +
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
      // Vẫn giữ metadata mặc định
    }

    // Tạo document record mới
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

    // Lưu vào database
    const db = loadDb();
    db.documents.push(newDoc);
    saveDb(db);

    // Trả về response
    res.status(201).json({
      ...newDoc,
      message: 'Số hóa tài liệu thành công'
    });

  } catch (error: any) {
    console.error('Digitization error:', error);
    res.status(500).json({
      error: error.message || 'Lỗi xử lý số hóa tài liệu. Vui lòng thử lại.'
    });
  }
});

// ====== GET LIST DOCUMENTS ======
app.get('/api/digitize/list', (req, res) => {
  try {
    const db = loadDb();
    // Sắp xếp theo thời gian mới nhất
    const documents = db.documents.sort((a, b) => 
      new Date(b.digitizedAt).getTime() - new Date(a.digitizedAt).getTime()
    );
    res.json(documents);
  } catch (error: any) {
    console.error('Get list error:', error);
    res.status(500).json({
      error: 'Không thể lấy danh sách tài liệu. Vui lòng thử lại.'
    });
  }
});

// ====== GET DOCUMENT DETAIL ======
app.get('/api/digitize/detail/:id', (req, res) => {
  try {
    const db = loadDb();
    const doc = db.documents.find(d => d.id === req.params.id);
    
    if (!doc) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    }
    
    res.json(doc);
  } catch (error: any) {
    console.error('Get detail error:', error);
    res.status(500).json({
      error: 'Lỗi khi lấy chi tiết tài liệu. Vui lòng thử lại.'
    });
  }
});

// ====== DOWNLOAD DOCUMENT ======
app.get('/api/digitize/download/:id', async (req, res) => {
  try {
    const db = loadDb();
    const doc = db.documents.find(d => d.id === req.params.id);
    
    if (!doc) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    }

    // Kiểm tra file tồn tại
    if (!fs.existsSync(doc.filePath)) {
      return res.status(404).json({ 
        error: 'File không còn tồn tại trên server. Vui lòng tải lên lại.' 
      });
    }

    // Kiểm tra quyền đọc file
    try {
      fs.accessSync(doc.filePath, fs.constants.R_OK);
    } catch (accessError) {
      return res.status(403).json({ 
        error: 'Không có quyền truy cập file. Vui lòng liên hệ quản trị viên.' 
      });
    }

    // Lấy thông tin file
    const stat = fs.statSync(doc.filePath);
    const fileSize = stat.size;

    // Set headers cho download
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Tạo stream và gửi file
    const fileStream = fs.createReadStream(doc.filePath);
    
    fileStream.on('error', (streamError) => {
      console.error('Stream error:', streamError);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Lỗi khi đọc file' });
      }
    });

    fileStream.pipe(res);

  } catch (error: any) {
    console.error('Download error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error.message || 'Lỗi khi tải file. Vui lòng thử lại.'
      });
    }
  }
});

// ====== CHECK FILE EXISTS ======
app.head('/api/digitize/check/:id', (req, res) => {
  try {
    const db = loadDb();
    const doc = db.documents.find(d => d.id === req.params.id);
    
    if (!doc) {
      return res.status(404).end();
    }
    
    if (!fs.existsSync(doc.filePath)) {
      return res.status(404).end();
    }
    
    // Kiểm tra quyền đọc
    try {
      fs.accessSync(doc.filePath, fs.constants.R_OK);
    } catch {
      return res.status(403).end();
    }
    
    res.status(200).end();
  } catch (error) {
    console.error('Check file error:', error);
    res.status(404).end();
  }
});

// ====== DOWNLOAD AS BLOB (Alternative method) ======
app.get('/api/digitize/blob/:id', async (req, res) => {
  try {
    const db = loadDb();
    const doc = db.documents.find(d => d.id === req.params.id);
    
    if (!doc) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    }

    if (!fs.existsSync(doc.filePath)) {
      return res.status(404).json({ error: 'File không tồn tại' });
    }

    // Đọc toàn bộ file vào memory
    const fileBuffer = fs.readFileSync(doc.filePath);
    const mimeType = doc.mimeType || 'application/octet-stream';
    
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`);
    res.setHeader('Content-Length', fileBuffer.length);
    res.send(fileBuffer);
    
  } catch (error: any) {
    console.error('Blob download error:', error);
    res.status(500).json({
      error: error.message || 'Lỗi khi tải file'
    });
  }
});

// ====== DELETE DOCUMENT ======
app.delete('/api/digitize/:id', (req, res) => {
  try {
    const db = loadDb();
    const index = db.documents.findIndex(d => d.id === req.params.id);
    
    if (index === -1) {
      return res.status(404).json({ error: 'Không tìm thấy tài liệu' });
    }
    
    const doc = db.documents[index];
    
    // Xóa file vật lý nếu tồn tại
    if (fs.existsSync(doc.filePath)) {
      try {
        fs.unlinkSync(doc.filePath);
        console.log(`Deleted file: ${doc.filePath}`);
      } catch (e) {
        console.error('Failed to delete physical file:', e);
        // Vẫn tiếp tục xóa record dù không xóa được file
      }
    }
    
    // Xóa record khỏi database
    db.documents.splice(index, 1);
    saveDb(db);
    
    res.json({ 
      success: true, 
      message: 'Đã xóa tài liệu thành công',
      deletedId: req.params.id
    });
  } catch (error: any) {
    console.error('Delete error:', error);
    res.status(500).json({
      error: error.message || 'Lỗi khi xóa tài liệu. Vui lòng thử lại.'
    });
  }
});

// ====== SEARCH DOCUMENTS ======
app.get('/api/digitize/search', (req, res) => {
  try {
    const { q, docType, from, to } = req.query;
    const db = loadDb();
    let results = db.documents;

    // Tìm kiếm theo từ khóa
    if (q && typeof q === 'string' && q.trim()) {
      const searchTerm = q.trim().toLowerCase();
      results = results.filter(doc => {
        return (
          doc.originalName.toLowerCase().includes(searchTerm) ||
          doc.metadata.docNumber.toLowerCase().includes(searchTerm) ||
          doc.metadata.signer.toLowerCase().includes(searchTerm) ||
          doc.metadata.summary.toLowerCase().includes(searchTerm) ||
          doc.metadata.issuer.toLowerCase().includes(searchTerm) ||
          doc.extractedText.toLowerCase().includes(searchTerm)
        );
      });
    }

    // Lọc theo loại văn bản
    if (docType && typeof docType === 'string' && docType !== 'All') {
      results = results.filter(doc => doc.metadata.docType === docType);
    }

    // Lọc theo khoảng thời gian
    if (from && typeof from === 'string') {
      const fromDate = new Date(from);
      results = results.filter(doc => new Date(doc.digitizedAt) >= fromDate);
    }

    if (to && typeof to === 'string') {
      const toDate = new Date(to);
      results = results.filter(doc => new Date(doc.digitizedAt) <= toDate);
    }

    // Sắp xếp theo thời gian mới nhất
    results.sort((a, b) => 
      new Date(b.digitizedAt).getTime() - new Date(a.digitizedAt).getTime()
    );

    res.json({
      results,
      total: results.length,
      query: { q, docType, from, to }
    });
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Lỗi khi tìm kiếm tài liệu. Vui lòng thử lại.'
    });
  }
});

// ====== GET DOCUMENT STATISTICS ======
app.get('/api/digitize/statistics', (req, res) => {
  try {
    const db = loadDb();
    const docs = db.documents;

    // Thống kê theo loại văn bản
    const typeStats: Record<string, number> = {};
    docs.forEach(doc => {
      const type = doc.metadata.docType || 'Khác';
      typeStats[type] = (typeStats[type] || 0) + 1;
    });

    // Thống kê theo tháng
    const monthlyStats: Record<string, number> = {};
    docs.forEach(doc => {
      const month = new Date(doc.digitizedAt).toISOString().substring(0, 7);
      monthlyStats[month] = (monthlyStats[month] || 0) + 1;
    });

    // Tổng dung lượng
    const totalSize = docs.reduce((sum, doc) => sum + (doc.fileSize || 0), 0);

    res.json({
      totalDocuments: docs.length,
      totalSize: totalSize,
      typeStats: typeStats,
      monthlyStats: monthlyStats,
      averageSize: docs.length > 0 ? totalSize / docs.length : 0
    });
  } catch (error: any) {
    console.error('Statistics error:', error);
    res.status(500).json({
      error: 'Lỗi khi lấy thống kê tài liệu. Vui lòng thử lại.'
    });
  }
});

// ====== EXPORT ALL DOCUMENTS METADATA ======
app.get('/api/digitize/export-metadata', (req, res) => {
  try {
    const db = loadDb();
    const exportData = db.documents.map(doc => ({
      id: doc.id,
      originalName: doc.originalName,
      docType: doc.metadata.docType,
      docNumber: doc.metadata.docNumber,
      signer: doc.metadata.signer,
      issueDate: doc.metadata.issueDate,
      issuer: doc.metadata.issuer,
      summary: doc.metadata.summary,
      digitizedAt: doc.digitizedAt,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType
    }));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=metadata_export_${Date.now()}.json`);
    res.json(exportData);
  } catch (error: any) {
    console.error('Export metadata error:', error);
    res.status(500).json({
      error: 'Lỗi khi xuất metadata. Vui lòng thử lại.'
    });
  }
});


// --- MODULE 2: TRỢ LÝ CÔNG VỤ AI APIs ---

app.post('/api/assistant/chat', async (req, res) => {
  try {
    const { message, documentId, chatSessionId, history = [] } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Câu hỏi không được để trống' });
    }

    const ai = getGeminiClient(req.headers);
    const db = loadDb();

    let contextText = '';
    let selectedDoc: DocumentRecord | undefined;

    if (documentId) {
      selectedDoc = db.documents.find(d => d.id === documentId);
      if (selectedDoc) {
        contextText = `THÔNG TIN TÀI LIỆU HỖ TRỢ:\n` +
                      `- Tên tệp: ${selectedDoc.originalName}\n` +
                      `- Loại văn bản: ${selectedDoc.metadata.docType}\n` +
                      `- Số văn bản: ${selectedDoc.metadata.docNumber}\n` +
                      `- Đơn vị ban hành: ${selectedDoc.metadata.issuer}\n` +
                      `- Ngày ban hành: ${selectedDoc.metadata.issueDate}\n` +
                      `- Người ký: ${selectedDoc.metadata.signer}\n` +
                      `- Nội dung chính tóm tắt: ${selectedDoc.metadata.summary}\n\n` +
                      `NỘI DUNG TOÀN VĂN CHI TIẾT:\n${selectedDoc.extractedText}\n\n`;
      }
    }

    const systemInstruction = 
      "Bạn là GOVAI - Trợ lý công vụ số thông minh, chuyên nghiệp dành cho cán bộ, công chức hành chính Việt Nam.\n" +
      "Hãy hỗ trợ trả lời câu hỏi của người dùng một cách chính xác, lịch sự, đúng quy định pháp luật và văn phong hành chính nhà nước (trang trọng, gãy gọn, chuẩn xác).\n" +
      (contextText ? `Người dùng đang hỏi về tài liệu đính kèm. Hãy căn cứ chủ yếu vào nội dung tài liệu đính kèm bên dưới để trả lời chính xác câu hỏi. Nếu câu hỏi nằm ngoài phạm vi tài liệu, hãy sử dụng hiểu biết công vụ chung để hỗ trợ nhưng nêu rõ nguồn gốc.\n\n${contextText}` : "") +
      "Khi hỗ trợ soạn thảo hoặc hướng dẫn quy trình, hãy phân tích rõ ràng các bước và trích dẫn nếu cần.";

    // Convert history format to system format if needed
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
      config: {
        systemInstruction
      }
    });

    const replyText = response.text || 'Tôi không tìm thấy câu trả lời phù hợp.';

    // Manage chat sessions
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

// Xóa 1 phiên chat
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

app.use('/uploads', express.static('uploads'));

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
      "- Quốc hiệu, Tiêu ngữ (CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM / Độc lập - Tự do - Hạnh phúc)\n" +
      "- Tên cơ quan ban hành (Ví dụ: ỦY BAN NHÂN DÂN TỈNH [Tên Tỉnh/Thành phố], hoặc để trống dạng [...] để người dùng điền)\n" +
      "- Số, ký hiệu văn bản\n" +
      "- Địa danh và ngày tháng năm ban hành\n" +
      "- Tên loại văn bản và Trích yếu nội dung (Ví dụ: QUYẾT ĐỊNH Về việc thành lập hội đồng...)\n" +
      "- Căn cứ pháp lý (phù hợp với nội dung)\n" +
      "- Nội dung chính (chia các Điều 1, Điều 2... hoặc các mục rõ ràng)\n" +
      "- Chức vụ, chữ ký của người thẩm quyền (Ví dụ: CHỦ TỊCH, ký tên và đóng dấu)\n" +
      "- Nơi nhận\n" +
      "Văn phong: " + tone + ".\n" +
      "Hãy xuất kết quả hoàn toàn bằng Markdown đẹp mắt, có phân cấp rõ ràng.";

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Soạn văn bản loại: ${docType || 'Văn bản hành chính chung'}.\nYêu cầu của người dùng: ${prompt}.\nGhi chú bổ sung: ${additionalNotes || 'Không có'}.`,
      config: {
        systemInstruction
      }
    });

    res.json({ content: response.text });
  } catch (error: any) {
    console.error('Draft generation error:', error);
    res.status(500).json({ error: error.message || 'Lỗi soạn thảo văn bản hành chính' });
  }
});

// Simple export to word (HTML representation that word can open directly)
app.post('/api/assistant/export', (req, res) => {
  try {
    const { content, docTitle } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Không có nội dung xuất bản' });
    }

    const title = docTitle || 'van_ban_govai';
    const safeTitle = title.replace(/[^a-zA-Z0-9_]/g, '_');

    // Create simple HTML that Word opens nicely as an editable DOC
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>${title}</title>
        <meta charset="utf-8">
        <style>
          body {
            font-family: "Times New Roman", Times, serif;
            font-size: 14pt;
            line-height: 1.5;
            margin: 1in;
          }
          h1, h2, h3 {
            text-align: center;
            font-weight: bold;
          }
          .header-table {
            width: 100%;
            border: none;
            margin-bottom: 20px;
          }
          .header-table td {
            border: none;
            text-align: center;
            vertical-align: top;
            width: 50%;
            font-size: 12pt;
          }
          .national-title {
            font-weight: bold;
            font-size: 13pt;
          }
          .national-subtitle {
            text-decoration: underline;
            font-size: 14pt;
          }
          .doc-title {
            margin-top: 30px;
            font-size: 16pt;
            font-weight: bold;
          }
          .signer-table {
            width: 100%;
            border: none;
            margin-top: 40px;
          }
          .signer-table td {
            border: none;
            vertical-align: top;
            width: 50%;
            font-size: 13pt;
          }
        </style>
      </head>
      <body>
        ${content}
      </body>
      </html>
    `;

    res.setHeader('Content-disposition', `attachment; filename=${safeTitle}.doc`);
    res.setHeader('Content-type', 'application/msword');
    res.send(htmlContent);
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi xuất tệp văn bản' });
  }
});


// --- MODULE 3: BÁO CÁO THÔNG MINH APIs ---

app.post('/api/report/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không tìm thấy tệp dữ liệu' });
    }

  const { originalname, filename, path: filePath } = req.file;
  const originalName = Buffer.from(originalname, "latin1").toString("utf8");


    // Read excel file
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer,{type:'buffer'});
    const sheetNames = workbook.SheetNames;
    
    // Parse the first sheet into rows of JSON
    const firstSheetName = sheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet);

    if (rawData.length === 0) {
      return res.status(400).json({ error: 'Tệp Excel trống hoặc không đúng định dạng.' });
    }

    // Convert raw data to a clean text summary for Gemini
    const sampleData = rawData.slice(0, 40); // limit rows to prevent token blowup
    const dataString = JSON.stringify(sampleData, null, 2);

    const ai = getGeminiClient(req.headers);

    // Call Gemini to analyze table, extract key metrics, chart structures and insights
    const analysisResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          text: `Dưới đây là một phần dữ liệu hành chính từ tệp Excel "${originalname}" (Tên trang: ${firstSheetName}):\n\n` +
                `${dataString}\n\n` +
                `Hãy đóng vai trò chuyên viên Phân tích dữ liệu hành chính công. Thực hiện phân tích dữ liệu trên và tạo một cấu trúc báo cáo thông minh theo định dạng JSON dưới đây:\n` +
                `{\n` +
                `  "metrics": [\n` +
                `    {"title": "Tên chỉ số", "value": "Giá trị (ví dụ: số lượng hoặc phần trăm)", "change": "Mức tăng/giảm so với trước nếu có (ví dụ: +5% hoặc -2%, có thể trống)"}\n` +
                `  ],\n` +
                `  "charts": [\n` +
                `    {"name": "Nhãn phân loại (ví dụ: tháng, phòng ban, loại hồ sơ)", "value": 120, "extra": 45}\n` +
                `  ],\n` +
                `  "analysis": "Đoạn văn phân tích và nhận xét chuyên sâu bằng tiếng Việt có cấu trúc Markdown rõ ràng về xu hướng chỉ số, các điểm lưu ý hành chính và đề xuất giải pháp cải thiện công việc hành chính."\n` +
                `}\n\n` +
                `Lưu ý: "metrics" phải có từ 3-4 chỉ số quan trọng trích xuất từ dữ liệu. "charts" chứa danh sách tối đa 8-10 phần tử dữ liệu đại diện để vẽ biểu đồ thanh hoặc biểu đồ đường trực quan. "analysis" phải viết mạch lạc, trang nghiêm chuẩn công sở.`
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

    let reportResult = {
      metrics: [
        { title: 'Tổng số dòng dữ liệu', value: rawData.length.toString() },
        { title: 'Số lượng cột chỉ số', value: Object.keys(rawData[0] || {}).length.toString() },
        { title: 'Trạng thái phân tích', value: 'Hoàn tất tự động' }
      ],
      charts: [],
      analysis: 'Không thể tạo nhận xét tự động cho dữ liệu này.'
    };

    if (analysisResponse.text) {
      try {
        reportResult = JSON.parse(analysisResponse.text.trim());
      } catch (parseErr) {
        console.error('Error parsing report analysis json, using fallback', parseErr);
      }
    }

    const reportId = 'rep-' + Date.now();
    const newReport: ReportRecord = {
      id: reportId,
      originalName: originalName,
      filename,
      uploadedAt: new Date().toISOString(),
      sheetNames,
      dataSummary: `Chứa ${rawData.length} dòng dữ liệu hành chính phân tích từ trang ${firstSheetName}.`,
      analysis: reportResult.analysis,
      metrics: reportResult.metrics,
      charts: reportResult.charts
    };

    const db = loadDb();
    db.reports.push(newReport);
    saveDb(db);

    res.json(newReport);
  } catch (error: any) {
    console.error('Report processing error:', error);
    res.status(500).json({ error: error.message || 'Lỗi xử lý tệp báo cáo Excel' });
  }
});

app.get('/api/report/list', (req, res) => {
  try {
    const db = loadDb();
    res.json(db.reports);
  } catch (error: any) {
    res.status(500).json({ error: 'Không thể lấy danh sách báo cáo' });
  }
});

app.delete('/api/report/:id', (req, res) => {
  try {
    const db = loadDb();
    const index = db.reports.findIndex(r => r.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Không tìm thấy báo cáo' });
    }
    const rep = db.reports[index];
    const filePath = path.join(UPLOADS_DIR, rep.filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Failed to delete physical excel file', e);
      }
    }
    db.reports.splice(index, 1);
    saveDb(db);
    res.json({ success: true, message: 'Đã xóa báo cáo thành công' });
  } catch (error: any) {
    res.status(500).json({ error: 'Lỗi khi xóa báo cáo' });
  }
});


// --- MODULE 4: CUỘC HỌP SỐ APIs ---

app.post('/api/meeting/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không tìm thấy tệp ghi âm cuộc họp' });
    }

    const originalName = Buffer
      .from(req.file.originalname, "latin1")
      .toString("utf8");

    const {
      filename,
      mimetype,
      path: filePath,
    } = req.file;
    const fileBase64 = fs.readFileSync(filePath).toString('base64');

    const ai = getGeminiClient(req.headers);

    // Call Gemini with Multimodal speech-to-text + structured transcription & minutes generation
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
        `1. Chuyển giọng nói thành văn bản tiếng Việt đầy đủ (Transcript), có ghi rõ mốc thời gian hoặc phân tách người nói (Người phát biểu 1, Người phát biểu 2...) một cách hợp lý.\n` +
        `2. Hãy tóm tắt ngắn gọn các chủ đề chính đã thảo luận.\n` +
        `3. Liệt kê danh sách các công việc/nhiệm vụ được giao, người chịu trách nhiệm và thời hạn hoàn thành (nếu có nhắc đến trong âm thanh, nếu không nhắc đến hãy tự suy luận phân vai hợp lý dựa trên cuộc họp).\n` +
        `4. Tạo một văn bản Biên bản cuộc họp chính thức đầy đủ chuẩn công sở bằng tiếng Việt.\n\n` +
        `Hãy trả về kết quả dưới dạng JSON chuẩn theo schema sau:\n` +
        `{\n` +
        `  "transcript": "Nội dung cuộc họp chuyển từ giọng nói sang văn bản đầy đủ...",\n` +
        `  "summary": "Tóm tắt ngắn gọn cuộc họp...",\n` +
        `  "speakers": ["Người phát biểu 1", "Người phát biểu 2"],\n` +
        `  "actionItems": [\n` +
        `    {"task": "Nhiệm vụ cần thực hiện", "assignee": "Người chịu trách nhiệm", "deadline": "Thời hạn"}\n` +
        `  ],\n` +
        `  "minutes": "Mẫu biên bản cuộc họp chính thức được định dạng Markdown..."\n` +
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
      transcript: 'Không thể tự động giải mã giọng nói. Vui lòng kiểm tra lại chất lượng tệp ghi âm.',
      summary: 'Ghi âm cuộc họp chưa được tóm tắt.',
      speakers: ['Người họp 1', 'Người họp 2'],
      actionItems: [],
      minutes: '# BIÊN BẢN CUỘC HỌP\n\nChưa có biên bản tự động.'
    };

    if (response.text) {
      try {
        meetingResult = JSON.parse(response.text.trim());
      } catch (parseErr) {
        console.error('Error parsing meeting response JSON, using fallback', parseErr);
      }
    }

    const meetingId = 'meet-' + Date.now();
    const newMeeting: MeetingRecord = {
      id: meetingId,
      originalName: originalName,
      filename,
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

    res.json(newMeeting);
  } catch (error: any) {
    console.error('Meeting processing error:', error);
    res.status(500).json({ error: error.message || 'Lỗi xử lý file âm thanh ghi âm cuộc họp' });
  }
});

app.get('/api/meeting/list', (req, res) => {
  try {
    const db = loadDb();
    res.json(db.meetings);
  } catch (error: any) {
    res.status(500).json({ error: 'Không thể lấy danh sách cuộc họp số' });
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

app.use("/uploads", express.static(UPLOADS_DIR));


// Serve static files in production or hook Vite in dev
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res, next) => {
      // Avoid routing API calls to index.html
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    // Vite dev mode integration
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`GOVAI server running at http://localhost:${port}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
