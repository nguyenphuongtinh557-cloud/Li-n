/**
 * api/ai-question-history.js — AI Question Generation History API
 * 
 * CRUD operations for user's AI-generated question history
 * Stored in Firestore collection 'aiQuestionHistory'
 * 
 * Security: Users can only access their own history (by userId/email)
 *           Admins can view all
 */

import admin from 'firebase-admin';
import { getAdminEmails } from '../lib/adminAccess.js';

const COLLECTION_NAME = 'aiQuestionHistory';

/**
 * Helper: Send JSON response
 */
function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

/**
 * Get Firebase config and initialize
 */
function getConfig() {
  const firebaseServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  
  if (!firebaseServiceAccount || !firebaseServiceAccount.trim()) {
    return {
      ok: false,
      reason: 'missing-firebase-config',
      message: 'FIREBASE_SERVICE_ACCOUNT_JSON environment variable not set'
    };
  }
  
  try {
    return {
      ok: true,
      serviceAccount: JSON.parse(firebaseServiceAccount)
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid-firebase-config',
      message: error instanceof Error ? error.message : String(error)
    };
  }
}


/**
 * Initialize Firebase Admin if not already initialized
 */
function getFirebaseApp(serviceAccount) {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  return admin.app();
}

/**
 * Verify Firebase ID token and extract user info
 */
async function verifyUser(req, serviceAccount) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  
  if (!token) {
    throw Object.assign(new Error('missing-auth-token'), { status: 401 });
  }
  
  getFirebaseApp(serviceAccount);
  
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const email = String(decoded.email || '').trim().toLowerCase();
    const isAdmin = decoded.email_verified && getAdminEmails().includes(email);
    
    return {
      uid: decoded.uid,
      email,
      isAdmin,
      emailVerified: decoded.email_verified
    };
  } catch (error) {
    console.error('[AI History API] Token verification failed:', error);
    throw Object.assign(new Error('invalid-token'), { status: 401 });
  }
}

/**
 * Check if user owns the resource
 */
function checkOwnership(user, resourceUserId, resourceEmail) {
  if (user.isAdmin) return true; // Admins can access all
  
  // User can access if their uid or email matches
  return user.uid === resourceUserId || 
         user.email === resourceEmail?.toLowerCase();
}

/**
 * Get Firestore collection reference
 */
function getCollection(serviceAccount) {
  const app = getFirebaseApp(serviceAccount);
  return admin.firestore(app).collection(COLLECTION_NAME);
}

/**
 * Sanitize document data (remove undefined, limit size)
 */
function sanitizeDocument(data) {
  const sanitized = JSON.parse(JSON.stringify(data)); // Remove undefined
  
  // Limit questions array size for storage
  if (sanitized.questions && Array.isArray(sanitized.questions)) {
    if (sanitized.questions.length > 500) {
      sanitized.questions = sanitized.questions.slice(0, 500);
      sanitized.stats = sanitized.stats || {};
      sanitized.stats.truncated = true;
    }
  }
  
  return sanitized;
}

/**
 * Main API handler
 */
