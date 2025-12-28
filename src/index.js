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

    if (url.pathname === '/api/sync' && method === 'POST') {
        return handleSync(request, env);
    }

    if (url.pathname === '/api/health') {
        return new Response(JSON.stringify({ status: 'ok', db: !!env.DB }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response('Not Found', { status: 404 });
}

async function handleSync(request, env) {
    try {
        const { syncKey, settings, library } = await request.json();

        if (!syncKey) {
            return new Response(JSON.stringify({ error: 'Sync key required' }), { status: 400 });
        }

        // 1. Get or Create user
        let user = await env.DB.prepare('SELECT id FROM users WHERE sync_key = ?')
            .bind(syncKey)
            .first();

        let userId;
        if (!user) {
            userId = crypto.randomUUID();
            await env.DB.prepare('INSERT INTO users (id, sync_key) VALUES (?, ?)')
                .bind(userId, syncKey)
                .run();
        } else {
            userId = user.id;
        }

        // 2. Sync Settings (Upsert)
        if (settings) {
            await env.DB.prepare('INSERT INTO settings (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP')
                .bind(userId, JSON.stringify(settings))
                .run();
        }

        // 3. Sync Library (PDF metadata & Extracted Text)
        if (library && Array.isArray(library)) {
            for (const item of library) {
                // Fetch existing item to check lastRead
                const existing = await env.DB.prepare('SELECT last_read FROM library WHERE id = ?')
                    .bind(item.id)
                    .first();

                if (!existing || item.lastRead > existing.last_read) {
                    await env.DB.prepare(`
                        INSERT INTO library (id, user_id, pdf_id, name, last_read, read_pages, content) 
                        VALUES (?, ?, ?, ?, ?, ?, ?) 
                        ON CONFLICT(id) DO UPDATE SET 
                            last_read = excluded.last_read, 
                            read_pages = excluded.read_pages, 
                            content = COALESCE(excluded.content, library.content),
                            updated_at = CURRENT_TIMESTAMP
                    `)
                    .bind(item.id, userId, item.pdfId || item.id, item.name, item.lastRead, JSON.stringify(item.readPages), item.content ? JSON.stringify(item.content) : null)
                    .run();
                }
            }
        }

        // 4. Fetch the latest state to return (the "Source of Truth")
        const latestSettings = await env.DB.prepare('SELECT data FROM settings WHERE user_id = ?')
            .bind(userId)
            .first();
        
        const latestLibrary = await env.DB.prepare('SELECT * FROM library WHERE user_id = ?')
            .bind(userId)
            .all();

        return new Response(JSON.stringify({
            success: true,
            userId,
            settings: latestSettings ? JSON.parse(latestSettings.data) : null,
            library: latestLibrary.results.map(item => ({
                id: item.id,
                name: item.name,
                lastRead: item.last_read,
                readPages: JSON.parse(item.read_pages),
                content: item.content ? JSON.parse(item.content) : null
            }))
        }), {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
}
