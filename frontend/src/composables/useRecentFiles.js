import { useStorage } from '@vueuse/core';

// Shared state cho recent files
const recentFiles = useStorage('recentFiles', []);
const MAX_RECENT_FILES = 10;

export function useRecentFiles() {
  // Thêm file vào danh sách recent
  const addRecentFile = (fileInfo) => {
    if (!fileInfo || !fileInfo.name) {
      console.warn('Invalid file info:', fileInfo);
      return;
    }

    const newFile = {
      name: fileInfo.name,
      title: fileInfo.title || fileInfo.name,
      mime_type: fileInfo.mime_type,
      file_ext: fileInfo.file_ext,
      modified: fileInfo.modified || new Date().toISOString(),
      owner: fileInfo.owner,
      is_group: fileInfo.is_group,
      accessedAt: new Date().toISOString(),
    };

    // Tìm xem file đã có trong danh sách chưa
    const existingIndex = recentFiles.value.findIndex(f => f.name === newFile.name);

    if (existingIndex !== -1) {
      // File đã có trong danh sách - cập nhật tại chỗ (giữ nguyên vị trí)
      recentFiles.value[existingIndex] = newFile;
    } else {
      // File mới - thêm vào đầu danh sách
      recentFiles.value = [newFile, ...recentFiles.value].slice(0, MAX_RECENT_FILES);
    }
  };

  // Xóa một file khỏi danh sách
  const removeRecentFile = (fileName) => {
    recentFiles.value = recentFiles.value.filter(f => f.name !== fileName);
  };

  // Xóa tất cả
  const clearRecentFiles = () => {
    recentFiles.value = [];
  };

  // Get file icon based on mime type
  const getFileIcon = (file) => {
    if (!file) return 'file';
    
    const mimeType = file.mime_type || '';
    const fileExt = file.file_ext || '';
    
    // Images
    if (mimeType.startsWith('image/')) return 'image';
    
    // Documents
    if (mimeType.includes('pdf')) return 'file-text';
    if (mimeType.includes('word') || fileExt === 'docx' || fileExt === 'doc') return 'file-text';
    if (mimeType.includes('excel') || fileExt === 'xlsx' || fileExt === 'xls') return 'file-spreadsheet';
    if (mimeType.includes('powerpoint') || fileExt === 'pptx' || fileExt === 'ppt') return 'file-presentation';
    
    // Text
    if (mimeType.startsWith('text/')) return 'file-text';
    
    // Video
    if (mimeType.startsWith('video/')) return 'video';
    
    // Audio
    if (mimeType.startsWith('audio/')) return 'music';
    
    // Archive
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(fileExt)) return 'archive';
    
    // Default
    return 'file';
  };

  return {
    recentFiles,
    addRecentFile,
    removeRecentFile,
    clearRecentFiles,
    getFileIcon,
  };
}

