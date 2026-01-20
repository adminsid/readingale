export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // API endpoints
        if (url.pathname.startsWith('/api/')) {
            return handleApi(request, env);
        }

        // Default to asset serving
        return env.ASSETS.fetch(request);
    },
};

async function handleApi(request, env) {
    const url = new URL(request.url);
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
        });
    }

    if (url.pathname.startsWith('/api/auth/') && method === 'POST') {
        return handleAuth(request, env);
    }

    if (url.pathname.startsWith('/api/books')) {
        return handleBooks(request, env);
    }

    if (url.pathname.startsWith('/api/settings')) {
        return handleSettings(request, env);
    }

    if (url.pathname.startsWith('/api/assets/upload') && method === 'POST') {
        return handleAssetUpload(request, env);
    }

    if (url.pathname.startsWith('/api/assets/download/') && method === 'GET') {
        return handleAssetDownload(request, env);
    }

    if (url.pathname === '/api/health') {
        return new Response(JSON.stringify({ status: 'ok', db: !!env.DB, bucket: !!env.BUCKET }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response('Not Found', { status: 404 });
}

async function handleAuth(request, env) {
    const url = new URL(request.url);
    try {
        const { username, pin } = await request.json();

        if (!username || !pin || pin.length !== 4) {
            return new Response(JSON.stringify({ error: 'Valid username and 4-digit PIN required' }), { status: 400 });
        }

        if (url.pathname === '/api/auth/signup') {
            const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
            if (existing) {
                return new Response(JSON.stringify({ error: 'Username already taken' }), { status: 409 });
            }

            const userId = crypto.randomUUID();
            const syncKey = crypto.randomUUID().slice(0, 8); // Used as API Token

            await env.DB.prepare('INSERT INTO users (id, username, pin, sync_key) VALUES (?, ?, ?, ?)')
                .bind(userId, username, pin, syncKey)
                .run();

            return new Response(JSON.stringify({ success: true, token: syncKey, username }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (url.pathname === '/api/auth/login') {
            const user = await env.DB.prepare('SELECT sync_key, username FROM users WHERE username = ? AND pin = ?')
                .bind(username, pin)
                .first();

            if (!user) {
                return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 });
            }

            return new Response(JSON.stringify({ success: true, token: user.sync_key, username: user.username }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response('Auth Endpoint Not Found', { status: 404 });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}

async function authenticate(request, env) {
    const token = request.headers.get('Authorization');
    if (!token) return null;
    return await env.DB.prepare('SELECT id FROM users WHERE sync_key = ?').bind(token).first();
}

async function handleBooks(request, env) {
    const user = await authenticate(request, env);
    if (!user) return new Response('Unauthorized', { status: 401 });

    const url = new URL(request.url);
    const method = request.method;

    try {
        // GET /api/books - List all books
        if (method === 'GET') {
            const books = await env.DB.prepare('SELECT * FROM library WHERE user_id = ? ORDER BY updated_at DESC')
                .bind(user.id)
                .all();
            
            return new Response(JSON.stringify({
                success: true,
                library: books.results.map(item => ({
                    id: item.id,
                    name: item.name,
                    lastRead: item.last_read,
                    readPages: JSON.parse(item.read_pages),
                    content: item.content ? JSON.parse(item.content) : null,
                    hasBinary: !!item.has_binary
                }))
            }), { headers: { 'Content-Type': 'application/json' } });
        }

        // POST /api/books - Add new book
        if (method === 'POST') {
            const item = await request.json();
             await env.DB.prepare(`
                INSERT INTO library (id, user_id, pdf_id, name, last_read, read_pages, content, has_binary) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) 
                ON CONFLICT(id) DO UPDATE SET 
                    last_read = excluded.last_read, 
                    read_pages = excluded.read_pages, 
                    content = COALESCE(excluded.content, library.content),
                    updated_at = CURRENT_TIMESTAMP
            `)
            .bind(item.id, user.id, item.pdfId || item.id, item.name, item.lastRead, JSON.stringify(item.readPages), item.content ? JSON.stringify(item.content) : null, 0)
            .run();

            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        // PUT /api/books/:id - Update progress
        if (method === 'PUT') {
            const id = url.pathname.split('/').pop();
            const { lastRead, readPages } = await request.json();
            
            await env.DB.prepare('UPDATE library SET last_read = ?, read_pages = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
                .bind(lastRead, JSON.stringify(readPages), id, user.id)
                .run();
                
            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        // DELETE /api/books/:id
        if (method === 'DELETE') {
            const id = url.pathname.split('/').pop();
            
            // Also need to delete from BUCKET if exists?
            // Realistically we should, but for now let's just delete metadata
            await env.DB.prepare('DELETE FROM library WHERE id = ? AND user_id = ?')
                .bind(id, user.id)
                .run();

            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        }

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
    
    return new Response('Method not allowed', { status: 405 });
}

async function handleSettings(request, env) {
    const user = await authenticate(request, env);
    if (!user) return new Response('Unauthorized', { status: 401 });

    const method = request.method;

    try {
        if (method === 'GET') {
            const settings = await env.DB.prepare('SELECT data FROM settings WHERE user_id = ?').bind(user.id).first();
            return new Response(JSON.stringify({
                success: true,
                settings: settings ? JSON.parse(settings.data) : null
            }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (method === 'PUT') {
            const data = await request.json();
            await env.DB.prepare('INSERT INTO settings (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP')
                .bind(user.id, JSON.stringify(data))
                .run();
            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        }

    } catch (err) {
         return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }

    return new Response('Method not allowed', { status: 405 });
}

async function handleAssetUpload(request, env) {
    try {
        const formData = await request.formData();
        const file = formData.get('file');
        const id = formData.get('id');
        const token = formData.get('token'); // Changed from syncKey to token

        if (!file || !id || !token) {
            return new Response('Missing required fields', { status: 400 });
        }

        // Verify user
        const user = await env.DB.prepare('SELECT id FROM users WHERE sync_key = ?').bind(token).first();
        if (!user) return new Response('Unauthorized', { status: 401 });

        // Upload to R2
        await env.BUCKET.put(`assets/${id}`, await file.arrayBuffer(), {
            httpMetadata: { contentType: file.type }
        });

        // Update D1 only for PDFs
        if (id.startsWith('pdf_')) {
            await env.DB.prepare('UPDATE library SET has_binary = 1 WHERE id = ? AND user_id = ?')
                .bind(id, user.id)
                .run();
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(err.message, { status: 500 });
    }
}

async function handleAssetDownload(request, env) {
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();

    if (!id) return new Response('ID missing', { status: 400 });

    const object = await env.BUCKET.get(`assets/${id}`);

    if (!object) return new Response('Not Found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Access-Control-Allow-Origin', '*'); // Allow CORS for assets

    return new Response(object.body, { headers });
}
