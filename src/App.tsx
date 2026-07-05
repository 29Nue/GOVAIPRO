import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Bot,
  BarChart3,
  Mic,
  Settings,
  History,
  LayoutDashboard,
  Upload,
  Download,
  Search,
  Trash2,
  User,
  Clock,
  Sparkles,
  Plus,
  Send,
  Copy,
  Check,
  CheckSquare,
  ShieldAlert,
  Calendar,
  Hash,
  UserCheck,
  FileSpreadsheet,
  RefreshCw,
  Eye,
  FileCode,
  CheckCircle2,
  AlertCircle,
  FileDown,
  Printer
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line
} from 'recharts';

type DocumentItem = {
  id: string;
  originalName: string;
  fileUrl: string;
  metadata: {
    docType: string;
    docNumber: string;
    issueDate: string;
  };
};

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'dashboard' | 'digitize' | 'assistant' | 'report' | 'meeting' | 'history' | 'settings'>('dashboard');

  // Time clock
  const [currentTime, setCurrentTime] = useState(new Date());

  // User Configurations (Persisted in LocalStorage)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('govai_gemini_api_key') || '');
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('govai_display_name') || 'Chuyên viên Nguyễn Văn A');
  const [agencyName, setAgencyName] = useState(() => localStorage.getItem('govai_agency_name') || 'Văn phòng Bộ Nội vụ');

  // App Global Status
  const [isOnline, setIsOnline] = useState(true);

  // Module 1 States (Digitization)
  const [documents, setDocuments] = useState<any[]>([]);
  const [isDigitizing, setIsDigitizing] = useState(false);
  const [digitizeSearch, setDigitizeSearch] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [digitizeDocTypeFilter, setDigitizeDocTypeFilter] = useState('All');

  // Module 2 States (AI Assistant)
  const [chatSessions, setChatSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatDocContextId, setChatDocContextId] = useState<string>('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Draft Writer states
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftDocType, setDraftDocType] = useState('Quyết định');
  const [draftTone, setDraftTone] = useState('Trang trọng, chuẩn công vụ');
  const [draftNotes, setDraftNotes] = useState('');
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [generatedDraft, setGeneratedDraft] = useState('');
  const [draftCopied, setDraftCopied] = useState(false);
  const [isDraftMode, setIsDraftMode] = useState(false);

  // Module 3 States (Smart Report)
  const [reports, setReports] = useState<any[]>([]);
  const [isAnalyzingReport, setIsAnalyzingReport] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Module 4 States (Digital Meeting)
  const [meetings, setMeetings] = useState<any[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);

  // Notification Banner
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

  // Local state for copy confirmation
  const [minutesCopied, setMinutesCopied] = useState(false);

  // Audio Playback states for Meeting Demo
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Update Clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync state to local storage
  const handleSaveSettings = (key: string, name: string, agency: string) => {
    localStorage.setItem('govai_gemini_api_key', key);
    localStorage.setItem('govai_display_name', name);
    localStorage.setItem('govai_agency_name', agency);
    setApiKey(key);
    setDisplayName(name);
    setAgencyName(agency);
    triggerAlert('success', 'Đã lưu cấu hình hệ thống thành công');
  };

  const triggerAlert = (type: 'success' | 'error' | 'info', text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => {
      setAlertMsg(null);
    }, 5000);
  };

  // Helper to attach custom API Key Header
  const getHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['x-gemini-key'] = apiKey;
    }
    return headers;
  };

  // Fetch initial database lists
  const fetchAllData = async () => {
    try {
      const [docsRes, chatsRes, reportsRes, meetingsRes] = await Promise.all([
        fetch('/api/digitize/list'),
        fetch('/api/assistant/chats'),
        fetch('/api/report/list'),
        fetch('/api/meeting/list')
      ]);

      if (docsRes.ok) setDocuments(await docsRes.json());
      if (chatsRes.ok) {
        const sessions = await chatsRes.json();
        setChatSessions(sessions);
        if (sessions.length > 0 && !activeSessionId) {
          setActiveSessionId(sessions[0].id);
        }
      }
      if (reportsRes.ok) {
        const reps = await reportsRes.json();
        setReports(reps);
        if (reps.length > 0 && !selectedReportId) {
          setSelectedReportId(reps[0].id);
        }
      }
      if (meetingsRes.ok) {
        const meets = await meetingsRes.json();
        setMeetings(meets);
        if (meets.length > 0 && !selectedMeetingId) {
          setSelectedMeetingId(meets[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load data from server', err);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // --- ACTIONS ---

  // Digitization Upload Action
  const handleDigitizeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);

    setIsDigitizing(true);
    triggerAlert('info', `Đang tải lên và thực hiện số hóa văn bản: ${file.name}...`);

    try {
      const res = await fetch('/api/digitize/upload', {
        method: 'POST',
        headers: apiKey ? { 'x-gemini-key': apiKey } : {},
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Lỗi số hóa tài liệu');
      }

      const newDoc = await res.json();
      setDocuments(prev => [newDoc, ...prev]);
      setSelectedDoc(newDoc);
      triggerAlert('success', `Số hóa thành công: ${file.name}`);
    } catch (err: any) {
      triggerAlert('error', err.message || 'Không thể số hóa tài liệu này');
    } finally {
      setIsDigitizing(false);
      if (e.target) e.target.value = '';
    }
  };

  // Delete document
  const handleDeleteDoc = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Bạn có chắc chắn muốn xóa tài liệu này khỏi danh bạ số hóa?')) return;

    try {
      const res = await fetch(`/api/digitize/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== id));
        if (selectedDoc?.id === id) setSelectedDoc(null);
        triggerAlert('success', 'Đã xóa tài liệu số hóa thành công');
      } else {
        throw new Error('Lỗi từ server');
      }
    } catch (err) {
      triggerAlert('error', 'Không thể xóa tài liệu');
    }
  };

  // Chat AI Action
  const handleSendChat = async () => {
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setChatInput('');
    setIsSendingChat(true);

    // Optimistically update chat interface locally
    const tempSessionId = activeSessionId || 'session-temp';
    const updatedSessions = [...chatSessions];
    let currentSession = updatedSessions.find(s => s.id === tempSessionId);

    if (!currentSession) {
      currentSession = {
        id: tempSessionId,
        title: userMsg.substring(0, 30) + (userMsg.length > 30 ? '...' : ''),
        messages: []
      };
      updatedSessions.push(currentSession);
    }

    currentSession.messages.push({
      role: 'user',
      content: userMsg,
      timestamp: new Date().toISOString()
    });
    setChatSessions(updatedSessions);

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          message: userMsg,
          documentId: chatDocContextId || undefined,
          chatSessionId: activeSessionId || undefined,
          history: currentSession.messages.slice(0, -1) // send previous history
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Lỗi xử lý phản hồi từ AI');
      }

      const data = await res.json();
      setChatSessions(data.chats);
      setActiveSessionId(data.chatSessionId);
    } catch (err: any) {
      triggerAlert('error', err.message || 'Lỗi gửi tin nhắn cho Trợ lý AI');
      // Revert optimistic insert or mark with error
      currentSession.messages.push({
        role: 'model',
        content: `⚠️ [Lỗi]: ${err.message || 'Không có kết nối hoặc API Key không hợp lệ.'}`,
        timestamp: new Date().toISOString()
      });
      setChatSessions([...updatedSessions]);
    } finally {
      setIsSendingChat(false);
    }
  };

  // Create new chat session
  const handleNewChatSession = () => {
    setActiveSessionId(null);
    setChatDocContextId('');
    setIsDraftMode(false);
    setGeneratedDraft('');
    triggerAlert('info', 'Đã bắt đầu một phiên hội thoại công vụ mới');
  };

  // Draft Administrative Document Action
  const handleGenerateDraft = async () => {
    if (!draftPrompt.trim()) {
      triggerAlert('error', 'Vui lòng cung cấp nội dung mô tả yêu cầu soạn thảo');
      return;
    }

    setIsGeneratingDraft(true);
    triggerAlert('info', 'Đang phân tích và sinh văn bản hành chính bằng AI...');

    try {
      const res = await fetch('/api/assistant/generate', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          prompt: draftPrompt,
          docType: draftDocType,
          tone: draftTone,
          additionalNotes: draftNotes
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Lỗi sinh văn bản hành chính');
      }

      const data = await res.json();
      setGeneratedDraft(data.content);
      triggerAlert('success', 'Đã sinh dự thảo văn bản thành công');
    } catch (err: any) {
      triggerAlert('error', err.message || 'Lỗi trong quá trình soạn thảo bằng AI');
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // Enhanced Copy Draft to Clipboard
  const copyDraftToClipboard = () => {
    if (!generatedDraft) {
      triggerAlert('error', 'Không có nội dung để sao chép');
      return;
    }
    
    navigator.clipboard.writeText(generatedDraft).then(() => {
      setDraftCopied(true);
      triggerAlert('success', 'Đã sao chép toàn bộ dự thảo văn bản vào bộ nhớ đệm');
      setTimeout(() => setDraftCopied(false), 3000);
    }).catch(() => {
      triggerAlert('error', 'Không thể sao chép văn bản');
    });
  };

  // Enhanced Export Draft to Word DOC with proper formatting
  const handleExportDraft = () => {
    if (!generatedDraft) {
      triggerAlert('error', 'Không có nội dung để xuất');
      return;
    }

    // Create formatted HTML content for Word
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>${draftDocType} - Dự thảo</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body { 
            font-family: 'Times New Roman', Times, serif;
            font-size: 14pt;
            line-height: 1.5;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          h1 { 
            font-size: 20pt;
            text-align: center;
            font-weight: bold;
            margin: 20px 0;
          }
          h2 {
            font-size: 16pt;
            font-weight: bold;
            margin: 15px 0;
          }
          h3 {
            font-size: 14pt;
            font-weight: bold;
            margin: 10px 0;
          }
          p {
            margin: 8px 0;
            text-align: justify;
          }
          .center {
            text-align: center;
          }
          .right {
            text-align: right;
          }
          .bold {
            font-weight: bold;
          }
          .underline {
            text-decoration: underline;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 10px 0;
          }
          td, th {
            border: 1px solid #000;
            padding: 5px 8px;
          }
        </style>
      </head>
      <body>
        ${convertMarkdownToHTML(generatedDraft)}
      </body>
      </html>
    `;

    // Create Blob with proper Word MIME type
    const blob = new Blob([htmlContent], { 
      type: 'application/msword;charset=utf-8' 
    });
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${draftDocType}_DuThao_${new Date().toISOString().slice(0,10)}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    triggerAlert('success', 'Đã tải xuống file Word thành công');
  };

  // Helper function to convert markdown to styled HTML for Word export
  const convertMarkdownToHTML = (text: string) => {
    let html = text
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Bold
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      // Underline
      .replace(/__(.*)__/gim, '<u>$1</u>')
      // Bullet lists
      .replace(/^- (.*$)/gim, '• $1')
      .replace(/^\* (.*$)/gim, '• $1')
      // Numbered lists
      .replace(/^(\d+)\. (.*$)/gim, '$1. $2')
      // Line breaks
      .replace(/\n/gim, '<br>');
    
    return html;
  };

  // Upload Excel Report Action
  const handleReportUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);

    setIsAnalyzingReport(true);
    triggerAlert('info', `Đang tải lên và phân tích bảng số liệu Excel: ${file.name}...`);

    try {
      const res = await fetch('/api/report/upload', {
        method: 'POST',
        headers: apiKey ? { 'x-gemini-key': apiKey } : {},
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Lỗi phân tích Excel');
      }

      const newReport = await res.json();
      setReports(prev => [newReport, ...prev]);
      setSelectedReportId(newReport.id);
      triggerAlert('success', `Đã hoàn tất phân tích số liệu: ${file.name}`);
    } catch (err: any) {
      triggerAlert('error', err.message || 'Không thể phân tích dữ liệu bảng tính');
    } finally {
      setIsAnalyzingReport(false);
      if (e.target) e.target.value = '';
    }
  };

  // Delete report
  const handleDeleteReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Bạn có chắc muốn xóa báo cáo phân tích này?')) return;

    try {
      const res = await fetch(`/api/report/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setReports(prev => prev.filter(r => r.id !== id));
        if (selectedReportId === id) setSelectedReportId(null);
        triggerAlert('success', 'Đã xóa báo cáo thành công');
      }
    } catch (err) {
      triggerAlert('error', 'Lỗi khi xóa báo cáo');
    }
  };

  // Digital Meeting Audio Upload Action
  const handleMeetingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);

    setIsTranscribing(true);
    triggerAlert('info', `Đang tải lên ghi âm và thực hiện Speech To Text + Biên bản: ${file.name}...`);

    try {
      const res = await fetch('/api/meeting/upload', {
        method: 'POST',
        headers: apiKey ? { 'x-gemini-key': apiKey } : {},
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Lỗi xử lý file âm thanh');
      }

      const newMeeting = await res.json();
      setMeetings(prev => [newMeeting, ...prev]);
      setSelectedMeetingId(newMeeting.id);
      triggerAlert('success', `Phân tích cuộc họp thành công: ${file.name}`);
    } catch (err: any) {
      triggerAlert('error', err.message || 'Không thể trích xuất thông tin cuộc họp');
    } finally {
      setIsTranscribing(false);
      if (e.target) e.target.value = '';
    }
  };

  // Delete meeting
  const handleDeleteMeeting = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Bạn có chắc muốn xóa dữ liệu cuộc họp số này?')) return;

    try {
      const res = await fetch(`/api/meeting/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMeetings(prev => prev.filter(m => m.id !== id));
        if (selectedMeetingId === id) setSelectedMeetingId(null);
        triggerAlert('success', 'Đã xóa biên bản cuộc họp thành công');
      }
    } catch (err) {
      triggerAlert('error', 'Lỗi khi xóa cuộc họp');
    }
  };

  // Copy to clipboard helper
  const copyToClipboard = (text: string, flagSetter: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    flagSetter(true);
    setTimeout(() => flagSetter(false), 2000);
  };

  // Calculations for dashboard counters
  const totalDocsDigitized = documents.length;
  const totalAiUsage = chatSessions.reduce((acc, s) => acc + s.messages.length, 0) + (generatedDraft ? 1 : 0);
  const totalReportsCreated = reports.length;
  const totalMeetingsProcessed = meetings.length;

  const filteredDocs = documents.filter(doc => {
    const matchSearch = doc.originalName.toLowerCase().includes(digitizeSearch.toLowerCase()) ||
                        doc.metadata.docNumber.toLowerCase().includes(digitizeSearch.toLowerCase()) ||
                        doc.metadata.summary.toLowerCase().includes(digitizeSearch.toLowerCase()) ||
                        doc.metadata.signer.toLowerCase().includes(digitizeSearch.toLowerCase());
    const matchType = digitizeDocTypeFilter === 'All' || doc.metadata.docType === digitizeDocTypeFilter;
    return matchSearch && matchType;
  });

  const activeSession = chatSessions.find(s => s.id === activeSessionId) || { messages: [] };
  const currentReport = reports.find(r => r.id === selectedReportId);
  const currentMeeting = meetings.find(m => m.id === selectedMeetingId);
  
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

 // Xóa chat trong trợ lý AI
  const deleteSession = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa cuộc trò chuyện này không?')) return;
    
    try {
      const response = await fetch(`/api/assistant/chats/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Xóa thất bại');
      
      const updated = chatSessions.filter(s => s.id !== id);
      setChatSessions(updated);
      
      if (activeSessionId === id) {
        const first = updated[0];
        setActiveSessionId(first?.id || null);
        setChatDocContextId(first?.documentId || null);
      }
    } catch (err) {
      console.error(err);
      alert('Không thể xóa hội thoại');
    }
  };

  //hàm tải file đã số hóa về
const handleDownloadDoc = async (doc: any) => {
  try {
    // Sử dụng API endpoint thay vì URL cứng
    const response = await fetch(`/api/digitize/download/${doc.id}`, {
      method: 'GET',
      headers: getHeaders()
    });
    
    if (!response.ok) {
      throw new Error('Không thể tải file');
    }
    
    // Tạo blob từ response
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.originalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    triggerAlert('success', 'Tải file thành công');
  } catch (error) {
    triggerAlert('error', 'Không thể tải file. Vui lòng thử lại.');
    console.error('Download error:', error);
  }
};

// Hàm tải xuống file Word
const downloadWordFile = (content: string): void => {
  try {
    // Format nội dung với style đẹp
    const formattedContent = content
      .split('\n')
      .map(line => {
        // Xử lý các heading
        if (line.trim().startsWith('I.') || line.trim().startsWith('II.') || line.trim().startsWith('III.')) {
          return `<p style="font-weight: bold; margin-top: 12px; font-size: 14px;">${line}</p>`;
        }
        // Xử lý các mục con
        if (line.trim().match(/^\d+\./)) {
          return `<p style="margin-left: 20px; font-weight: 600; font-size: 13px;">${line}</p>`;
        }
        // Xử lý các dấu gạch đầu dòng
        if (line.trim().startsWith('-')) {
          return `<p style="margin-left: 30px; font-size: 13px;">${line}</p>`;
        }
        // Xử lý tiêu đề
        if (line.trim() === 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM' || 
            line.trim() === 'Độc lập - Tự do - Hạnh phúc') {
          return `<p style="text-align: center; font-weight: bold; font-size: 15px;">${line}</p>`;
        }
        if (line.trim() === 'BIÊN BẢN CUỘC HỌP') {
          return `<p style="text-align: center; font-weight: bold; font-size: 18px; text-transform: uppercase; margin: 20px 0;">${line}</p>`;
        }
        // Text thường
        if (line.trim()) {
          return `<p style="font-size: 13px; line-height: 1.6; margin: 4px 0;">${line}</p>`;
        }
        return '<br/>';
      })
      .join('');

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>Biên bản cuộc họp</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <style>
          body { 
            font-family: 'Times New Roman', Times, serif; 
            font-size: 13px; 
            line-height: 1.6; 
            padding: 50px;
            max-width: 800px;
            margin: 0 auto;
          }
          .content {
            max-width: 100%;
          }
          p {
            margin: 4px 0;
          }
        </style>
      </head>
      <body>
        <div class="content">
          ${formattedContent}
        </div>
      </body>
      </html>
    `;

    // Thêm BOM để hỗ trợ UTF-8
    const blob = new Blob(['\uFEFF' + htmlContent], { 
      type: 'application/msword;charset=utf-8' 
    });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `Bien_ban_cuoc_hop_${dateStr}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Lỗi tải file Word:', error);
    alert('Có lỗi xảy ra khi tải file Word. Vui lòng thử lại.');
  }
};

// Thêm state cho download report
const [isDownloadingReport, setIsDownloadingReport] = useState<string | null>(null);

// ====== HÀM XỬ LÝ CHO MODULE BÁO CÁO ======

// Hàm tải xuống file Excel gốc
const handleDownloadReport = async (reportId: string) => {
  try {
    setIsDownloadingReport(reportId);
    
    const response = await fetch(`/api/report/download/${reportId}`, {
      method: 'GET',
      headers: getHeaders()
    });

    if (!response.ok) {
      let errorMsg = 'Không thể tải file';
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch (e) {
        if (response.status === 404) {
          errorMsg = 'File không còn tồn tại trên server';
        }
      }
      throw new Error(errorMsg);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Lấy tên file từ response header hoặc từ report
    const contentDisposition = response.headers.get('Content-Disposition');
    let filename = 'bao_cao.xlsx';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename\*=UTF-8''(.+)/);
      if (match) {
        filename = decodeURIComponent(match[1]);
      }
    }
    link.download = filename;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    triggerAlert('success', 'Đã tải xuống file báo cáo thành công');
  } catch (error: any) {
    console.error('Download report error:', error);
    triggerAlert('error', error.message || 'Không thể tải file. Vui lòng thử lại.');
  } finally {
    setIsDownloadingReport(null);
  }
};

// Hàm xuất báo cáo ra Word
const handleExportReportToWord = (report: any) => {
  if (!report) {
    triggerAlert('error', 'Không có dữ liệu để xuất');
    return;
  }

  try {
    // Tạo nội dung HTML cho Word
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' 
            xmlns:w='urn:schemas-microsoft-com:office:word' 
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>Báo cáo phân tích dữ liệu</title>
        <style>
          body { 
            font-family: 'Times New Roman', Times, serif;
            font-size: 13px;
            line-height: 1.6;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          h1 { 
            font-size: 20pt;
            text-align: center;
            font-weight: bold;
            margin: 20px 0;
          }
          h2 {
            font-size: 16pt;
            font-weight: bold;
            margin: 15px 0;
          }
          h3 {
            font-size: 14pt;
            font-weight: bold;
            margin: 10px 0;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #000;
            padding-bottom: 20px;
            margin-bottom: 20px;
          }
          .metrics {
            display: flex;
            justify-content: space-around;
            margin: 20px 0;
            padding: 20px;
            background: #f5f5f5;
            border-radius: 8px;
          }
          .metric {
            text-align: center;
          }
          .metric-value {
            font-size: 24pt;
            font-weight: bold;
            color: #059669;
          }
          .metric-label {
            font-size: 11pt;
            color: #64748b;
          }
          .analysis {
            margin-top: 20px;
            padding: 20px;
            background: #f8fafc;
            border-left: 4px solid #059669;
            border-radius: 8px;
          }
          .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ccc;
            font-size: 11pt;
            color: #64748b;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 10px 0;
          }
          td, th {
            border: 1px solid #000;
            padding: 5px 8px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>BÁO CÁO PHÂN TÍCH DỮ LIỆU</h1>
          <p><strong>Tên báo cáo:</strong> ${report.originalName || 'Không có tên'}</p>
          <p><strong>Ngày tạo:</strong> ${report.uploadedAt ? new Date(report.uploadedAt).toLocaleString('vi-VN') : new Date().toLocaleString('vi-VN')}</p>
        </div>

        <h2>1. Thống kê tổng quan</h2>
        <div class="metrics">
          ${report.metrics?.map((metric: any) => `
            <div class="metric">
              <div class="metric-value">${metric.value || 0}</div>
              <div class="metric-label">${metric.title || ''}</div>
            </div>
          `).join('') || '<p>Không có dữ liệu thống kê</p>'}
        </div>

        <h2>2. Phân tích chi tiết</h2>
        <div class="analysis">
          ${report.analysis?.replace(/\n/g, '<br>') || 'Không có dữ liệu phân tích'}
        </div>

        ${report.charts && report.charts.length > 0 ? `
          <h2>3. Dữ liệu biểu đồ</h2>
          <table>
            <thead>
              <tr>
                <th>Danh mục</th>
                <th>Giá trị</th>
              </tr>
            </thead>
            <tbody>
              ${report.charts.map((item: any) => `
                <tr>
                  <td>${item.name || ''}</td>
                  <td style="text-align: right">${item.value || 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : ''}

        <div class="footer">
          <p>Báo cáo được tạo tự động bởi <strong>GOVAI</strong> - Trợ lý Công vụ Số</p>
          <p>${new Date().toLocaleString('vi-VN')}</p>
        </div>
      </body>
      </html>
    `;

    // Tạo và tải file Word
    const blob = new Blob(['\uFEFF' + htmlContent], { 
      type: 'application/msword;charset=utf-8' 
    });
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `Bao_cao_phan_tich_${dateStr}.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    triggerAlert('success', 'Đã tải xuống báo cáo dạng Word thành công');
  } catch (error: any) {
    console.error('Export to Word error:', error);
    triggerAlert('error', 'Không thể xuất báo cáo. Vui lòng thử lại.');
  }
};

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans" id="govai-app">
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col justify-between border-r border-slate-800 shrink-0" id="sidebar">
        <div>
          {/* Brand Logo */}
          <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white shadow-md">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-wider text-white">GOVAI</span>
              <p className="text-[10px] text-slate-400 font-medium tracking-widest uppercase">Trợ lý Công vụ Số</p>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="p-4 space-y-1" id="nav-container">
            <button
              id="nav-dashboard"
              onClick={() => { setActiveTab('dashboard'); setIsDraftMode(false); }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span>Trang tổng quan</span>
            </button>

            <button
              id="nav-digitize"
              onClick={() => { setActiveTab('digitize'); setIsDraftMode(false); }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'digitize' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3">
                <FileText className="w-5 h-5" />
                <span>Số hóa hồ sơ</span>
              </div>
              {documents.length > 0 && (
                <span className="text-[11px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded-full">
                  {documents.length}
                </span>
              )}
            </button>

            <button
              id="nav-assistant"
              onClick={() => { setActiveTab('assistant'); setIsDraftMode(false); }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'assistant' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Bot className="w-5 h-5" />
              <span>Trợ lý công vụ AI</span>
            </button>

            <button
              id="nav-report"
              onClick={() => { setActiveTab('report'); setIsDraftMode(false); }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'report' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              <span>Báo cáo thông minh</span>
            </button>

            <button
              id="nav-meeting"
              onClick={() => { setActiveTab('meeting'); setIsDraftMode(false); }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'meeting' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Mic className="w-5 h-5" />
              <span>Cuộc họp số</span>
            </button>

            <button
              id="nav-history"
              onClick={() => { setActiveTab('history'); setIsDraftMode(false); }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'history' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <History className="w-5 h-5" />
              <span>Lịch sử xử lý</span>
            </button>
          </nav>
        </div>

        {/* User Info & Settings Button */}
        <div className="p-4 border-t border-slate-800 bg-slate-950">
          <div className="flex items-center space-x-3 mb-3">
            <div className="bg-slate-800 p-2 rounded-full border border-slate-700">
              <User className="w-5 h-5 text-blue-400" />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{displayName}</p>
              <p className="text-[10px] text-slate-400 truncate">{agencyName}</p>
            </div>
          </div>
          <button
            id="nav-settings"
            onClick={() => { setActiveTab('settings'); setIsDraftMode(false); }}
            className={`w-full flex items-center space-x-2 px-3 py-2 rounded-md text-xs font-semibold transition-all ${
              activeTab === 'settings' ? 'bg-blue-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Cài đặt hệ thống</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" id="main-content-layout">
        {/* HEADER BAR */}
        <header className="bg-white h-16 border-b border-slate-200 px-6 flex items-center justify-between shrink-0 shadow-sm" id="header">
          {/* Left Title & Status */}
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">
              {activeTab === 'dashboard' && 'Bảng điều khiển thời gian thực'}
              {activeTab === 'digitize' && 'Số hóa & Phân loại Hồ sơ Hành chính'}
              {activeTab === 'assistant' && (isDraftMode ? 'Soạn thảo văn bản hành chính' : 'Trợ lý công vụ số AI')}
              {activeTab === 'report' && 'Phân tích số liệu & Báo cáo thông minh'}
              {activeTab === 'meeting' && 'Cuộc họp số & Biên bản tự động'}
              {activeTab === 'history' && 'Nhật ký & Lịch sử xử lý công việc'}
              {activeTab === 'settings' && 'Cấu hình và Phân quyền hệ thống'}
            </h1>
            <span className="h-4 w-px bg-slate-200"></span>
            <div className="flex items-center space-x-2">
              <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-rose-500'}`}></span>
              <span className="text-xs text-slate-500 font-semibold">{isOnline ? 'Hệ thống Sẵn sàng' : 'Mất kết nối'}</span>
            </div>
          </div>

          {/* Real-time Clock & Account Info */}
          <div className="flex items-center space-x-4">
            {/* Clock */}
            <div className="bg-slate-100 px-3 py-1.5 rounded-lg flex items-center space-x-2 border border-slate-200">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-mono font-bold text-slate-700">
                {currentTime.toLocaleTimeString('vi-VN')} | {currentTime.toLocaleDateString('vi-VN')}
              </span>
            </div>

            {/* API Key Alert Badge if missing */}
            {!apiKey && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center space-x-1 animate-bounce">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Chưa cấu hình API Key cá nhân</span>
              </div>
            )}
          </div>
        </header>

        {/* MAIN BODY AREA */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50" id="workspace">
          {/* Notification Toast Alert */}
          {alertMsg && (
            <div
              id="notification-toast"
              className={`mb-6 p-4 rounded-xl shadow-lg border flex items-center space-x-3 transition-all transform animate-slide-in ${
                alertMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                alertMsg.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
                'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              {alertMsg.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
              {alertMsg.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />}
              {alertMsg.type === 'info' && <RefreshCw className="w-5 h-5 text-blue-600 animate-spin shrink-0" />}
              <span className="text-sm font-semibold">{alertMsg.text}</span>
            </div>
          )}

          {/* ==================== 1. DASHBOARD VIEW ==================== */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6" id="view-dashboard">
              {/* Top Banner */}
              <div className="bg-gradient-to-r from-blue-700 via-indigo-800 to-slate-900 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 bottom-0 opacity-15 flex items-center pointer-events-none">
                  <Sparkles className="w-80 h-80 text-white" />
                </div>
                <div className="max-w-xl relative z-10">
                  <span className="bg-blue-500 text-xs uppercase font-extrabold px-3 py-1 rounded-full tracking-wider">Phiên bản Quốc gia Số</span>
                  <h2 className="text-3xl font-extrabold mt-3 tracking-tight">Kính chào {displayName}</h2>
                  <p className="mt-2 text-slate-200 text-sm leading-relaxed">
                    Chào mừng bạn đến với <strong>GOVAI</strong> - nền tảng trợ lý số thông minh tối ưu riêng cho môi trường nghiệp vụ hành chính công. Hãy bắt đầu số hóa tài liệu hoặc soạn thảo tờ trình mới ngay hôm nay.
                  </p>
                  <div className="mt-6 flex space-x-3">
                    <button
                      onClick={() => { setActiveTab('digitize'); setIsDraftMode(false); }}
                      className="bg-white text-blue-900 font-bold px-5 py-2.5 rounded-lg text-sm hover:bg-slate-100 transition shadow-lg"
                    >
                      Số hóa văn bản ngay
                    </button>
                    <button
                      onClick={() => { setActiveTab('assistant'); setIsDraftMode(true); }}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition shadow-lg flex items-center space-x-1.5"
                    >
                      <Bot className="w-4 h-4" />
                      <span>Soạn thảo văn bản</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Statistical Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6" id="dashboard-statistics">
                {/* Card 1 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hồ sơ số hóa</p>
                    <h3 className="text-3xl font-black text-slate-800 mt-2">{totalDocsDigitized}</h3>
                    <p className="text-[11px] text-slate-400 mt-1">Đã lập chỉ mục nội dung</p>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-xl text-blue-600">
                    <FileText className="w-7 h-7" />
                  </div>
                </div>

                {/* Card 2 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hỏi đáp & Soạn thảo</p>
                    <h3 className="text-3xl font-black text-slate-800 mt-2">{totalAiUsage}</h3>
                    <p className="text-[11px] text-slate-400 mt-1">Tác vụ AI đã thực hiện</p>
                  </div>
                  <div className="bg-indigo-50 p-4 rounded-xl text-indigo-600">
                    <Bot className="w-7 h-7" />
                  </div>
                </div>

                {/* Card 3 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Báo cáo số liệu</p>
                    <h3 className="text-3xl font-black text-slate-800 mt-2">{totalReportsCreated}</h3>
                    <p className="text-[11px] text-slate-400 mt-1">Bảng Excel đã phân tích</p>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded-xl text-emerald-600">
                    <BarChart3 className="w-7 h-7" />
                  </div>
                </div>

                {/* Card 4 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Biên bản cuộc họp</p>
                    <h3 className="text-3xl font-black text-slate-800 mt-2">{totalMeetingsProcessed}</h3>
                    <p className="text-[11px] text-slate-400 mt-1">Tệp ghi âm số hóa</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-xl text-purple-600">
                    <Mic className="w-7 h-7" />
                  </div>
                </div>
              </div>

              {/* Visualizations & Recent Documents */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Graph (Excel statistics example if available, otherwise mock-visual with live structure) */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h4 className="font-bold text-slate-800">Thống kê mật độ xử lý công vụ</h4>
                      <p className="text-xs text-slate-400">Tần suất làm việc qua các phân hệ</p>
                    </div>
                    <span className="text-[11px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-bold">Tháng này</span>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: 'Số hóa', count: totalDocsDigitized * 2 + 1 },
                          { name: 'Hỏi đáp AI', count: totalAiUsage },
                          { name: 'Báo cáo', count: totalReportsCreated * 3 },
                          { name: 'Cuộc họp', count: totalMeetingsProcessed * 4 },
                          { name: 'Lịch sử', count: totalDocsDigitized + totalReportsCreated + totalMeetingsProcessed }
                        ]}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={45} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Right Area: Recent Document List */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-bold text-slate-800">Hồ sơ số hóa gần đây</h4>
                      <button onClick={() => { setActiveTab('digitize'); setIsDraftMode(false); }} className="text-xs text-blue-600 font-bold hover:underline">
                        Tất cả
                      </button>
                    </div>

                    <div className="space-y-3">
                      {documents.slice(0, 4).map((doc, idx) => (
                        <div
                          key={doc.id || idx}
                          onClick={() => { setSelectedDoc(doc); setActiveTab('digitize'); }}
                          className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-blue-50 cursor-pointer transition-all"
                        >
                          <div className="flex items-center space-x-3 overflow-hidden">
                            <div className="bg-blue-100 p-2 rounded-lg text-blue-700 shrink-0">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div className="overflow-hidden">
                              <p className="text-xs font-bold text-slate-800 truncate">{doc.originalName}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{doc.metadata.docNumber} • {doc.metadata.docType}</p>
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(doc.digitizedAt).toLocaleDateString('vi-VN')}
                          </span>
                        </div>
                      ))}

                      {documents.length === 0 && (
                        <div className="text-center py-8">
                          <p className="text-xs text-slate-400">Chưa có tài liệu nào được số hóa.</p>
                          <button
                            onClick={() => { setActiveTab('digitize'); setIsDraftMode(false); }}
                            className="mt-3 text-xs font-bold text-blue-600 border border-blue-200 bg-blue-50/50 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition"
                          >
                            Số hóa ngay
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* System Summary Footer */}
                  <div className="border-t border-slate-100 pt-4 mt-4 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Đồng bộ hóa: Toàn cục Local</span>
                    <span>Hệ cơ sở: SQLite JSON</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== 2. MODULE 1: DIGITIZE VIEW ==================== */}
          {activeTab === 'digitize' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="view-digitize">
              {/* Left Column: Upload and Document Catalog */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col h-[calc(100vh-10.5rem)]">
                {/* Drag and Drop Upload Area */}
                <div className="mb-6">
                  <h3 className="font-bold text-slate-800 mb-3">Tải lên văn bản & hồ sơ mới</h3>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl px-4 py-8 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-400 cursor-pointer transition-all">
                    <div className="text-center">
                      <div className="bg-blue-100 p-3 rounded-full text-blue-600 inline-block mb-3 shadow-sm">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-bold text-slate-700">Kéo thả tệp hoặc click để chọn tệp</p>
                      <p className="text-[10px] text-slate-400 mt-1">Hỗ trợ PDF, DOCX, JPG, PNG (Tối đa 15MB)</p>
                    </div>
                    <input
                      type="file"
                      accept=".pdf,.docx,.jpg,.jpeg,.png,.txt"
                      onChange={handleDigitizeUpload}
                      className="hidden"
                      disabled={isDigitizing}
                    />
                  </label>
                  {isDigitizing && (
                    <div className="mt-3 flex items-center space-x-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-lg">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                      <span className="font-semibold">Đang đọc OCR và trích xuất siêu dữ liệu qua Gemini AI...</span>
                    </div>
                  )}
                </div>

                <hr className="border-slate-100 mb-4" />

                {/* Filter and Search */}
                <div className="space-y-3 mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Tìm kiếm số hiệu, người ký, trích yếu..."
                      value={digitizeSearch}
                      onChange={(e) => setDigitizeSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
                    />
                  </div>

                  {/* Doc Type Filters */}
                  <div className="flex flex-wrap gap-1.5" id="doc-type-filters">
                    {['All', 'Quyết định', 'Thông báo', 'Công văn', 'Tờ trình', 'Kế hoạch', 'Khác'].map(type => (
                      <button
                        key={type}
                        onClick={() => setDigitizeDocTypeFilter(type)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition ${
                          digitizeDocTypeFilter === type
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {type === 'All' ? 'Tất cả' : type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Document Catalog list */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1" id="document-catalog-list">
                  {filteredDocs.map(doc => (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all relative group ${
                        selectedDoc?.id === doc.id
                          ? 'border-blue-500 bg-blue-50/50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div className={`p-2.5 rounded-xl shrink-0 ${
                            selectedDoc?.id === doc.id
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            <FileText className="w-5 h-5" />
                          </div>

                          <div className="overflow-hidden">
                            <span className="text-[10px] font-extrabold uppercase bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md tracking-wider">
                              {doc.metadata.docType}
                            </span>

                            <p className="text-xs font-bold text-slate-800 mt-1 truncate">
                              {doc.originalName}
                            </p>

                            <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                              Số: {doc.metadata.docNumber} • Ban hành: {doc.metadata.issueDate}
                            </p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Download */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadDoc(doc);
                            }}
                            className="text-slate-400 hover:text-blue-600 p-1 rounded-lg hover:bg-slate-100"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={(e) => handleDeleteDoc(doc.id, e)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-slate-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {filteredDocs.length === 0 && (
                    <div className="text-center py-12 text-slate-400 text-xs">
                      Không tìm thấy văn bản phù hợp.
                    </div>
                  )}
                </div>
                </div>

              {/* Right Column: Digitized Document Detail Viewer */}
              <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col h-[calc(100vh-10.5rem)]">
                {selectedDoc ? (
                  <div className="flex flex-col h-full overflow-hidden" id="digitized-document-detail">
                    {/* Header */}
                    <div className="border-b border-slate-100 pb-4 mb-4 flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="bg-blue-100 text-blue-800 text-xs font-extrabold px-3 py-1 rounded-full uppercase">
                            {selectedDoc.metadata.docType}
                          </span>
                          <span className="text-xs text-slate-400 font-medium">Số hóa lúc: {new Date(selectedDoc.digitizedAt).toLocaleString('vi-VN')}</span>
                        </div>
                        <h2 className="text-base font-black text-slate-800 mt-2 leading-snug">{selectedDoc.originalName}</h2>
                      </div>

                      {/* Action buttons */}
                      <button
                        onClick={() => {
                          setChatDocContextId(selectedDoc.id);
                          setActiveTab('assistant');
                          setIsDraftMode(false);
                          triggerAlert('info', `Đã đính kèm văn bản "${selectedDoc.metadata.docNumber}" vào Trợ lý công vụ AI`);
                        }}
                        className="bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 text-xs font-bold px-4 py-2 rounded-lg transition-all flex items-center space-x-1"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Hỏi AI về văn bản này</span>
                      </button>
                    </div>

                    {/* Metadata summary (Bento card grid) */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Số ký hiệu</span>
                        <span className="text-xs font-black text-slate-800 mt-0.5 block truncate">{selectedDoc.metadata.docNumber}</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ngày ban hành</span>
                        <span className="text-xs font-black text-slate-800 mt-0.5 block truncate">{selectedDoc.metadata.issueDate}</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Người ký duyệt</span>
                        <span className="text-xs font-black text-slate-800 mt-0.5 block truncate">{selectedDoc.metadata.signer}</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cơ quan ban hành</span>
                        <span className="text-xs font-black text-slate-800 mt-0.5 block truncate">{selectedDoc.metadata.issuer}</span>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Kích thước tệp</span>
                        <span className="text-xs font-black text-slate-800 mt-0.5 block truncate">{(selectedDoc.fileSize / 1024).toFixed(1)} KB</span>
                      </div>
                    </div>

                    {/* Trích yếu tóm tắt */}
                    <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl mb-4">
                      <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider block mb-1">Trích yếu nội dung văn bản</span>
                      <p className="text-xs text-blue-900 leading-relaxed font-medium">{selectedDoc.metadata.summary}</p>
                    </div>

                    {/* Full text viewer */}
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Toàn văn số hóa OCR</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedDoc.extractedText);
                            triggerAlert('success', 'Đã sao chép toàn văn số hóa vào bộ nhớ đệm');
                          }}
                          className="text-slate-400 hover:text-slate-700 p-1.5 hover:bg-slate-100 rounded-lg transition"
                          title="Sao chép toàn văn"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex-1 bg-slate-900 text-slate-100 p-4 rounded-xl overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap select-text selection:bg-blue-600">
                        {selectedDoc.extractedText}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-8">
                    <FileText className="w-16 h-16 text-slate-200 mb-4 stroke-1" />
                    <h3 className="font-bold text-slate-600 mb-1">Chi tiết văn bản số hóa</h3>
                    <p className="text-xs max-w-sm leading-relaxed">Chọn một tài liệu trong danh sách bên trái hoặc tải lên văn bản mới để trích xuất OCR, tóm tắt và thực hiện các tác vụ hỗ trợ tự động bằng AI.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== 3. MODULE 2: AI ASSISTANT VIEW ==================== */}
          {activeTab === 'assistant' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="view-assistant">
              {/* Left sidebar: Assistant Modes & Chat Sessions */}
              <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col h-[calc(100vh-10.5rem)]">
                {/* Mode Selector Tab inside column */}
                <div className="space-y-4 flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-800">Phiên hội thoại AI</h3>
                    <button
                      onClick={handleNewChatSession}
                      className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 p-1.5 rounded-lg transition flex items-center space-x-1 text-xs font-bold"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Hội thoại mới</span>
                    </button>
                  </div>

                  {/* Document Context Attachment */}
                  <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-2">
                    <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Đính kèm ngữ cảnh văn bản</label>
                    <select
                      value={chatDocContextId}
                      onChange={(e) => {
                        setChatDocContextId(e.target.value);
                        if (e.target.value) {
                          const doc = documents.find(d => d.id === e.target.value);
                          if (doc) triggerAlert('info', `Đã kích hoạt chế độ Hỏi đáp văn bản: ${doc.metadata.docNumber}`);
                        }
                      }}
                      className="w-full text-xs font-bold bg-white border border-slate-200 rounded-lg p-2 outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">-- Trò chuyện tự do (Không đính kèm) --</option>
                      {documents.map(doc => (
                        <option key={doc.id} value={doc.id}>
                          [{doc.metadata.docType}] {doc.metadata.docNumber} - {doc.originalName}
                        </option>
                      ))}
                    </select>
                    {chatDocContextId && (
                      <div className="text-[10px] text-blue-700 font-semibold bg-blue-50 border border-blue-100 p-2 rounded-md">
                        💡 Trợ lý sẽ căn cứ trực tiếp vào nội dung tệp đính kèm này để giải thích, tóm tắt và thực hiện các câu lệnh của bạn.
                      </div>
                    )}
                  </div>

                  <hr className="border-slate-100" />

                  {/* Session Catalog List */}
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1" id="chat-session-list">
                    <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2">
                      Hộp hội thoại gần đây
                    </span>

                    {chatSessions.length === 0 ? (
                      <p className="text-[11px] text-slate-400 text-center py-6">
                        Chưa có cuộc trò chuyện nào trước đó.
                      </p>
                    ) : (
                      chatSessions.map((session) => {
                        const isActive = activeSessionId === session.id;
                        
                        return (
                          <div
                            key={session.id}
                            onClick={() => {
                              setActiveSessionId(session.id);
                              if (session.documentId) setChatDocContextId(session.documentId);
                              setIsDraftMode(false);
                            }}
                            className={`group p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                              isActive
                                ? 'border-blue-500 bg-blue-50/50 font-bold text-blue-900'
                                : 'border-slate-100 bg-slate-50 hover:bg-slate-100 text-slate-700'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex items-center space-x-2 truncate flex-1">
                                <Bot className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span className="truncate">
                                  {session.title || 'Hội thoại hành chính'}
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteSession(session.id);
                                }}
                                title="Xóa hội thoại"
                                className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-red-100"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                              </button>
                            </div>
                            <span className="text-[9px] text-slate-400 block mt-1 font-mono">
                              Cập nhật: {new Date(session.updatedAt || Date.now()).toLocaleString('vi-VN')}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
              </div>
                {/* Sub-tab link to Draft Writer */}
                <div className="border-t border-slate-100 pt-4 mt-4">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-3 rounded-xl">
                    <h5 className="text-xs font-extrabold text-blue-800 flex items-center space-x-1">
                      <Sparkles className="w-4 h-4" />
                      <span>Trình Soạn Văn Bản Hành Chính</span>
                    </h5>
                    <p className="text-[11px] text-blue-900/80 mt-1 leading-relaxed">Sử dụng mô tả tự nhiên để AI soạn thảo Quyết định, Công văn chuẩn thể thức Nghị định 30/2020/NĐ-CP.</p>
                    <button
                      onClick={() => {
                        setIsDraftMode(true);
                        setGeneratedDraft('');
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-1.5 rounded-lg mt-2.5 transition"
                    >
                      Bắt đầu soạn thảo
                    </button>
                  </div>
                </div>
              </div>

              {/* Right area: Conversational Chat Interface & Draft Generator */}
              <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[calc(100vh-10.5rem)] overflow-hidden">
                {/* Dynamic Inner Tab: Chat AI vs Soạn thảo */}
                <div className="border-b border-slate-200 bg-slate-50/50 px-6 py-3 flex items-center justify-between shrink-0">
                  <div className="flex space-x-4">
                    <button
                      onClick={() => { setIsDraftMode(false); setGeneratedDraft(''); }}
                      className={`text-sm font-bold pb-1.5 border-b-2 transition ${
                        !isDraftMode ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Trò chuyện & Hỏi đáp tài liệu
                    </button>

                    <button
                      onClick={() => { setIsDraftMode(true); setGeneratedDraft(''); }}
                      className={`text-sm font-bold pb-1.5 border-b-2 transition ${
                        isDraftMode ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <Sparkles className="w-4 h-4 inline mr-1" />
                      Soạn thảo văn bản
                    </button>                    
                  </div>

                  {/* Indicator info */}
                  <span className="text-[11px] bg-blue-50 border border-blue-100 text-blue-700 font-bold px-2.5 py-0.5 rounded-full">
                    Mô hình: gemini-3.5-flash
                  </span>
                </div>

                {/* --- CHAT INTERFACE SUB-VIEW --- */}
                {!isDraftMode ? (
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4" id="chat-messages-scroll">
                      {activeSession.messages.map((msg: any, idx: number) => (
                        <div
                          key={idx}
                          className={`flex items-start space-x-3 max-w-4xl ${
                            msg.role === 'user' ? 'ml-auto flex-row-reverse space-x-reverse' : 'mr-auto'
                          }`}
                        >
                          {/* Avatar icon */}
                          <div className={`p-2 rounded-full shrink-0 shadow-sm ${
                            msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                          </div>

                          {/* Chat bubble body */}
                          <div className="space-y-1.5">
                            <span className="text-[10px] text-slate-400 block font-semibold px-1">
                              {msg.role === 'user' ? displayName : 'Trợ lý GOVAI'}
                            </span>
                            <div className={`p-4 rounded-2xl text-xs leading-relaxed font-medium whitespace-pre-wrap ${
                              msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-100'
                                : 'bg-slate-100 text-slate-800 border border-slate-200 rounded-tl-none select-text'
                            }`}>
                              {msg.content}
                            </div>
                          </div>
                        </div>
                      ))}

                      {activeSession.messages.length === 0 && (
                        <div className="text-center py-16 text-slate-400">
                          <Bot className="w-16 h-16 mx-auto text-slate-200 mb-4 stroke-1" />
                          <h4 className="font-bold text-slate-700 mb-1">Giao diện Trò chuyện Hành chính</h4>
                          <p className="text-xs max-w-md mx-auto leading-relaxed">
                            Chào mừng bạn đến với kênh trò chuyện an toàn. Đính kèm một tài liệu đã số hóa và đưa ra các câu hỏi chuyên sâu, hoặc hỏi đáp quy trình nghiệp vụ chung.
                          </p>

                          {/* Quick Suggestion Prompts */}
                          <div className="grid grid-cols-2 gap-3 mt-8 max-w-lg mx-auto">
                            {[
                              'Tóm tắt tóm lược nội dung chính tệp đính kèm này',
                              'Hỏi: Ai ký văn bản, ký vào ngày nào, có nội dung gì?',
                              'Làm cách nào để trình duyệt và xin ý kiến lãnh đạo quyết định?',
                              'Soạn giúp tôi một công văn thông báo cho cấp dưới'
                            ].map((prompt, pIdx) => (
                              <button
                                key={pIdx}
                                onClick={() => { setChatInput(prompt); }}
                                className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-[11px] font-semibold text-slate-600 text-left hover:bg-blue-50/50 hover:border-blue-200 transition"
                              >
                                {prompt}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {isSendingChat && (
                        <div className="flex items-center space-x-2 text-xs text-slate-400 italic">
                          <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                          <span>Trợ lý AI đang tư duy và phản hồi...</span>
                        </div>
                      )}
                    </div>

                    {/* Chat Input Bar */}
                    <div className="p-4 border-t border-slate-200 bg-slate-50/50 shrink-0">
                      <div className="flex items-center space-x-3">
                        <input
                          type="text"
                          placeholder={chatDocContextId ? "Đặt câu hỏi về tệp đính kèm..." : "Hỏi trợ lý GOVAI về quy trình, soạn thảo..."}
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleSendChat(); }}
                          className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-semibold outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition shadow-inner"
                        />
                        <button
                          onClick={handleSendChat}
                          disabled={isSendingChat || !chatInput.trim()}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-5 py-3 rounded-xl transition shadow-md flex items-center space-x-1"
                        >
                          <Send className="w-4 h-4" />
                          <span className="text-xs font-bold">Gửi</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* --- SOẠN THẢO VĂN BẢN HÀNH CHÍNH SUB-VIEW --- */
                  <div className="flex-1 flex flex-col md:flex-row min-h-0">
                    {/* Left Form: Parameters input */}
                    <div className="w-full md:w-80 border-r border-slate-200 p-5 overflow-y-auto space-y-4 shrink-0">
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Thông số dự thảo văn bản</h4>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loại văn bản soạn thảo</label>
                        <select
                          value={draftDocType}
                          onChange={(e) => setDraftDocType(e.target.value)}
                          className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 bg-slate-50 outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="Quyết định">Quyết định (Hội đồng, Khen thưởng, v.v.)</option>
                          <option value="Thông báo">Thông báo (Nghỉ lễ, Họp đột xuất, v.v.)</option>
                          <option value="Công văn">Công văn (Đề nghị, Phản hồi, Giải trình)</option>
                          <option value="Tờ trình">Tờ trình (Xin chủ trương, Nhân sự, v.v.)</option>
                          <option value="Kế hoạch">Kế hoạch (Công tác tháng, Triển khai dự án)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Văn phong / Giọng điệu</label>
                        <select
                          value={draftTone}
                          onChange={(e) => setDraftTone(e.target.value)}
                          className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 bg-slate-50 outline-none"
                        >
                          <option value="Trang trọng, chuẩn công vụ">Trang trọng, chuẩn hành chính</option>
                          <option value="Chi tiết, chặt chẽ">Chi tiết, chặt chẽ (Pháp lý)</option>
                          <option value="Ngắn gọn, dễ hiểu">Ngắn gọn, quyết liệt</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mô tả nội dung yêu cầu</label>
                        <textarea
                          placeholder="Ví dụ: Soạn quyết định thành lập hội đồng kiểm nghiệm nghiệm thu dự án số hóa hồ sơ giai đoạn 1 năm 2026. Hội đồng gồm 5 thành viên, Chủ tịch là ông Nguyễn Văn A."
                          rows={4}
                          value={draftPrompt}
                          onChange={(e) => setDraftPrompt(e.target.value)}
                          className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-2 bg-slate-50 outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Căn cứ / Ghi chú bổ sung (nếu có)</label>
                        <textarea
                          placeholder="Ví dụ: Căn cứ Luật tổ chức chính quyền địa phương 2015, Nghị định 30/2020/NĐ-CP về thể thức văn bản."
                          rows={3}
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                          className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-2 bg-slate-50 outline-none"
                        />
                      </div>

                      <button
                        onClick={handleGenerateDraft}
                        disabled={isGeneratingDraft || !draftPrompt}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white py-2.5 rounded-lg text-xs font-bold transition shadow-md flex items-center justify-center space-x-1.5"
                      >
                        {isGeneratingDraft ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Đang sinh văn bản...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4" />
                            <span>Sinh dự thảo văn bản</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Right Area: Generated text preview with Copy and Download buttons */}
                    <div className="flex-1 p-5 overflow-y-auto flex flex-col justify-between h-full bg-slate-50/50">
                      {generatedDraft ? (
                        <div className="flex flex-col h-full overflow-hidden">
                          {/* Title and Copy / Download panel */}
                          <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2 shrink-0">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Xem trước dự thảo văn bản hành chính</span>
                            <div className="flex space-x-2">
                              {/* Copy Button */}
                              <button
                                onClick={copyDraftToClipboard}
                                className="bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center space-x-1"
                              >
                                {draftCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                                <span>{draftCopied ? 'Đã sao chép' : 'Sao chép'}</span>
                              </button>
                              {/* Download Word Button */}
                              <button
                                onClick={handleExportDraft}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center space-x-1 shadow-sm"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                                <span>Tải Word</span>
                              </button>
                            </div>
                          </div>

                          {/* Preview container */}
                          <div className="flex-1 bg-white border border-slate-200 rounded-xl p-6 overflow-y-auto shadow-inner select-text selection:bg-blue-200 font-serif text-sm leading-relaxed whitespace-pre-wrap max-w-3xl mx-auto w-full">
                            {generatedDraft}
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center">
                          <FileCode className="w-16 h-16 text-slate-200 mb-4 stroke-1" />
                          <h4 className="font-bold text-slate-600 mb-1">Dự thảo văn bản trống</h4>
                          <p className="text-xs max-w-sm leading-relaxed">
                            Vui lòng nhập các thông tin yêu cầu ở biểu mẫu bên trái, sau đó click "Sinh dự thảo văn bản". Trí tuệ nhân tạo sẽ tạo ra văn bản đầy đủ Quốc hiệu, căn cứ pháp lý, thể thức chuẩn để chỉnh sửa và tải về.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== 4. MODULE 3: REPORT VIEW ==================== */}
          {activeTab === 'report' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="view-report">
              {/* Left sidebar: Reports list */}
              <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col h-[calc(100vh-10.5rem)]">
                <div>
                  <h3 className="font-bold text-slate-800 mb-3">Tải lên dữ liệu thống kê</h3>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-6 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-400 cursor-pointer transition-all">
                    <div className="text-center">
                      <div className="bg-emerald-100 p-3 rounded-full text-emerald-600 inline-block mb-2 shadow-sm">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-bold text-slate-700">Tải tệp số liệu Excel (.xlsx, .xls)</p>
                      <p className="text-[10px] text-slate-400 mt-1">Hệ thống sẽ vẽ biểu đồ và phân tích nhận xét</p>
                    </div>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleReportUpload}
                      className="hidden"
                      disabled={isAnalyzingReport}
                    />
                  </label>

                  {isAnalyzingReport && (
                    <div className="mt-3 flex items-center space-x-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg">
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                      <span className="font-semibold">Đang xử lý biểu đồ và nhận xét báo cáo Excel...</span>
                    </div>
                  )}
                </div>

                <hr className="border-slate-100 my-4" />

                {/* Report history */}
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2">Báo cáo dữ liệu đã lập</span>
                  {reports.map(rep => (
                    <div
                      key={rep.id}
                      onClick={() => setSelectedReportId(rep.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all relative group ${
                        selectedReportId === rep.id
                          ? 'border-emerald-500 bg-emerald-50/50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3 overflow-hidden flex-1">
                          <div className={`p-2 rounded-lg shrink-0 ${
                            selectedReportId === rep.id ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            <FileSpreadsheet className="w-4 h-4" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-xs font-bold text-slate-800 truncate">{rep.originalName}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{rep.uploadedAt ? new Date(rep.uploadedAt).toLocaleDateString('vi-VN') : ''} • {rep.sheetNames?.length || 1} Trang tính</p>
                          </div>
                        </div>

                        {/* Action buttons group */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Download button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadReport(rep.id);
                            }}
                            className="text-slate-400 hover:text-blue-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Tải xuống file Excel"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete button */}
                          <button
                            onClick={(e) => handleDeleteReport(rep.id, e)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                            title="Xóa báo cáo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {reports.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-8">Chưa có bảng số liệu phân tích nào.</p>
                  )}
                </div>
              </div>

              {/* Right area: Dashboard and detailed insights */}
              <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col h-[calc(100vh-10.5rem)] overflow-y-auto">
                {currentReport ? (
                  <div className="space-y-6" id="report-details-panel">
                    {/* Header with actions */}
                    <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-3 py-1 rounded-full uppercase">Báo cáo phân tích số liệu tự động</span>
                        <h2 className="text-base font-black text-slate-800 mt-2">{currentReport.originalName}</h2>
                      </div>
                    </div>

                    {/* Metrics Dashboard */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {currentReport.metrics?.map((metric: any, mIdx: number) => (
                        <div key={mIdx} className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{metric.title}</span>
                          <div className="flex items-baseline space-x-2 mt-2">
                            <span className="text-2xl font-black text-slate-800">{metric.value}</span>
                            {metric.change && (
                              <span className={`text-[10px] font-extrabold ${
                                metric.change.startsWith('+') ? 'text-emerald-600' : 'text-rose-600'
                              }`}>{metric.change}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Interactive Chart from Excel */}
                    {currentReport.charts && currentReport.charts.length > 0 && (
                      <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
                        <h4 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-4">Biểu đồ cơ cấu số liệu</h4>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart
                              data={currentReport.charts}
                              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
                              <Tooltip />
                              <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}

                    {/* Narrative generated analysis with copy button */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nhận xét & Phân tích chuyên sâu (Bởi Gemini AI)</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (currentReport.analysis) {
                                navigator.clipboard.writeText(currentReport.analysis);
                                triggerAlert('success', 'Đã sao chép nội dung phân tích');
                              }
                            }}
                            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-2.5 py-1 rounded-lg transition flex items-center space-x-1"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Sao chép</span>
                          </button>
                          <button
                            onClick={() => handleExportReportToWord(currentReport)}
                            className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold px-2.5 py-1 rounded-lg transition flex items-center space-x-1"
                          >
                            <FileDown className="w-3 h-3" />
                            <span>Tải Word</span>
                          </button>
                        </div>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 text-xs text-slate-700 leading-relaxed font-semibold whitespace-pre-wrap select-text selection:bg-emerald-100">
                        {currentReport.analysis}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-8">
                    <BarChart3 className="w-16 h-16 text-slate-200 mb-4 stroke-1" />
                    <h3 className="font-bold text-slate-600 mb-1">Kết quả báo cáo thông minh</h3>
                    <p className="text-xs max-w-sm leading-relaxed">Chọn một tệp bảng tính đã phân tích ở danh sách bên trái hoặc tải lên tệp số liệu Excel hành chính mới để tự động xuất biểu đồ và nhận xét xu hướng báo cáo.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== 5. MODULE 4: MEETING VIEW ==================== */}
{activeTab === 'meeting' && (
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="view-meeting">
    {/* Left sidebar: Audio upload and meetings list */}
    <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col h-[calc(100vh-10.5rem)]">
      <div>
        <h3 className="font-bold text-slate-800 mb-3">Tải lên ghi âm cuộc họp</h3>
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-6 bg-slate-50/50 hover:bg-blue-50/50 hover:border-blue-400 cursor-pointer transition-all">
          <div className="text-center">
            <div className="bg-purple-100 p-3 rounded-full text-purple-600 inline-block mb-2 shadow-sm">
              <Mic className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-700">Tải lên tệp âm thanh ghi âm (.mp3, .wav)</p>
            <p className="text-[10px] text-slate-400 mt-1">Trợ lý AI sẽ chuyển giọng nói thành văn bản & sinh biên bản họp</p>
          </div>
          <input
            type="file"
            accept="audio/*"
            onChange={handleMeetingUpload}
            className="hidden"
            disabled={isTranscribing}
          />
        </label>

        {isTranscribing && (
          <div className="mt-3 flex items-center space-x-2 text-xs text-purple-700 bg-purple-50 border border-purple-200 px-3 py-2 rounded-lg">
            <RefreshCw className="w-4 h-4 animate-spin text-purple-600" />
            <span className="font-semibold">Đang nhận diện giọng nói tiếng Việt và xây dựng biên bản...</span>
          </div>
        )}
      </div>

      <hr className="border-slate-100 my-4" />

      {/* Meetings list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-2">Biên bản cuộc họp đã xử lý</span>
        {meetings.map(meet => {
          // Giải mã tên file hiển thị đúng tiếng Việt
          const displayName = (() => {
            try {
              return decodeURIComponent(meet.originalName);
            } catch {
              return meet.originalName;
            }
          })();

          return (
            <div
              key={meet.id}
              onClick={() => setSelectedMeetingId(meet.id)}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all relative group ${
                selectedMeetingId === meet.id
                  ? 'border-purple-500 bg-purple-50/50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className={`p-2 rounded-lg shrink-0 ${
                    selectedMeetingId === meet.id ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Mic className="w-4 h-4" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-800 truncate">{displayName}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{new Date(meet.uploadedAt).toLocaleDateString('vi-VN')} • {meet.speakers?.length || 2} Người phát biểu</p>
                  </div>
                </div>

                {/* Delete meeting button */}
                <button
                  onClick={(e) => handleDeleteMeeting(meet.id, e)}
                  className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {meetings.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-8">Chưa có cuộc họp số nào được lưu trữ.</p>
        )}
      </div>
    </div>

    {/* Right area: Transcripts and Editable Minutes */}
    <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col h-[calc(100vh-10.5rem)] overflow-y-auto">
      {currentMeeting ? (
        <div className="space-y-6" id="meeting-details-panel">
          {/* Header */}
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] bg-purple-100 text-purple-800 font-extrabold px-3 py-1 rounded-full uppercase">Số hóa biên bản từ ghi âm</span>
              <h2 className="text-base font-black text-slate-800 mt-2">
                {(() => {
                  try {
                    return decodeURIComponent(currentMeeting.originalName);
                  } catch {
                    return currentMeeting.originalName;
                  }
                })()}
              </h2>
            </div>
          </div>

          {/* Real Audio Player - Phát file thật từ server */}
          {currentMeeting.audioFileName ? (
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
              <div className="flex items-center space-x-3 mb-3">
                <div className="bg-purple-100 p-2.5 rounded-full text-purple-600">
                  <Mic className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">Phát lại ghi âm cuộc họp</p>
                  <p className="text-xs text-slate-500">
                    {(() => {
                      try {
                        return decodeURIComponent(currentMeeting.originalName);
                      } catch {
                        return currentMeeting.originalName;
                      }
                    })()}
                  </p>
                </div>
              </div>
              <audio 
                controls 
                className="w-full h-12 rounded-lg"
                onPlay={() => setIsPlayingAudio(true)}
                onPause={() => setIsPlayingAudio(false)}
                onEnded={() => setIsPlayingAudio(false)}
              >
                <source 
                  src={`/api/meeting/audio/${currentMeeting.audioFileName}`} 
                  type="audio/mpeg" 
                />
                Trình duyệt của bạn không hỗ trợ phát audio.
              </audio>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                  <Mic className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-800">Không có file ghi âm</p>
                  <p className="text-xs text-amber-600">File audio không có sẵn để phát lại</p>
                </div>
              </div>
            </div>
          )}

          {/* Summary & Speakers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">Chủ thể tham gia họp</span>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {currentMeeting.speakers?.map((sp: string, sIdx: number) => (
                  <span key={sIdx} className="bg-purple-100 text-purple-800 text-[11px] font-bold px-2.5 py-1 rounded-full">
                    {sp}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
              <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">Tóm tắt ngắn gọn</span>
              <p className="text-xs text-slate-700 leading-relaxed font-semibold mt-1">{currentMeeting.summary}</p>
            </div>
          </div>

          {/* Action Items List */}
          {currentMeeting.actionItems && currentMeeting.actionItems.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Danh sách kết luận & Chỉ đạo phân công việc</span>
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                      <th className="p-3">Nhiệm vụ chỉ đạo</th>
                      <th className="p-3">Người chịu trách nhiệm</th>
                      <th className="p-3 text-right">Thời hạn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentMeeting.actionItems.map((item: any, iIdx: number) => (
                      <tr key={iIdx} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50 bg-white">
                        <td className="p-3 font-semibold text-slate-800">{item.task}</td>
                        <td className="p-3 font-bold text-purple-700">{item.assignee}</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-500">{item.deadline}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Twin Panel: Transcript vs Official Minutes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Transcript */}
            <div className="space-y-2 flex flex-col h-[28rem]">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nội dung ghi âm thô (Speech To Text)</span>
              <div className="flex-1 bg-slate-50 border border-slate-100 p-4 rounded-xl overflow-y-auto text-xs text-slate-700 font-semibold leading-relaxed whitespace-pre-wrap select-text">
                {currentMeeting.transcript}
              </div>
            </div>

            {/* Official Minutes template */}
            <div className="space-y-2 flex flex-col h-[28rem]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dự thảo Biên bản cuộc họp chuẩn</span>
                <div className="flex items-center space-x-2">
                  {/* Copy button */}
                  <button
                    onClick={() => copyToClipboard(currentMeeting.minutes, setMinutesCopied)}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-2.5 py-1 rounded-lg transition flex items-center space-x-1"
                  >
                    {minutesCopied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{minutesCopied ? 'Đã sao chép' : 'Sao chép'}</span>
                  </button>
                  
                  {/* Download Word button */}
                  <button
                    onClick={() => downloadWordFile(currentMeeting.minutes)}
                    className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold px-2.5 py-1 rounded-lg transition flex items-center space-x-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải Word</span>
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-white border border-slate-200 p-4 rounded-xl overflow-y-auto text-xs text-slate-800 font-serif leading-relaxed whitespace-pre-wrap select-text shadow-inner">
                {currentMeeting.minutes}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-8">
          <Mic className="w-16 h-16 text-slate-200 mb-4 stroke-1" />
          <h3 className="font-bold text-slate-600 mb-1">Kết quả cuộc họp số</h3>
          <p className="text-xs max-w-sm leading-relaxed">Chọn một bản cuộc họp số đã ghi âm ở danh sách bên trái hoặc tải lên file âm thanh mới để chuyển chữ, trích chỉ đạo nhiệm vụ hành chính và tạo biên bản chuẩn công sở.</p>
        </div>
      )}
    </div>
  </div>
)}

          {/* ==================== 6. HISTORY VIEW ==================== */}
          {activeTab === 'history' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6" id="view-history">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-bold text-slate-800">Nhật ký xử lý hệ thống</h3>
                  <p className="text-xs text-slate-400">Danh sách tổng hợp các tài liệu, cuộc họp và báo cáo số liệu đã qua phân tích AI</p>
                </div>
                <button
                  onClick={fetchAllData}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Cập nhật danh sách</span>
                </button>
              </div>

              {/* Combined History Timeline Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 font-extrabold border-b border-slate-200">
                      <th className="p-4">Thời gian</th>
                      <th className="p-4">Phân hệ</th>
                      <th className="p-4">Tên hồ sơ / Hoạt động</th>
                      <th className="p-4">Định dạng</th>
                      <th className="p-4">Kết quả xử lý AI</th>
                      <th className="p-4 text-right">Thao tác nhanh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Combine lists */}
                    {[
                      ...documents.map(d => ({ ...d, type: 'Số hóa hồ sơ', icon: <FileText className="w-4 h-4 text-blue-600" />, label: d.metadata.docType, date: d.digitizedAt })),
                      ...reports.map(r => ({ ...r, type: 'Báo cáo thông minh', icon: <BarChart3 className="w-4 h-4 text-emerald-600" />, label: 'Báo cáo Excel', date: r.uploadedAt })),
                      ...meetings.map(m => ({ ...m, type: 'Cuộc họp số', icon: <Mic className="w-4 h-4 text-purple-600" />, label: 'Ghi âm cuộc họp', date: m.uploadedAt }))
                    ]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50 bg-white">
                        <td className="p-4 font-mono text-slate-500 font-bold">
                          {new Date(item.date).toLocaleString('vi-VN')}
                        </td>
                        <td className="p-4 font-bold text-slate-700">
                          <div className="flex items-center space-x-2">
                            {item.icon}
                            <span>{item.type}</span>
                          </div>
                        </td>
                        <td className="p-4 font-bold text-slate-800">
                          {item.originalName}
                        </td>
                        <td className="p-4">
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-extrabold px-2 py-1 rounded-md">
                            {item.label}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full flex items-center space-x-1 w-max">
                            <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full"></span>
                            <span>Hoàn thành tốt</span>
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => {
                              if (item.type === 'Số hóa hồ sơ') {
                                setSelectedDoc(item);
                                setActiveTab('digitize');
                              } else if (item.type === 'Báo cáo thông minh') {
                                setSelectedReportId(item.id);
                                setActiveTab('report');
                              } else if (item.type === 'Cuộc họp số') {
                                setSelectedMeetingId(item.id);
                                setActiveTab('meeting');
                              }
                            }}
                            className="bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 font-extrabold px-3 py-1.5 rounded-lg transition text-[11px]"
                          >
                            Xem chi tiết
                          </button>
                        </td>
                      </tr>
                    ))}

                    {documents.length === 0 && reports.length === 0 && meetings.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-slate-400">
                          Chưa có nhật ký hoạt động nghiệp vụ hành chính nào. Hãy bắt đầu số hóa tài liệu.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==================== 7. SETTINGS VIEW ==================== */}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 max-w-2xl mx-auto" id="view-settings">
              <div className="border-b border-slate-200 pb-4 mb-6">
                <h3 className="font-extrabold text-slate-800 text-base">Cài đặt Cấu hình & Bảo mật</h3>
                <p className="text-xs text-slate-400 mt-1">Cấu hình API Key Gemini cá nhân và định danh cơ quan làm việc phục vụ văn bản</p>
              </div>

              {/* Form Settings */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = e.target as any;
                  handleSaveSettings(target.apiKey.value, target.displayName.value, target.agencyName.value);
                }}
                className="space-y-5"
              >
                {/* API Key settings */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Khóa API Key Gemini Cá Nhân (Bắt buộc cho dịch vụ AI thật)</label>
                  <input
                    type="password"
                    name="apiKey"
                    defaultValue={apiKey}
                    placeholder="Nhập khóa API Key của bạn (ví dụ: AIzaSy...)"
                    className="w-full text-xs font-bold border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white outline-none focus:ring-1 focus:ring-blue-500 transition"
                  />
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    Khóa API Key sẽ được mã hóa và lưu trữ an toàn trong <strong>LocalStorage</strong> của trình duyệt cá nhân, không tải lên bên thứ ba bất kỳ ngoại trừ dịch vụ trí tuệ nhân tạo Gemini để phục vụ OCR, dịch, sinh và tóm tắt văn bản.
                  </p>
                </div>

                {/* Account Display name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Tên hiển thị cán bộ / chuyên viên</label>
                  <input
                    type="text"
                    name="displayName"
                    defaultValue={displayName}
                    placeholder="Nguyễn Văn A"
                    required
                    className="w-full text-xs font-bold border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white outline-none transition"
                  />
                </div>

                {/* Agency Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Đơn vị hành chính / Cơ quan công tác</label>
                  <input
                    type="text"
                    name="agencyName"
                    defaultValue={agencyName}
                    placeholder="Văn phòng Ủy ban Nhân dân Huyện..."
                    required
                    className="w-full text-xs font-bold border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white outline-none transition"
                  />
                </div>

                {/* Notice box */}
                <div className="bg-blue-50 border border-blue-100 text-blue-900 rounded-xl p-4 text-xs leading-relaxed font-medium">
                  💡 <strong>Gợi ý:</strong> Để lấy được API Key Gemini miễn phí hoặc có trả phí, cán bộ truy cập cổng thông tin phát triển của Google AI Studio (ai.google.dev), tạo khóa mới và dán vào ô cấu hình phía trên để trải nghiệm dịch vụ AI mượt mà nhất.
                </div>

                {/* Submit */}
                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-6 py-3 rounded-xl transition shadow-md"
                  >
                    Lưu thay đổi hệ thống
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}