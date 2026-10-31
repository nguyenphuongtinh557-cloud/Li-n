/**
 * aiQuestionHistory.js — Frontend Service for AI Question Generation History
 * 
 * Provides CRUD operations for AI question history with:
 * - API communication with Firestore backend
 * - localStorage fallback for offline/unauthenticated users
 * - Caching for performance
 * - Sync between API and localStorage
 */

import { AuthModule } from './auth.js';

const API_ENDPOINT = '/api/ai-question-history';
const LOCAL_STORAGE_KEY = 'qlcl_ai_question_history_v1';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// In-memory cache per user
let cache = {
  uid: null, // Track which user this cache belongs to
  list: null,
  listTimestamp: 0,
  items: new Map() // id -> { data, timestamp }
};

/**
 * Clear cache if user changed
 */
function ensureCacheForCurrentUser() {
  const currentUid = currentUserId();
  if (cache.uid !== currentUid) {
    cache.uid = currentUid;
    cache.list = null;
    cache.listTimestamp = 0;
    cache.items.clear();
  }
}

/**
 * Get Firebase ID token for authentication
 */
async function getAuthToken() {
  try {
    const token = await AuthModule.getIdToken();
    return token || null;
  } catch (error) {
    console.warn('[AIQuestionHistory] Failed to get auth token:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
  return !!(AuthModule.user || AuthModule.getCurrentUser?.());
}

function currentUserId() {
  const user = AuthModule.user || AuthModule.getCurrentUser?.();
  return String(user?.uid || user?.email || '').trim();
}

/**
 * Make API request with authentication
 */
async function apiRequest(path, options = {}) {
  const token = await getAuthToken();
  
  if (!token) {
    throw new Error('Authentication required. Please sign in to use this feature.');
  }
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };
  
  const response = await fetch(`${API_ENDPOINT}${path}`, {
    ...options,
    headers
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.message || data.error || `API error: ${response.status}`);
  }
  
  return data;
}

/**
 * LocalStorage operations (fallback/cache)
 */
const LocalStorage = {
  getAll() {
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[AIQuestionHistory] LocalStorage read error:', error);
      return [];
    }
  },
  
  save(items) {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(items));
      return true;
    } catch (error) {
      console.error('[AIQuestionHistory] LocalStorage write error:', error);
      return false;
    }
  },
  
  add(item) {
    const items = this.getAll();
    items.unshift(item); // Add to beginning
    return this.save(items);
  },
  
  update(id, updates) {
    const items = this.getAll();
    const index = items.findIndex(item => item.id === id);
    
    if (index === -1) return false;
    
    items[index] = { ...items[index], ...updates, updatedAt: new Date().toISOString() };
    return this.save(items);
  },
  
  delete(id) {
    const items = this.getAll();
    const filtered = items.filter(item => item.id !== id);
    return this.save(filtered);
  },
  
  get(id) {
    const items = this.getAll();
    return items.find(item => item.id === id) || null;
  }
};

/**
 * Main API
 */
