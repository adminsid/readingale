-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    sync_key TEXT UNIQUE,
    username TEXT UNIQUE,
    pin TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Library metadata table
CREATE TABLE IF NOT EXISTS library (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    pdf_id TEXT,
    name TEXT,
    last_read INTEGER,
    read_pages TEXT, -- JSON array of page numbers
    content TEXT, -- JSON array of extracted words
    has_binary INTEGER DEFAULT 0, -- Boolean: file exists in R2
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- User settings table
CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT PRIMARY KEY,
    data TEXT, -- JSON string of settings
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