export default async function handler(req, res) {
  // CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    // Get and validate config
    const configResult = getConfig();
    if (!configResult.ok) {
      return json(res, 503, {
        ok: false,
        error: configResult.reason,
        message: configResult.message || 'Firebase configuration not available'
      });
    }
    
    const { serviceAccount } = configResult;
    
    // Verify user authentication
    let user;
    try {
      user = await verifyUser(req, serviceAccount);
    } catch (error) {
      return json(res, error.status || 401, {
        ok: false,
        error: error.message,
        message: 'Authentication required'
      });
    }
    
    // Route to appropriate handler
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res, user, serviceAccount);
      case 'POST':
        return await handleCreate(req, res, user, serviceAccount);
      case 'PUT':
        return await handleUpdate(req, res, user, serviceAccount);
      case 'DELETE':
        return await handleDelete(req, res, user, serviceAccount);
      default:
        return json(res, 405, {
          ok: false,
          error: 'method-not-allowed',
          message: `Method ${req.method} not allowed`
        });
    }
  } catch (error) {
    console.error('[AI History API] Unhandled error:', error);
    return json(res, 500, {
      ok: false,
      error: 'internal-error',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * GET handler: List history or get single item
 */
async function handleGet(req, res, user, serviceAccount) {
  const { id, userId, limit = '20', offset = '0' } = req.query || {};
  const collection = getCollection(serviceAccount);
  
  try {
    // Get single item by ID
    if (id) {
      const doc = await collection.doc(id).get();
      
      if (!doc.exists) {
        return json(res, 404, {
          ok: false,
          error: 'not-found',
          message: 'History item not found'
        });
      }
      
      const data = doc.data();
      
      // Check ownership
      if (!checkOwnership(user, data.userId, data.userEmail)) {
        return json(res, 403, {
          ok: false,
          error: 'forbidden',
          message: 'You do not have permission to access this resource'
        });
      }
      
      return json(res, 200, {
        ok: true,
        item: { id: doc.id, ...data }
      });
    }
    
    // List items
    const targetUserId = userId || user.uid;
    
    // Non-admins can only list their own
    if (!user.isAdmin && targetUserId !== user.uid) {
      return json(res, 403, {
        ok: false,
        error: 'forbidden',
        message: 'You can only access your own history'
      });
    }
    
    let query = collection;
    
    // Filter by userId unless admin requesting all
    if (targetUserId || !user.isAdmin) {
      query = query.where('userId', '==', targetUserId);
    }
    
    // Order by creation date (newest first)
    query = query.orderBy('createdAt', 'desc');
    
    // Pagination
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offsetNum = parseInt(offset) || 0;
    
    query = query.limit(limitNum + 1); // +1 to check if more exists
    if (offsetNum > 0) {
      query = query.offset(offsetNum);
    }
    
    const snapshot = await query.get();
    const items = [];
    
    snapshot.forEach(doc => {
      if (items.length < limitNum) {
        items.push({ id: doc.id, ...doc.data() });
      }
    });
    
    const hasMore = snapshot.size > limitNum;
    
    return json(res, 200, {
      ok: true,
      items,
      total: items.length,
      hasMore,
      offset: offsetNum,
      limit: limitNum
    });
    
  } catch (error) {
    console.error('[AI History API] GET error:', error);
    return json(res, 500, {
      ok: false,
      error: 'read-failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * POST handler: Create new history entry
 */
async function handleCreate(req, res, user, serviceAccount) {
  try {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return json(res, 400, {
        ok: false,
        error: 'invalid-json',
        message: 'Request body must be valid JSON'
      });
    }
    
    // Validate required fields
    if (!body.source || !body.generationConfig || !Array.isArray(body.questions)) {
      return json(res, 400, {
        ok: false,
        error: 'invalid-data',
        message: 'Missing required fields: source, generationConfig, questions'
      });
    }
    
    const collection = getCollection(serviceAccount);
    const now = new Date().toISOString();
    
    // Build document
    const docData = sanitizeDocument({
      userId: user.uid,
      userEmail: user.email,
      createdAt: now,
      updatedAt: now,
      status: body.status || 'draft',
      source: body.source,
      generationConfig: body.generationConfig,
      questions: body.questions,
      stats: body.stats || {
        totalGenerated: body.questions.length,
        validQuestions: body.questions.length,
        savedToBank: 0,
        duplicatesFound: 0,
        userEdits: 0
      }
    });
    
    // Create document
    const docRef = await collection.add(docData);
    
    return json(res, 201, {
      ok: true,
      id: docRef.id,
      item: { id: docRef.id, ...docData }
    });
    
  } catch (error) {
    console.error('[AI History API] CREATE error:', error);
    return json(res, 500, {
      ok: false,
      error: 'create-failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * PUT handler: Update existing history entry
 */
async function handleUpdate(req, res, user, serviceAccount) {
  try {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return json(res, 400, {
        ok: false,
        error: 'invalid-json',
        message: 'Request body must be valid JSON'
      });
    }
    
    const { id, updates } = body;
    
    if (!id || !updates) {
      return json(res, 400, {
        ok: false,
        error: 'invalid-data',
        message: 'Missing required fields: id, updates'
      });
    }
    
    const collection = getCollection(serviceAccount);
    const docRef = collection.doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return json(res, 404, {
        ok: false,
        error: 'not-found',
        message: 'History item not found'
      });
    }
    
    const data = doc.data();
    
    // Check ownership
    if (!checkOwnership(user, data.userId, data.userEmail)) {
      return json(res, 403, {
        ok: false,
        error: 'forbidden',
        message: 'You do not have permission to modify this resource'
      });
    }
    
    // Sanitize updates (don't allow changing userId/userEmail)
    const sanitizedUpdates = sanitizeDocument({
      ...updates,
      updatedAt: new Date().toISOString()
    });
    
    delete sanitizedUpdates.userId;
    delete sanitizedUpdates.userEmail;
    delete sanitizedUpdates.createdAt;
    
    // Update document
    await docRef.update(sanitizedUpdates);
    
    // Get updated document
    const updated = await docRef.get();
    
    return json(res, 200, {
      ok: true,
      item: { id: doc.id, ...updated.data() }
    });
    
  } catch (error) {
    console.error('[AI History API] UPDATE error:', error);
    return json(res, 500, {
      ok: false,
      error: 'update-failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * DELETE handler: Remove history entry
 */
async function handleDelete(req, res, user, serviceAccount) {
  const { id } = req.query || {};
  
  if (!id) {
    return json(res, 400, {
      ok: false,
      error: 'missing-id',
      message: 'Document ID is required'
    });
  }
  
  try {
    const collection = getCollection(serviceAccount);
    const docRef = collection.doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      return json(res, 404, {
        ok: false,
        error: 'not-found',
        message: 'History item not found'
      });
    }
    
    const data = doc.data();
    
    // Check ownership
    if (!checkOwnership(user, data.userId, data.userEmail)) {
      return json(res, 403, {
        ok: false,
        error: 'forbidden',
        message: 'You do not have permission to delete this resource'
      });
    }
    
    // Delete document
    await docRef.delete();
    
    return json(res, 200, {
      ok: true,
      message: 'History item deleted successfully'
    });
    
  } catch (error) {
    console.error('[AI History API] DELETE error:', error);
    return json(res, 500, {
      ok: false,
      error: 'delete-failed',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