export const AIQuestionHistory = {
  /**
   * Create new history entry
   */
  async create(data) {
    ensureCacheForCurrentUser();
    
    const historyData = {
      source: data.source,
      generationConfig: data.generationConfig,
      questions: data.questions || [],
      status: data.status || 'draft',
      stats: data.stats || {
        totalGenerated: (data.questions || []).length,
        validQuestions: (data.questions || []).length,
        savedToBank: 0,
        duplicatesFound: 0,
        userEdits: 0
      }
    };
    
    if (!isAuthenticated() || !currentUserId()) {
      return { ok: false, error: 'authentication-required', message: 'Vui lòng đăng nhập để lưu lịch sử theo tài khoản.' };
    }

    try {
      
      // API call for authenticated users
      const result = await apiRequest('', {
        method: 'POST',
        body: JSON.stringify(historyData)
      });
      
      // Also save to localStorage as backup
      LocalStorage.add(result.item);
      
      // Clear list cache
      cache.list = null;
      
      return { ...result, source: 'api' };
      
    } catch (error) {
      console.error('[AIQuestionHistory] Create error:', error);
      
      // Fallback to localStorage on API error
      const localItem = {
        id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: currentUserId(),
        userEmail: AuthModule.user?.email || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...historyData
      };
      
      LocalStorage.add(localItem);
      
      return {
        ok: true,
        id: localItem.id,
        item: localItem,
        source: 'local',
        warning: error.message
      };
    }
  },
  
  /**
   * Get single item by ID
   */
  async get(id) {
    ensureCacheForCurrentUser();
    
    // Check cache first
    const cached = cache.items.get(id);
    if (cached && (Date.now() - cached.timestamp < CACHE_DURATION)) {
      return { ok: true, item: cached.data, source: 'cache' };
    }
    
    try {
      if (!isAuthenticated() || id.startsWith('local_')) {
        // Get from localStorage
        const item = LocalStorage.get(id);
        if (!item) {
          return { ok: false, error: 'not-found', message: 'Item not found' };
        }
        
        // Update cache
        cache.items.set(id, { data: item, timestamp: Date.now() });
        
        return { ok: true, item, source: 'local' };
      }
      
      // API call
      const result = await apiRequest(`?id=${encodeURIComponent(id)}`);
      
      // Update cache
      cache.items.set(id, { data: result.item, timestamp: Date.now() });
      
      // Also save to localStorage
      LocalStorage.update(id, result.item);
      
      return { ...result, source: 'api' };
      
    } catch (error) {
      console.error('[AIQuestionHistory] Get error:', error);
      
      // Fallback to localStorage
      const item = LocalStorage.get(id);
      if (item) {
        return { ok: true, item, source: 'local', warning: error.message };
      }
      
      return { ok: false, error: error.message };
    }
  },
  
  /**
   * List history items
   */
  async list(options = {}) {
    ensureCacheForCurrentUser();
    
    const { limit = 20, offset = 0, forceRefresh = false } = options;
    
    // Check cache
    if (!forceRefresh && cache.list && (Date.now() - cache.listTimestamp < CACHE_DURATION)) {
      const start = offset;
      const end = offset + limit;
      return {
        ok: true,
        items: cache.list.slice(start, end),
        total: cache.list.length,
        hasMore: end < cache.list.length,
        source: 'cache'
      };
    }
    
    try {
      if (!isAuthenticated()) {
        // Local records are scoped to the signed-in account and hidden when signed out.
        const userId = currentUserId();
        const items = userId ? LocalStorage.getAll().filter(item => item.userId === userId) : [];
        
        // Sort by createdAt desc
        items.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        
        // Update cache
        cache.list = items;
        cache.listTimestamp = Date.now();
        
        const start = offset;
        const end = offset + limit;
        
        return {
          ok: true,
          items: items.slice(start, end),
          total: items.length,
          hasMore: end < items.length,
          source: 'local'
        };
      }
      
      // API call
      const result = await apiRequest(
        `?limit=${limit}&offset=${offset}`
      );
      
      // Update cache (only if offset is 0, for simplicity)
      if (offset === 0) {
        cache.list = result.items;
        cache.listTimestamp = Date.now();
      }
      
      // Sync to localStorage
      result.items.forEach(item => {
        const existing = LocalStorage.get(item.id);
        if (!existing || new Date(item.updatedAt) > new Date(existing.updatedAt)) {
          LocalStorage.update(item.id, item);
        }
      });
      
      return { ...result, source: 'api' };
      
    } catch (error) {
      console.error('[AIQuestionHistory] List error:', error);
      
      // Fallback to localStorage
      const userId = currentUserId();
      const items = userId ? LocalStorage.getAll().filter(item => item.userId === userId) : [];
      items.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      
      const start = offset;
      const end = offset + limit;
      
      return {
        ok: true,
        items: items.slice(start, end),
        total: items.length,
        hasMore: end < items.length,
        source: 'local',
        warning: error.message
      };
    }
  },
  
  /**
   * Update existing item
   */
  async update(id, updates) {
    ensureCacheForCurrentUser();
    
    try {
      if (!isAuthenticated() || id.startsWith('local_')) {
        // Update in localStorage
        const success = LocalStorage.update(id, updates);
        
        if (!success) {
          return { ok: false, error: 'not-found', message: 'Item not found' };
        }
        
        const item = LocalStorage.get(id);
        
        // Clear caches
        cache.list = null;
        cache.items.delete(id);
        
        return { ok: true, item, source: 'local' };
      }
      
      // API call
      const result = await apiRequest('', {
        method: 'PUT',
        body: JSON.stringify({ id, updates })
      });
      
      // Update localStorage
      LocalStorage.update(id, result.item);
      
      // Clear caches
      cache.list = null;
      cache.items.delete(id);
      
      return { ...result, source: 'api' };
      
    } catch (error) {
      console.error('[AIQuestionHistory] Update error:', error);
      
      // Try localStorage fallback
      const success = LocalStorage.update(id, updates);
      if (success) {
        const item = LocalStorage.get(id);
        cache.list = null;
        cache.items.delete(id);
        return { ok: true, item, source: 'local', warning: error.message };
      }
      
      return { ok: false, error: error.message };
    }
  },
  
  /**
   * Delete item
   */
  async delete(id) {
    ensureCacheForCurrentUser();
    
    try {
      if (!isAuthenticated() || id.startsWith('local_')) {
        // Delete from localStorage
        const success = LocalStorage.delete(id);
        
        if (!success) {
          return { ok: false, error: 'not-found', message: 'Item not found' };
        }
        
        // Clear caches
        cache.list = null;
        cache.items.delete(id);
        
        return { ok: true, source: 'local' };
      }
      
      // API call
      const result = await apiRequest(`?id=${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      
      // Delete from localStorage
      LocalStorage.delete(id);
      
      // Clear caches
      cache.list = null;
      cache.items.delete(id);
      
      return { ...result, source: 'api' };
      
    } catch (error) {
      console.error('[AIQuestionHistory] Delete error:', error);
      
      // Try localStorage fallback
      const success = LocalStorage.delete(id);
      if (success) {
        cache.list = null;
        cache.items.delete(id);
        return { ok: true, source: 'local', warning: error.message };
      }
      
      return { ok: false, error: error.message };
    }
  },
  
  /**
   * Mark questions as saved to bank
   */
  async markSavedToBank(historyId, questionIds, bankQuestionIds) {
    const item = await this.get(historyId);
    
    if (!item.ok) {
      return item;
    }
    
    // Update questions with bankQuestionId
    const questions = item.item.questions.map(q => {
      const index = questionIds.indexOf(questions.indexOf(q));
      if (index !== -1 && bankQuestionIds[index]) {
        return { ...q, bankQuestionId: bankQuestionIds[index] };
      }
      return q;
    });
    
    // Update stats
    const stats = {
      ...item.item.stats,
      savedToBank: (item.item.stats.savedToBank || 0) + questionIds.length
    };
    
    return await this.update(historyId, {
      questions,
      stats,
      status: 'saved_to_bank'
    });
  },
  
  /**
   * Get statistics for user
   */
  async getStats() {
    const list = await this.list({ limit: 1000 });
    
    if (!list.ok) {
      return { ok: false, error: list.error };
    }
    
    const stats = {
      totalHistories: list.items.length,
      totalQuestionsGenerated: 0,
      totalSavedToBank: 0,
      byStatus: { draft: 0, reviewed: 0, saved_to_bank: 0 },
      bySubject: {}
    };
    
    list.items.forEach(item => {
      stats.totalQuestionsGenerated += item.stats?.totalGenerated || 0;
      stats.totalSavedToBank += item.stats?.savedToBank || 0;
      stats.byStatus[item.status] = (stats.byStatus[item.status] || 0) + 1;
      
      const subject = item.generationConfig?.subjectName || 'Unknown';
      stats.bySubject[subject] = (stats.bySubject[subject] || 0) + 1;
    });
    
    return { ok: true, stats };
  },
  
  /**
   * Clear cache (force refresh on next request)
   */
  clearCache() {
    cache.list = null;
    cache.listTimestamp = 0;
    cache.items.clear();
  },
  
  /**
   * Export for backup
   */
  exportAll() {
    return LocalStorage.getAll();
  },
  
  /**
   * Import from backup
   */
  importAll(items) {
    return LocalStorage.save(items);
  }
};

// Expose globally for debugging
if (typeof window !== 'undefined') {
  window.AIQuestionHistory = AIQuestionHistory;
}
